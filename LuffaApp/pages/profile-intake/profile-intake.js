const app = getApp();
const { AGENT_API_BASE_URL, getAgentRequestHeaders } = require("../../config/agent_api");
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require("../../config/supabase");
const { MAPBOX_ACCESS_TOKEN } = require("../../config/maps");

const AGENT_ANALYZE_TIMEOUT_MS = 420000;

function normalizeUrl(url) {
  const raw = (url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function splitCsv(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanHandle(value) {
  return (value || "").replace(/^@+/, "").trim();
}

function normalizeSecondaryNiches(value) {
  if (Array.isArray(value)) return value.map((item) => `${item}`.trim()).filter(Boolean);
  return splitCsv(value);
}

function normalizeProfileFromAgent(rawProfile, fallbackWebsiteUrl, fallbackInstagramHandle) {
  const profile = rawProfile || {};
  return {
    name: (profile.name || "").trim(),
    primary_niche: (profile.primary_niche || "").trim(),
    contact_email: (profile.contact_email || "").trim(),
    website_url: normalizeUrl(profile.website_url || fallbackWebsiteUrl),
    instagram_handle: cleanHandle(profile.instagram_handle || fallbackInstagramHandle) || null,
    secondary_niches: normalizeSecondaryNiches(profile.secondary_niches),
    human_presence: profile.human_presence === null || profile.human_presence === undefined ? null : !!profile.human_presence,
    location_city: (profile.location_city || "").trim(),
    location_country: (profile.location_country || "").trim(),
    willingness_to_travel: !!profile.willingness_to_travel,
    studio_access: !!profile.studio_access,
  };
}

function normalizeProfileFromStoredProfile(profile) {
  return normalizeProfileFromAgent(
    {
      name: profile.name,
      primary_niche: profile.primaryNiche,
      contact_email: profile.contactEmail,
      website_url: profile.websiteUrl,
      instagram_handle: profile.instagramHandle,
      secondary_niches: profile.secondaryNichesList || profile.secondaryNiches,
      human_presence: profile.humanPresence,
      location_city: profile.locationCity,
      location_country: profile.locationCountry,
      willingness_to_travel: profile.willingnessToTravel,
      studio_access: profile.studioAccess,
    },
    profile.websiteUrl,
    profile.instagramHandle,
  );
}

function extractJsonObject(text) {
  const source = `${text || ""}`.trim();
  if (!source) return null;

  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : source;

  try {
    return JSON.parse(candidate);
  } catch (err) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch (secondErr) {
        return null;
      }
    }
    return null;
  }
}

function comparableProfile(profile) {
  const normalized = normalizeProfileFromAgent(profile, "", "");
  return {
    ...normalized,
    human_presence: !!normalized.human_presence,
    secondary_niches: normalized.secondary_niches,
  };
}

function areProfilesEqual(left, right) {
  return JSON.stringify(comparableProfile(left)) === JSON.stringify(comparableProfile(right));
}

function geocodeCity(city, country) {
  return new Promise((resolve) => {
    if (!city || !MAPBOX_ACCESS_TOKEN) {
      resolve({ latitude: null, longitude: null });
      return;
    }

    const query = country ? `${city}, ${country}` : city;
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`;

    wx.request({
      url: url,
      method: "GET",
      success: (res) => {
        if (res.statusCode === 200 && res.data.features && res.data.features.length > 0) {
          const coords = res.data.features[0].geometry.coordinates;
          resolve({ latitude: coords[1], longitude: coords[0] });
          return;
        }
        resolve({ latitude: null, longitude: null });
      },
      fail: () => {
        resolve({ latitude: null, longitude: null });
      },
    });
  });
}

Page({
  data: {
    step: "initial",
    submitting: false,
    saving: false,
    pageLoading: true,
    editMode: false,
    statusMessage: "",
    errorMessage: "",
    name: "",
    contactEmail: "",
    locationCity: "",
    locationCountry: "",
    instagramHandle: "",
    portfolioUrl: "",
    primaryNiche: "",
    secondaryNiches: "",
    humanPresence: false,
    willingToTravel: false,
    studioAccess: false,
    agentProfileOriginal: null,
  },
  onLoad: function (options) {
    this.setData({ pageLoading: true, statusMessage: "", errorMessage: "" });

    const editMode = options && options.mode === "edit";
    if (editMode && options.profile) {
      try {
        const profile = JSON.parse(decodeURIComponent(options.profile));
        this.populateEditForm(profile);
      } catch (err) {
        console.error("Failed to parse profile:", err);
        this.resetForm();
        this.setData({ errorMessage: "Could not read profile data." });
      }
    } else {
      this.resetForm();
    }

    this.setData({ pageLoading: false });
  },
  resetForm: function () {
    this.setData({
      step: "initial",
      editMode: false,
      statusMessage: "",
      errorMessage: "",
      name: "",
      contactEmail: "",
      locationCity: "",
      locationCountry: "",
      instagramHandle: "",
      portfolioUrl: "",
      primaryNiche: "",
      secondaryNiches: "",
      humanPresence: false,
      willingToTravel: false,
      studioAccess: false,
      agentProfileOriginal: null,
    });
  },
  onNameInput: function (e) {
    this.setData({ name: e.detail.value, errorMessage: "" });
  },
  onContactEmailInput: function (e) {
    this.setData({ contactEmail: e.detail.value, errorMessage: "" });
  },
  onLocationCityInput: function (e) {
    this.setData({ locationCity: e.detail.value, errorMessage: "" });
  },
  onLocationCountryInput: function (e) {
    this.setData({ locationCountry: e.detail.value, errorMessage: "" });
  },
  onInstagramInput: function (e) {
    this.setData({ instagramHandle: e.detail.value, errorMessage: "" });
  },
  onPortfolioUrlInput: function (e) {
    this.setData({ portfolioUrl: e.detail.value, errorMessage: "" });
  },
  onPrimaryNicheInput: function (e) {
    this.setData({ primaryNiche: e.detail.value, errorMessage: "" });
  },
  onSecondaryNichesInput: function (e) {
    this.setData({ secondaryNiches: e.detail.value, errorMessage: "" });
  },
  onHumanPresenceChange: function (e) {
    this.setData({ humanPresence: !!e.detail.value });
  },
  onTravelChange: function (e) {
    this.setData({ willingToTravel: !!e.detail.value });
  },
  onStudioChange: function (e) {
    this.setData({ studioAccess: !!e.detail.value });
  },
  populateEditForm: function (profile) {
    const normalized = normalizeProfileFromStoredProfile(profile || {});

    this.setData({
      step: "confirm",
      editMode: true,
      statusMessage: "Editing your existing profile.",
      errorMessage: "",
      name: normalized.name || "",
      contactEmail: normalized.contact_email || "",
      locationCity: normalized.location_city || "",
      locationCountry: normalized.location_country || "",
      instagramHandle: normalized.instagram_handle || "",
      portfolioUrl: normalized.website_url || "",
      primaryNiche: normalized.primary_niche || "",
      secondaryNiches: (normalized.secondary_niches || []).join(", "),
      humanPresence: !!normalized.human_presence,
      willingToTravel: !!normalized.willingness_to_travel,
      studioAccess: !!normalized.studio_access,
      agentProfileOriginal: normalized,
    });
  },
  onSubmit: function () {
    if (this.data.pageLoading || this.data.submitting || this.data.saving) return;

    if (this.data.step === "confirm") {
      this.onConfirmDetails();
      return;
    }

    this.onAnalyzePortfolio();
  },
  onAnalyzePortfolio: function () {
    if (this.data.submitting) return;

    if (!AGENT_API_BASE_URL) {
      this.setData({ errorMessage: "Set LUFFA_AGENT_API_BASE_URL first." });
      return;
    }

    const websiteUrl = normalizeUrl(this.data.portfolioUrl);
    if (!websiteUrl) {
      this.setData({ errorMessage: "Portfolio link is required." });
      return;
    }

    const payload = {
      website_url: websiteUrl,
      instagram_handle: cleanHandle(this.data.instagramHandle) || null,
      photographer_id: (app.globalData.wallet && app.globalData.wallet.uid) || null,
    };

    this.setData({
      submitting: true,
      errorMessage: "",
      statusMessage: "Analyzing your portfolio. This can take a minute...",
    });

    wx.request({
      url: `${AGENT_API_BASE_URL}/agents/portfolio-analyser`,
      method: "POST",
      timeout: AGENT_ANALYZE_TIMEOUT_MS,
      header: getAgentRequestHeaders(),
      data: payload,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const agentProfile = this.extractAgentProfile(res.data, websiteUrl, this.data.instagramHandle);
          if (!agentProfile || !agentProfile.website_url) {
            this.setData({ errorMessage: "Analyzer did not return a valid profile." });
            return;
          }

          this.populateConfirmForm(agentProfile);
          this.setData({ statusMessage: "Review the details and confirm when ready." });
          return;
        }

        const detail = (res.data && (res.data.detail || res.data.error)) || "Request failed";
        this.setData({ errorMessage: `${detail}`.slice(0, 80) });
      },
      fail: (err) => {
        const timeoutErr = err && err.errMsg && err.errMsg.includes("timed out");
        this.setData({ errorMessage: timeoutErr ? "Analysis timed out. Try again." : "Analyzer request failed." });
        console.error("portfolio-analyser request failed:", err);
      },
      complete: () => {
        this.setData({ submitting: false });
      },
    });
  },
  extractAgentProfile: function (responseBody, fallbackWebsite, fallbackInstagram) {
    const profiles =
      (responseBody && responseBody.data && Array.isArray(responseBody.data.profiles) && responseBody.data.profiles) ||
      (responseBody && Array.isArray(responseBody.profiles) && responseBody.profiles) ||
      [];

    if (profiles.length) {
      return normalizeProfileFromAgent(profiles[0], fallbackWebsite, fallbackInstagram);
    }

    const rawResponse = responseBody && responseBody.raw_response;
    const parsed = extractJsonObject(rawResponse);
    const rawProfiles =
      (parsed && parsed.data && Array.isArray(parsed.data.profiles) && parsed.data.profiles) ||
      (parsed && Array.isArray(parsed.profiles) && parsed.profiles) ||
      [];

    if (!rawProfiles.length) return null;
    return normalizeProfileFromAgent(rawProfiles[0], fallbackWebsite, fallbackInstagram);
  },
  populateConfirmForm: function (profile) {
    this.setData({
      step: "confirm",
      errorMessage: "",
      name: profile.name || "",
      contactEmail: profile.contact_email || "",
      locationCity: profile.location_city || "",
      locationCountry: profile.location_country || "",
      instagramHandle: profile.instagram_handle || "",
      portfolioUrl: profile.website_url || "",
      primaryNiche: profile.primary_niche || "",
      secondaryNiches: (profile.secondary_niches || []).join(", "),
      humanPresence: !!profile.human_presence,
      willingToTravel: !!profile.willingness_to_travel,
      studioAccess: !!profile.studio_access,
      agentProfileOriginal: profile,
    });
  },
  buildProfileFromForm: function () {
    return normalizeProfileFromAgent(
      {
        name: this.data.name,
        primary_niche: this.data.primaryNiche,
        contact_email: this.data.contactEmail,
        website_url: this.data.portfolioUrl,
        instagram_handle: this.data.instagramHandle,
        secondary_niches: this.data.secondaryNiches,
        human_presence: this.data.humanPresence,
        location_city: this.data.locationCity,
        location_country: this.data.locationCountry,
        willingness_to_travel: this.data.willingToTravel,
        studio_access: this.data.studioAccess,
      },
      this.data.portfolioUrl,
      this.data.instagramHandle,
    );
  },
  onConfirmDetails: function () {
    const finalProfile = this.buildProfileFromForm();
    if (!finalProfile.website_url) {
      this.setData({ errorMessage: "Portfolio link is required." });
      return;
    }

    if (!finalProfile.location_city) {
      this.setData({ errorMessage: "Location city is required to match local opportunities." });
      return;
    }

    this.saveEditedProfileToSupabase(finalProfile);
  },
  saveEditedProfileToSupabase: function (profile) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_URL.includes("supabase.co")) {
      this.setData({ errorMessage: "Supabase config missing." });
      return;
    }

    const photographerId = (app.globalData.wallet && app.globalData.wallet.uid) || "";
    if (!photographerId) {
      this.setData({ errorMessage: "Photographer ID missing." });
      return;
    }

    this.setData({
      saving: true,
      errorMessage: "",
      statusMessage: "Saving your profile updates...",
    });

    geocodeCity(profile.location_city, profile.location_country).then((coords) => {
      const missingCoordinates = coords.latitude === null || coords.longitude === null;
      if (missingCoordinates) {
        this.setData({
          saving: false,
          statusMessage: "",
          errorMessage: "Could not geocode that city. Check spelling and try again.",
        });
        return;
      }

      const row = {
        photographer_id: photographerId,
        name: profile.name || null,
        primary_niche: profile.primary_niche || null,
        contact_email: profile.contact_email || null,
        website_url: profile.website_url || null,
        instagram_handle: profile.instagram_handle || null,
        secondary_niches: profile.secondary_niches || [],
        human_presence: profile.human_presence,
        location_city: profile.location_city || null,
        location_country: profile.location_country || null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        willingness_to_travel: !!profile.willingness_to_travel,
        studio_access: !!profile.studio_access,
      };

      wx.request({
        url: `${SUPABASE_URL}/rest/v1/photographer_profiles?on_conflict=photographer_id`,
        method: "POST",
        header: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        data: row,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.finalizeCompletion();
            return;
          }

          const detail = (res.data && (res.data.message || res.data.error || res.data.details || res.data.hint)) || "Save failed";
          this.setData({ errorMessage: `${detail}`.slice(0, 80) });
          console.error("supabase save failed:", res);
        },
        fail: (err) => {
          this.setData({ errorMessage: "Save request failed." });
          console.error("supabase save request failed:", err);
        },
        complete: () => {
          this.setData({ saving: false });
        },
      });
    });
  },
  finalizeCompletion: function () {
    wx.showToast({ title: "Profile saved", icon: "success" });
    setTimeout(() => {
      wx.navigateBack();
    }, 500);
  },
});
