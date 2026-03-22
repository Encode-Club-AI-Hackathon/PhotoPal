const { AGENT_API_BASE_URL, getAgentRequestHeaders } = require("../../config/agent_api");
const { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLE_ID } = require("../../config/maps");

const app = getApp();
const MATCH_TIMEOUT_MS = 420000;
const SENT_STATE_STORAGE_KEY = "outreachSentByPhotographer";
const DRAFT_STATE_STORAGE_KEY = "outreachDraftByPhotographer";

Page({
  data: {
    title: "Suggested Opportunities",
    allLeads: [],
    leads: [],
    activeTab: "todo",
    skeletonRows: [1, 2, 3],
    todoCount: 0,
    doneCount: 0,
    activeContactLeadKey: "",
    writingLeadKeys: {},
    bulkWriting: false,
    sendingLeadKey: "",
    loading: false,
    refreshing: false,
    errorMessage: "",
    statusMessage: "",
  },
  onLoad: function () {
    this.fetchSuggestedLeads();
  },
  applyLeadFilter: function () {
    const allLeads = Array.isArray(this.data.allLeads) ? this.data.allLeads : [];
    const todoLeads = allLeads.filter((lead) => !lead.emailSent && !lead.draftSaved);
    const doneLeads = allLeads.filter((lead) => !!lead.emailSent || !!lead.draftSaved);
    const leads = this.data.activeTab === "done" ? doneLeads : todoLeads;

    const activeContactLeadKey = leads.some((lead) => lead.leadKey === this.data.activeContactLeadKey) ? this.data.activeContactLeadKey : "";

    this.setData({
      leads,
      todoCount: todoLeads.length,
      doneCount: doneLeads.length,
      activeContactLeadKey,
    });
  },
  setActiveTab: function (event) {
    const nextTab = event.currentTarget.dataset.tab === "done" ? "done" : "todo";
    if (nextTab === this.data.activeTab) {
      return;
    }

    this.setData({
      activeTab: nextTab,
      activeContactLeadKey: "",
    });
    this.applyLeadFilter();
  },
  buildExcludedBusinessIds: function () {
    return (this.data.allLeads || []).map((lead) => Number(lead.id)).filter((id) => !Number.isNaN(id));
  },
  fetchSuggestedLeads: function (options) {
    const forceRefresh = !!(options && options.forceRefresh);

    if (!AGENT_API_BASE_URL) {
      this.setData({
        errorMessage: "Set LUFFA_AGENT_API_BASE_URL in environment config first.",
      });
      return;
    }

    const wallet = (app && app.globalData && app.globalData.wallet) || wx.getStorageSync("wallet") || {};
    const photographerId = (wallet.uid || "").trim();
    const hasExistingLeads = Array.isArray(this.data.allLeads) && this.data.allLeads.length > 0;
    if (!photographerId) {
      this.setData({
        errorMessage: "Connect your wallet first to load local opportunities.",
      });
      return;
    }

    this.setData({
      loading: true,
      refreshing: forceRefresh && hasExistingLeads,
      errorMessage: "",
      statusMessage: forceRefresh ? "Finding more opportunities..." : "",
    });

    wx.request({
      url: `${AGENT_API_BASE_URL}/agents/business-matcher`,
      method: "POST",
      timeout: MATCH_TIMEOUT_MS,
      header: getAgentRequestHeaders(),
      data: {
        photographer_id: photographerId,
        radius_km: 20,
        limit: 5,
        use_cache: !forceRefresh,
        excluded_business_ids: forceRefresh ? this.buildExcludedBusinessIds() : [],
      },
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const detail = res && res.data && (res.data.detail || res.data.error);
          if (forceRefresh && hasExistingLeads) {
            this.setData({
              statusMessage: detail || "Unable to load more opportunities right now.",
            });
            return;
          }

          this.setData({
            errorMessage: detail || "Unable to load suggested opportunities.",
          });
          return;
        }

        const payload = res.data || {};
        const matches = Array.isArray(payload.matches) ? payload.matches : [];
        const sentMap = this.getSentStateMap();
        const draftMap = this.getDraftStateMap();
        const fetchedLeads = matches.map((item, index) => {
          const business = item.business || {};
          const outreach = item.outreach_email || {};
          const location = this.parseCoordinates(business.latitude, business.longitude);
          const fitScore = this.safeScore(item.fit_score);
          const stableBusinessId = business.id || item.business_id || `lead-${index}`;
          const sentAt = outreach.sent_at || sentMap[String(stableBusinessId)] || "";
          const draftSavedAt = draftMap[String(stableBusinessId)] || "";

          return {
            id: stableBusinessId,
            leadKey: `${business.id || item.business_id || "lead"}-${index}`,
            website: business.website || "",
            businessName: business.business_name || "Untitled Business",
            type: business.type || "General",
            contactName: business.contact_name || "",
            emailAddress: business.email_address || "",
            phoneNumber: business.phone_number || "",
            notesNeeds: business.notes_needs || "",
            fitScore,
            fitScoreLabel: `${fitScore.toFixed(0)}/100`,
            fitExplanation: item.explanation_notes || "",
            outreachEmailId: outreach.id || "",
            outreachEmailSubject: outreach.email_subject || "",
            outreachEmailBody: outreach.email_body || "",
            outreachCallToAction: outreach.call_to_action || "",
            hasOutreachEmail: !!(outreach.email_subject || outreach.email_body),
            emailSent: !!sentAt,
            emailSentAt: sentAt,
            draftSaved: !!draftSavedAt,
            draftSavedAt,
            hasCoordinates: location.hasCoordinates,
            latitude: location.latitude,
            longitude: location.longitude,
            staticMapUrl: location.staticMapUrl,
            browserMapUrl: location.browserMapUrl,
          };
        });

        const existingLeads = forceRefresh ? this.data.allLeads || [] : [];
        const existingById = new Map();
        existingLeads.forEach((lead) => {
          const key = String(lead.id || "");
          if (key) {
            existingById.set(key, lead);
          }
        });

        fetchedLeads.forEach((lead) => {
          const key = String(lead.id || "");
          if (!key) {
            return;
          }
          if (!existingById.has(key)) {
            existingById.set(key, lead);
          }
        });

        const leads = forceRefresh ? Array.from(existingById.values()) : fetchedLeads;
        const newLeadCount = forceRefresh ? leads.length - existingLeads.length : leads.length;

        let statusMessage = "";
        if (forceRefresh) {
          statusMessage = newLeadCount > 0 ? "Loaded additional opportunities." : "No new opportunities found right now.";
        } else if (payload.cached) {
          statusMessage = "Loaded your saved opportunities.";
        } else if (payload.triggered_lead_finder) {
          statusMessage = leads.length
            ? "No nearby businesses were found initially, so we ran lead finder for your city and then matched your best local opportunities."
            : "Lead finder was run for your city, but there are still no businesses within 20 km to match yet.";
        }

        this.setData({
          allLeads: leads,
          statusMessage,
          activeContactLeadKey: "",
          writingLeadKeys: {},
          bulkWriting: false,
          sendingLeadKey: "",
        });
        this.applyLeadFilter();
      },
      fail: (err) => {
        if (forceRefresh && hasExistingLeads) {
          this.setData({
            statusMessage: `Unable to load more opportunities. ${err && err.errMsg ? err.errMsg : ""}`,
          });
          return;
        }

        this.setData({
          errorMessage: `Unable to load opportunities. ${err && err.errMsg ? err.errMsg : ""}`,
        });
      },
      complete: () => {
        this.setData({
          loading: false,
          refreshing: false,
        });
      },
    });
  },
  findMoreOpportunities: function () {
    if (this.data.loading) {
      return;
    }

    this.fetchSuggestedLeads({ forceRefresh: true });
  },
  getPhotographerId: function () {
    const wallet = (app && app.globalData && app.globalData.wallet) || wx.getStorageSync("wallet") || {};
    return (wallet.uid || "").trim();
  },
  getSentStateMap: function () {
    const photographerId = this.getPhotographerId();
    if (!photographerId) {
      return {};
    }

    const stored = wx.getStorageSync(SENT_STATE_STORAGE_KEY) || {};
    const map = stored[photographerId];
    if (!map || typeof map !== "object") {
      return {};
    }

    return map;
  },
  getDraftStateMap: function () {
    const photographerId = this.getPhotographerId();
    if (!photographerId) {
      return {};
    }

    const stored = wx.getStorageSync(DRAFT_STATE_STORAGE_KEY) || {};
    const map = stored[photographerId];
    if (!map || typeof map !== "object") {
      return {};
    }

    return map;
  },
  setSentStateForBusiness: function (businessId, sentAt) {
    const photographerId = this.getPhotographerId();
    if (!photographerId) {
      return;
    }

    const key = String(businessId || "").trim();
    if (!key) {
      return;
    }

    const stored = wx.getStorageSync(SENT_STATE_STORAGE_KEY) || {};
    const current = stored[photographerId] && typeof stored[photographerId] === "object" ? stored[photographerId] : {};
    current[key] = sentAt || new Date().toISOString();
    stored[photographerId] = current;
    wx.setStorageSync(SENT_STATE_STORAGE_KEY, stored);
  },
  setDraftStateForBusiness: function (businessId, draftSavedAt) {
    const photographerId = this.getPhotographerId();
    if (!photographerId) {
      return;
    }

    const key = String(businessId || "").trim();
    if (!key) {
      return;
    }

    const stored = wx.getStorageSync(DRAFT_STATE_STORAGE_KEY) || {};
    const current = stored[photographerId] && typeof stored[photographerId] === "object" ? stored[photographerId] : {};
    current[key] = draftSavedAt || new Date().toISOString();
    stored[photographerId] = current;
    wx.setStorageSync(DRAFT_STATE_STORAGE_KEY, stored);
  },
  clearDraftStateForBusiness: function (businessId) {
    const photographerId = this.getPhotographerId();
    if (!photographerId) {
      return;
    }

    const key = String(businessId || "").trim();
    if (!key) {
      return;
    }

    const stored = wx.getStorageSync(DRAFT_STATE_STORAGE_KEY) || {};
    const current = stored[photographerId] && typeof stored[photographerId] === "object" ? stored[photographerId] : {};
    if (current[key]) {
      delete current[key];
      stored[photographerId] = current;
      wx.setStorageSync(DRAFT_STATE_STORAGE_KEY, stored);
    }
  },
  updateLeadByKey: function (leadKey, updater) {
    const nextAllLeads = (this.data.allLeads || []).map((lead) => {
      if (lead.leadKey !== leadKey) {
        return lead;
      }

      return updater({ ...lead });
    });

    this.setData({ allLeads: nextAllLeads });
    this.applyLeadFilter();
  },
  setWritingForLead: function (leadKey, isWriting) {
    const writingLeadKeys = { ...(this.data.writingLeadKeys || {}) };
    if (isWriting) {
      writingLeadKeys[leadKey] = true;
    } else {
      delete writingLeadKeys[leadKey];
    }
    this.setData({ writingLeadKeys });
  },
  generateOutreachEmailForLead: function (lead, options) {
    const showToast = !(options && options.showToast === false);
    const photographerId = this.getPhotographerId();
    const businessId = Number(lead.id);
    const leadKey = lead.leadKey;

    return new Promise((resolve) => {
      if (!AGENT_API_BASE_URL) {
        if (showToast) wx.showToast({ title: "Agent API not configured", icon: "none" });
        resolve(false);
        return;
      }

      if (!photographerId) {
        if (showToast) wx.showToast({ title: "Connect wallet first", icon: "none" });
        resolve(false);
        return;
      }

      if (!leadKey || Number.isNaN(businessId)) {
        if (showToast) wx.showToast({ title: "Invalid opportunity", icon: "none" });
        resolve(false);
        return;
      }

      this.setWritingForLead(leadKey, true);

      wx.request({
        url: `${AGENT_API_BASE_URL}/agents/business-outreach`,
        method: "POST",
        timeout: MATCH_TIMEOUT_MS,
        header: getAgentRequestHeaders(),
        data: {
          business_id: businessId,
          photographer_id: photographerId,
        },
        success: (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            if (showToast) {
              const detail = res && res.data && (res.data.detail || res.data.error);
              wx.showToast({ title: (detail || "Failed to generate email").slice(0, 28), icon: "none" });
            }
            resolve(false);
            return;
          }

          const draft = (res.data && res.data.data && Array.isArray(res.data.data.outreach_drafts) && res.data.data.outreach_drafts[0]) || null;
          if (!draft) {
            if (showToast) wx.showToast({ title: "No email generated", icon: "none" });
            resolve(false);
            return;
          }

          this.updateLeadByKey(leadKey, (nextLead) => {
            nextLead.outreachEmailSubject = draft.email_subject || "";
            nextLead.outreachEmailBody = draft.email_body || "";
            nextLead.outreachCallToAction = draft.call_to_action || "";
            nextLead.hasOutreachEmail = !!(draft.email_subject || draft.email_body);
            nextLead.emailSent = false;
            nextLead.emailSentAt = "";
            nextLead.draftSaved = false;
            nextLead.draftSavedAt = "";
            return nextLead;
          });

          if (showToast) wx.showToast({ title: "Email ready", icon: "success" });
          resolve(true);
        },
        fail: (err) => {
          if (showToast) {
            wx.showToast({
              title: `Error: ${(err && err.errMsg ? err.errMsg : "network").slice(0, 22)}`,
              icon: "none",
            });
          }
          resolve(false);
        },
        complete: () => {
          this.setWritingForLead(leadKey, false);
        },
      });
    });
  },
  generateOutreachEmail: function (event) {
    const leadKey = event.currentTarget.dataset.leadKey || "";
    const lead = (this.data.allLeads || []).find((item) => item.leadKey === leadKey);
    if (!lead) {
      wx.showToast({ title: "Opportunity not found", icon: "none" });
      return;
    }

    this.generateOutreachEmailForLead(lead, { showToast: true }).then((ok) => {
      if (ok) {
        this.setData({ statusMessage: "Outreach email generated and saved." });
      }
    });
  },
  generateAllVisibleEmails: function () {
    if (this.data.bulkWriting) {
      return;
    }

    const targets = (this.data.leads || []).filter((lead) => !lead.hasOutreachEmail);
    if (!targets.length) {
      wx.showToast({ title: "All visible emails already written", icon: "none" });
      return;
    }

    this.setData({ bulkWriting: true });

    const tasks = targets.map((lead) => this.generateOutreachEmailForLead(lead, { showToast: false }));
    Promise.allSettled(tasks)
      .then((results) => {
        const successCount = results.reduce((count, result) => {
          if (result.status !== "fulfilled") {
            return count;
          }
          return result.value ? count + 1 : count;
        }, 0);

        if (successCount > 0) {
          this.setData({ statusMessage: `Generated ${successCount} outreach email${successCount === 1 ? "" : "s"}.` });
        }

        wx.showToast({
          title: `${successCount}/${targets.length} ready`,
          icon: successCount ? "success" : "none",
        });
      })
      .finally(() => {
        this.setData({ bulkWriting: false });
      });
  },
  onEmailSubjectInput: function (event) {
    const leadKey = event.currentTarget.dataset.leadKey || "";
    const value = (event.detail && event.detail.value) || "";
    this.updateLeadByKey(leadKey, (nextLead) => {
      nextLead.outreachEmailSubject = value;
      nextLead.hasOutreachEmail = !!(nextLead.outreachEmailSubject || nextLead.outreachEmailBody);
      return nextLead;
    });
  },
  onEmailBodyInput: function (event) {
    const leadKey = event.currentTarget.dataset.leadKey || "";
    const value = (event.detail && event.detail.value) || "";
    this.updateLeadByKey(leadKey, (nextLead) => {
      nextLead.outreachEmailBody = value;
      nextLead.hasOutreachEmail = !!(nextLead.outreachEmailSubject || nextLead.outreachEmailBody);
      return nextLead;
    });
  },
  sendOrSaveOutreach: function (event) {
    const leadKey = event.currentTarget.dataset.leadKey || "";
    const businessId = event.currentTarget.dataset.businessId;
    const outreachEmailIdRaw = event.currentTarget.dataset.outreachId;
    const toEmail = (event.currentTarget.dataset.toEmail || "").trim();
    const subject = event.currentTarget.dataset.subject || "";
    const body = event.currentTarget.dataset.body || "";

    if (!AGENT_API_BASE_URL) {
      wx.showToast({ title: "Agent API not configured", icon: "none" });
      return;
    }

    if (!subject && !body) {
      wx.showToast({ title: "Email content missing", icon: "none" });
      return;
    }

    this.setData({ sendingLeadKey: leadKey });

    let outreachEmailId = null;
    if (outreachEmailIdRaw !== undefined && outreachEmailIdRaw !== null && outreachEmailIdRaw !== "") {
      const parsedOutreachId = Number(outreachEmailIdRaw);
      if (!Number.isNaN(parsedOutreachId)) {
        outreachEmailId = parsedOutreachId;
      }
    }

    const hasRecipient = !!toEmail;
    const endpoint = hasRecipient ? "/agents/send-gmail" : "/agents/save-gmail-draft";

    wx.request({
      url: `${AGENT_API_BASE_URL}${endpoint}`,
      method: "POST",
      timeout: 60000,
      header: getAgentRequestHeaders(),
      data: {
        to_email: hasRecipient ? toEmail : null,
        subject,
        body,
        outreach_email_id: outreachEmailId,
      },
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const detail = res && res.data && (res.data.detail || res.data.error);
          wx.showToast({
            title: (detail || "Send failed").slice(0, 28),
            icon: "none",
          });
          return;
        }

        if (hasRecipient) {
          const payload = res.data || {};
          const sentAt = payload.sent_at || new Date().toISOString();
          this.setSentStateForBusiness(businessId, sentAt);
          this.clearDraftStateForBusiness(businessId);
          this.updateLeadByKey(leadKey, (nextLead) => {
            nextLead.emailSent = true;
            nextLead.emailSentAt = sentAt;
            nextLead.draftSaved = false;
            nextLead.draftSavedAt = "";
            return nextLead;
          });
          wx.showToast({ title: "Email sent", icon: "success" });
          return;
        }

        const draftSavedAt = new Date().toISOString();
        this.setDraftStateForBusiness(businessId, draftSavedAt);
        this.updateLeadByKey(leadKey, (nextLead) => {
          nextLead.draftSaved = true;
          nextLead.draftSavedAt = draftSavedAt;
          return nextLead;
        });

        wx.showToast({ title: "Draft saved", icon: "success" });
      },
      fail: (err) => {
        wx.showToast({
          title: `Error: ${(err && err.errMsg ? err.errMsg : "network").slice(0, 22)}`,
          icon: "none",
        });
      },
      complete: () => {
        this.setData({ sendingLeadKey: "" });
      },
    });
  },
  safeScore: function (value) {
    const score = Number(value);
    if (Number.isNaN(score)) {
      return 0;
    }

    if (score < 0) {
      return 0;
    }

    if (score > 100) {
      return 100;
    }

    return score;
  },
  parseCoordinates: function (lat, lon) {
    let safeLat = Number(lat);
    let safeLon = Number(lon);

    if (Number.isNaN(safeLat) || Number.isNaN(safeLon)) {
      return {
        hasCoordinates: false,
        latitude: 0,
        longitude: 0,
        staticMapUrl: "",
        browserMapUrl: "",
      };
    }

    // Handle datasets where latitude/longitude are accidentally swapped.
    if (Math.abs(safeLat) > 90 && Math.abs(safeLon) <= 90) {
      const tmp = safeLat;
      safeLat = safeLon;
      safeLon = tmp;
    }

    if (Math.abs(safeLat) > 90 || Math.abs(safeLon) > 180) {
      return {
        hasCoordinates: false,
        latitude: 0,
        longitude: 0,
        staticMapUrl: "",
        browserMapUrl: "",
      };
    }

    const latFixed = safeLat.toFixed(6);
    const lonFixed = safeLon.toFixed(6);
    const styleId = MAPBOX_STYLE_ID || "mapbox/streets-v12";
    const tokenQuery = MAPBOX_ACCESS_TOKEN ? `?access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}` : "";
    const staticMapUrl = MAPBOX_ACCESS_TOKEN
      ? `https://api.mapbox.com/styles/v1/${styleId}/static/pin-s+ff3b30(${lonFixed},${latFixed})/${lonFixed},${latFixed},14,0/640x360${tokenQuery}`
      : "";
    const browserMapUrl = `https://www.openstreetmap.org/?mlat=${latFixed}&mlon=${lonFixed}#map=15/${latFixed}/${lonFixed}`;

    return {
      hasCoordinates: true,
      latitude: safeLat,
      longitude: safeLon,
      staticMapUrl,
      browserMapUrl,
    };
  },
  toggleContact: function (event) {
    const leadKey = event.currentTarget.dataset.leadKey || "";
    if (!leadKey) {
      return;
    }

    const isCurrentlyOpen = this.data.activeContactLeadKey === leadKey;
    this.setData({
      activeContactLeadKey: isCurrentlyOpen ? "" : leadKey,
    });
  },
  callPhone: function (event) {
    const phone = event.currentTarget.dataset.phone;
    if (!phone) {
      wx.showToast({
        title: "No phone number",
        icon: "none",
      });
      return;
    }

    wx.makePhoneCall({
      phoneNumber: `${phone}`,
    });
  },
  copyEmail: function (event) {
    const email = event.currentTarget.dataset.email;
    if (!email) {
      wx.showToast({
        title: "No email address",
        icon: "none",
      });
      return;
    }

    wx.setClipboardData({
      data: `${email}`,
    });
  },
  openWebsite: function (event) {
    const rawWebsite = (event.currentTarget.dataset.website || "").trim();
    if (!rawWebsite) {
      wx.showToast({
        title: "No website URL",
        icon: "none",
      });
      return;
    }

    const normalized = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;

    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(normalized)}`,
      fail: () => {
        wx.showToast({
          title: "Unable to open website",
          icon: "none",
        });
      },
    });
  },
  openInMap: function (event) {
    const mapUrl = (event.currentTarget.dataset.mapurl || "").trim();
    const latitude = Number(event.currentTarget.dataset.lat);
    const longitude = Number(event.currentTarget.dataset.lon);

    if (!mapUrl && (Number.isNaN(latitude) || Number.isNaN(longitude))) {
      wx.showToast({
        title: "Location unavailable",
        icon: "none",
      });
      return;
    }

    const fallbackMapUrl = `https://www.openstreetmap.org/?mlat=${latitude.toFixed(6)}&mlon=${longitude.toFixed(6)}#map=15/${latitude.toFixed(6)}/${longitude.toFixed(6)}`;
    const targetUrl = mapUrl || fallbackMapUrl;

    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(targetUrl)}`,
      fail: () => {
        wx.showToast({
          title: "Unable to open map",
          icon: "none",
        });
      },
    });
  },
});
