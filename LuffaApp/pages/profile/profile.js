const app = getApp();
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require("../../config/supabase");

const INSTAGRAM_BASE_URL = "https://www.instagram.com/";
const GMAIL_COMPOSE_BASE_URL = "https://mail.google.com/mail/?view=cm&fs=1&to=";

function normalizeUrl(url) {
  const raw = (url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function formatSecondaryNiches(niches) {
  if (Array.isArray(niches)) return niches.filter(Boolean).join(", ");
  return `${niches || ""}`.trim();
}

// Country to flag emoji mapping
const countryFlags = {
  US: "🇺🇸",
  UK: "🇬🇧",
  CA: "🇨🇦",
  AU: "🇦🇺",
  NZ: "🇳🇿",
  GB: "🇬🇧",
  DE: "🇩🇪",
  FR: "🇫🇷",
  IT: "🇮🇹",
  ES: "🇪🇸",
  JP: "🇯🇵",
  CN: "🇨🇳",
  IN: "🇮🇳",
  BR: "🇧🇷",
  MX: "🇲🇽",
  ZA: "🇿🇦",
  SG: "🇸🇬",
  NL: "🇳🇱",
  SE: "🇸🇪",
  CH: "🇨🇭",
  Ireland: "🇮🇪",
  Netherlands: "🇳🇱",
  Belgium: "🇧🇪",
  Austria: "🇦🇹",
  Denmark: "🇩🇰",
  Finland: "🇫🇮",
  Norway: "🇳🇴",
  Poland: "🇵🇱",
  Greece: "🇬🇷",
  Portugal: "🇵🇹",
  Czech: "🇨🇿",
  Hungary: "🇭🇺",
  Romania: "🇷🇴",
  Bulgaria: "🇧🇬",
  Croatia: "🇭🇷",
  Slovenia: "🇸🇮",
  Thailand: "🇹🇭",
  Vietnam: "🇻🇳",
  Philippines: "🇵🇭",
  Malaysia: "🇲🇾",
  Indonesia: "🇮🇩",
  Pakistan: "🇵🇰",
  Bangladesh: "🇧🇩",
  UAE: "🇦🇪",
  "Saudi Arabia": "🇸🇦",
  Turkey: "🇹🇷",
  Israel: "🇮🇱",
  "South Korea": "🇰🇷",
  Argentina: "🇦🇷",
  Chile: "🇨🇱",
  Colombia: "🇨🇴",
  Peru: "🇵🇪",
  Venezuela: "🇻🇪",
  Ecuador: "🇪🇨",
  "United States": "🇺🇸",
  "United Kingdom": "🇬🇧",
  Canada: "🇨🇦",
  Australia: "🇦🇺",
  "New Zealand": "🇳🇿",
  Germany: "🇩🇪",
  France: "🇫🇷",
  Italy: "🇮🇹",
  Spain: "🇪🇸",
  Japan: "🇯🇵",
  China: "🇨🇳",
  India: "🇮🇳",
  Brazil: "🇧🇷",
  Mexico: "🇲🇽",
  "South Africa": "🇿🇦",
  Singapore: "🇸🇬",
};

function getCountryDisplay(country) {
  if (!country) return "";
  const flag = countryFlags[country] || "";
  return flag ? `${flag} ${country}` : country;
}

function cleanInstagramHandle(handle) {
  const raw = `${handle || ""}`.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/instagram\.com\/([^/?#]+)/i);
    return match && match[1] ? match[1].replace(/^@+/, "").trim() : "";
  }
  return raw.replace(/^@+/, "").trim();
}

function getInstagramUrl(handle) {
  const clean = cleanInstagramHandle(handle);
  return clean ? `${INSTAGRAM_BASE_URL}${encodeURIComponent(clean)}/` : "";
}

function cleanEmail(value) {
  return `${value || ""}`.trim();
}

function getEmailComposeUrl(email) {
  const clean = cleanEmail(email);
  if (!clean) return "";
  return `${GMAIL_COMPOSE_BASE_URL}${encodeURIComponent(clean)}`;
}

Page({
  data: {
    title: "My Profile",
    instagramIcon: "/utils/instagram_icon.png",
    emailIcon: "/utils/email_icon.png",
    loadingProfile: false,
    statusMessage: "",
    profileError: "",
    walletConnected: false,
    walletUid: "",
    walletAddress: "",
    hasPhotographerProfile: false,
    photographerProfile: null,
  },
  onLoad: function () {
    this.refreshProfileData();
  },
  onShow: function () {
    this.refreshProfileData();
  },
  refreshProfileData: function () {
    const wallet = app.globalData.wallet || {};
    const walletConnected = !!wallet.address;
    const walletUid = wallet.uid || "";

    this.setData({
      walletConnected,
      walletUid,
      walletAddress: wallet.address || "",
      profileError: "",
      statusMessage: walletConnected ? "Refreshing profile..." : "",
    });

    if (!walletConnected || !walletUid) {
      this.setData({
        hasPhotographerProfile: false,
        photographerProfile: null,
        profileError: walletConnected ? "Wallet UID missing." : "Connect wallet to view profile.",
        statusMessage: "",
      });
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_URL.includes("supabase.co")) {
      this.setData({
        hasPhotographerProfile: false,
        photographerProfile: null,
        profileError: "Supabase config missing.",
        statusMessage: "",
      });
      return;
    }

    this.setData({
      loadingProfile: true,
      profileError: "",
      statusMessage: "Refreshing profile...",
    });

    wx.request({
      url: `${SUPABASE_URL}/rest/v1/photographer_profiles?photographer_id=eq.${encodeURIComponent(walletUid)}&select=photographer_id,name,primary_niche,contact_email,website_url,instagram_handle,secondary_niches,human_presence,location_city,location_country,willingness_to_travel,studio_access&limit=1`,
      method: "GET",
      header: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      success: (res) => {
        const row = Array.isArray(res.data) && res.data.length ? res.data[0] : null;
        if (!row) {
          this.setData({
            hasPhotographerProfile: false,
            photographerProfile: null,
            profileError: "No profile found yet. Complete profile analysis first.",
            statusMessage: "",
          });
          return;
        }

        this.setData({
          hasPhotographerProfile: true,
          statusMessage: "Profile up to date.",
          photographerProfile: {
            uid: row.uid || "",
            name: row.name || "",
            primaryNiche: row.primary_niche || "",
            contactEmail: row.contact_email || "",
            websiteUrl: normalizeUrl(row.website_url || ""),
            instagramHandle: row.instagram_handle || "",
            secondaryNiches: formatSecondaryNiches(row.secondary_niches),
            secondaryNichesList: (row.secondary_niches || []).filter(Boolean),
            humanPresence: row.human_presence === null || row.human_presence === undefined ? "" : row.human_presence ? "Yes" : "No",
            locationCity: row.location_city || "",
            locationCountry: row.location_country || "",
            countryDisplay: getCountryDisplay(row.location_country || ""),
            willingnessToTravel: row.willingness_to_travel ? "Yes" : "No",
            studioAccess: row.studio_access ? "Yes" : "No",
          },
        });
      },
      fail: (err) => {
        this.setData({
          hasPhotographerProfile: false,
          photographerProfile: null,
          profileError: (err && err.errMsg) || "Failed to load profile.",
          statusMessage: "",
        });
      },
      complete: () => {
        this.setData({
          loadingProfile: false,
        });
      },
    });
  },
  openWebsite: function () {
    const profile = this.data.photographerProfile || {};
    const url = normalizeUrl(profile.websiteUrl || "");
    if (!url) {
      wx.showToast({ title: "No portfolio URL", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(url)}`,
    });
  },
  openInstagram: function () {
    const profile = this.data.photographerProfile || {};
    const url = getInstagramUrl(profile.instagramHandle);
    if (!url) {
      wx.showToast({ title: "No Instagram account", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(url)}`,
    });
  },
  openEmail: function () {
    const profile = this.data.photographerProfile || {};
    const email = cleanEmail(profile.contactEmail);
    const url = getEmailComposeUrl(email);
    if (!email || !url) {
      wx.showToast({ title: "No email address", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(url)}`,
    });
  },
  goToEditProfile: function () {
    const profile = this.data.photographerProfile || {};
    const encodedProfile = encodeURIComponent(JSON.stringify(profile));
    wx.navigateTo({
      url: `/pages/profile-intake/profile-intake?mode=edit&profile=${encodedProfile}`,
    });
  },
  goToProfileIntake: function () {
    wx.navigateTo({
      url: "/pages/profile-intake/profile-intake",
    });
  },
});
