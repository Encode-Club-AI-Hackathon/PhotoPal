//index.js
const app = getApp();
const luffa = require("../../utils/luffa");
const { defaultIcon } = require("../../utils/icon");
const { defaultInfoIcon } = require("../../utils/info");
const { defaultSettingsIcon } = require("../../utils/settings_icon");
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require("../../config/supabase");

function buildWalletFromPayload(payload) {
  const data = payload || {};
  return {
    address: data.address || data.walletAddress || "",
    avatarUrl: data.avatar || data.avatarUrl || "",
    avatarFrame: data.avatar_frame || data.avatarFrame || "",
    cid: data.cid || "",
    nickname: data.nickname || data.nickName || "Anonymous",
    uid: data.uid || "",
  };
}

const API_BASE = "https://grizzly-organic-kingfish.ngrok-free.app";
const AUTH_SESSION_STORAGE_KEY = "pendingAuthSession";
const AUTH_TOKEN_TTL_MS = 15 * 60 * 1000;

function requestAsync(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success: resolve,
      fail: reject,
    });
  });
}

Page({
  data: {
    title: "PhotoPal",
    subtitle: "Plan shoots, track leads, and focus on the work you love.",
    displayName: "Photographer",
    settingsIcon: defaultSettingsIcon,
    settingsIcon: defaultSettingsIcon,
    googleIcon: "/utils/google_icon.png",
    infoIcon: defaultInfoIcon,
    tickIcon: defaultIcon,
    auth: false,
    bootLoading: true,
    connectingWallet: false,
    checkingProfile: false,
    walletConnected: false,
    hasPhotographerProfile: false,
    walletAddress: "",
    walletNickname: "",
    walletUid: "",
    walletCid: "",
    authPolling: false,
    authSessionId: "",
    authUserCode: "",
    authVerificationUrl: "",
    loadingGmailSubjects: false,
  },
  onLoad: function () {
    this.updateDisplayName();
    this.syncAuthState();
    this.syncWalletState();
    this.resumePendingAuthSession();
  },
  onShow: function () {
    this.updateDisplayName();
    this.syncAuthState();
    this.syncWalletState();
    this.resumePendingAuthSession();
  },
  syncAuthState: function () {
    this.setData({ auth: this.isLoggedIn() });
  },
  updateDisplayName: function () {
    const userInfo = app.globalData.userInfo || {};
    const wallet = app.globalData.wallet || {};
    this.setData({
      displayName: wallet.nickname || userInfo.nickName || "Photographer",
    });
  },
  syncWalletState: function () {
    const wallet = app.globalData.wallet;
    if (wallet && wallet.address) {
      this.setData({
        walletConnected: true,
        walletAddress: wallet.address || "",
        walletNickname: wallet.nickname || "",
        walletUid: wallet.uid || "",
        walletCid: wallet.cid || "",
        bootLoading: true,
      });
      this.updateDisplayName();
      this.checkPhotographerProfile(wallet.uid || "");
      return;
    }

    this.setData({
      walletConnected: false,
      hasPhotographerProfile: false,
      checkingProfile: false,
      walletAddress: "",
      walletNickname: "",
      walletUid: "",
      walletCid: "",
      bootLoading: false,
    });
    this.updateDisplayName();
  },
  checkPhotographerProfile: function (uid, onDone) {
    const finish = (exists) => {
      this.setData({
        hasPhotographerProfile: !!exists,
        checkingProfile: false,
        bootLoading: false,
      });
      if (typeof onDone === "function") onDone(!!exists);
    };

    if (!uid) {
      finish(false);
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_URL.includes("supabase.co")) {
      finish(false);
      return;
    }

    this.setData({ checkingProfile: true });

    wx.request({
      url: `${SUPABASE_URL}/rest/v1/photographer_profiles?photographer_id=eq.${encodeURIComponent(uid)}&select=photographer_id&limit=1`,
      method: "GET",
      header: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      success: (res) => {
        const exists = Array.isArray(res.data) && res.data.length > 0;
        finish(exists);
      },
      fail: () => {
        finish(false);
      },
    });
  },
  onConnectWallet: function () {
    if (this.data.connectingWallet || this.data.walletConnected) {
      return;
    }

    this.setData({ connectingWallet: true });

    luffa
      .connect()
      .then((res) => {
        const wallet = buildWalletFromPayload((res && res.data) || {});
        if (!wallet.address) {
          this.setData({ connectingWallet: false });
          wx.showToast({ title: "Wallet data unavailable", icon: "none" });
          return;
        }

        app.globalData.wallet = wallet;
        wx.setStorageSync("wallet", wallet);
        this.setData({ connectingWallet: false });
        this.syncWalletState();
        wx.showToast({ title: "Wallet connected", icon: "success" });

        this.checkPhotographerProfile(wallet.uid || "", (exists) => {
          if (exists) return;
          setTimeout(() => {
            wx.navigateTo({
              url: "../profile-intake/profile-intake",
            });
          }, 350);
        });
      })
      .catch((err) => {
        console.error("Connect wallet failed:", err);
        this.setData({ connectingWallet: false });
        wx.showToast({ title: "Connection failed", icon: "none" });
      });
  },
  goToSettings: function () {
    wx.navigateTo({
      url: "../settings/settings",
    });
  },
  showAbout: function () {
    wx.showModal({
      title: "About PhotoPal",
      content: "PhotoPal helps photographers discover and contact relevant local businesses faster.",
      showCancel: false,
    });
  },
  goToSuggestedOpportunities: function () {
    if (!this.data.walletConnected) {
      wx.showToast({ title: "Connect wallet first", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: "../suggested-opportunities/suggested-opportunities",
    });
  },
  goToProfileIntake: function () {
    if (!this.data.walletConnected) {
      wx.showToast({ title: "Connect wallet first", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: "../profile-intake/profile-intake",
    });
  },
  goToProfile: function () {
    if (!this.data.walletConnected) {
      wx.showToast({ title: "Connect wallet first", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: "../profile/profile",
    });
  },

  isLoggedIn: function () {
    const globalAuth = app.globalData.auth || {};
    if (globalAuth.accessToken && globalAuth.issuedAt) {
      if (Date.now() - Number(globalAuth.issuedAt) <= AUTH_TOKEN_TTL_MS) {
        return true;
      }
      app.globalData.auth = {};
      wx.removeStorageSync("auth");
      return false;
    }

    if (globalAuth.accessToken) {
      app.globalData.auth = {};
      wx.removeStorageSync("auth");
      return false;
    }

    const storedAuth = wx.getStorageSync("auth") || {};
    if (storedAuth.accessToken && storedAuth.issuedAt) {
      if (Date.now() - Number(storedAuth.issuedAt) <= AUTH_TOKEN_TTL_MS) {
        app.globalData.auth = storedAuth;
        return true;
      }
      app.globalData.auth = {};
      wx.removeStorageSync("auth");
      return false;
    }

    if (storedAuth.accessToken) {
      app.globalData.auth = {};
      wx.removeStorageSync("auth");
      return false;
    }

    return false;
  },

  handleLogin: function () {
    if (this.data.authPolling) return;

    if (this.isLoggedIn()) {
      this.clearPendingAuthSession();
      wx.showToast({ title: "Already logged in", icon: "none" });
      return;
    }

    const pending = this.getPendingAuthSession();
    if (pending && pending.sessionId) {
      this.setData({
        authPolling: true,
        authSessionId: pending.sessionId,
        authUserCode: pending.userCode || "",
        authVerificationUrl: pending.verificationUrl || "",
      });
      this.pollLoginStatus(pending.sessionId, Number(pending.interval || 3));
      wx.showToast({ title: "Resuming login", icon: "none" });
      return;
    }

    const wallet = app.globalData.wallet || {};
    wx.request({
      url: `${API_BASE}/auth/device/start`,
      method: "POST",
      data: {
        wallet_uid: wallet.uid || "",
        wallet_address: wallet.address || "",
      },
      success: (res) => {
        const d = (res && res.data) || {};
        if (!d.session_id || !d.verification_url) {
          wx.showToast({ title: "Login start failed", icon: "none" });
          return;
        }

        this.setData({
          authPolling: true,
          authSessionId: d.session_id,
          authUserCode: d.user_code || "",
          authVerificationUrl: d.verification_url,
        });

        this.savePendingAuthSession({
          sessionId: d.session_id,
          userCode: d.user_code || "",
          verificationUrl: d.verification_url,
          interval: Number(d.interval || 3),
          expiresAt: Date.now() + Number((d.expires_in || 600) * 1000),
        });

        wx.setClipboardData({
          data: d.verification_url,
          success: () => {
            wx.showModal({
              title: "Continue in browser",
              content: `Open Safari/Chrome and visit the copied URL.`,
              showCancel: false,
            });
          },
        });

        this.pollLoginStatus(d.session_id, Number(d.interval || 3));
      },
      fail: () => {
        wx.showToast({ title: "Network error", icon: "none" });
      },
    });
  },

  pollLoginStatus: function (sessionId, intervalSec) {
    if (!this.data.authPolling || !sessionId) return;

    wx.request({
      url: `${API_BASE}/auth/device/status?session_id=${encodeURIComponent(sessionId)}`,
      method: "GET",
      success: (res) => {
        if (res.statusCode === 404) {
          this.clearPendingAuthSession();
          this.stopLoginPolling();
          wx.showToast({ title: "Login session reset", icon: "none" });
          this.handleLogin();
          return;
        }

        if (!(res.statusCode >= 200 && res.statusCode < 300)) {
          setTimeout(() => this.pollLoginStatus(sessionId, intervalSec), intervalSec * 1000);
          return;
        }

        const d = (res && res.data) || {};
        const status = d.status;

        if (status === "unknown" || status === "session_not_found") {
          this.clearPendingAuthSession();
          this.stopLoginPolling();
          wx.showToast({ title: "Login session reset", icon: "none" });
          this.handleLogin();
          return;
        }

        if (status === "approved") {
          app.globalData.auth = {
            accessToken: d.access_token || "",
            refreshToken: d.refresh_token || "",
            profile: d.profile || {},
            issuedAt: Date.now(),
          };
          wx.setStorageSync("auth", app.globalData.auth);
          this.clearPendingAuthSession();
          this.stopLoginPolling();
          this.syncAuthState();
          wx.showToast({ title: "Login successful", icon: "success" });
          return;
        }

        if (status === "denied" || status === "expired") {
          this.clearPendingAuthSession();
          this.stopLoginPolling();
          wx.showToast({ title: `Login ${status}`, icon: "none" });
          return;
        }

        setTimeout(() => this.pollLoginStatus(sessionId, intervalSec), intervalSec * 1000);
      },
      fail: () => {
        setTimeout(() => this.pollLoginStatus(sessionId, intervalSec), intervalSec * 1000);
      },
    });
  },

  stopLoginPolling: function () {
    this.setData({
      authPolling: false,
      authSessionId: "",
      authUserCode: "",
      authVerificationUrl: "",
    });
  },

  savePendingAuthSession: function (session) {
    wx.setStorageSync(AUTH_SESSION_STORAGE_KEY, session);
  },

  getPendingAuthSession: function () {
    const session = wx.getStorageSync(AUTH_SESSION_STORAGE_KEY);
    if (!session || !session.sessionId) {
      return null;
    }
    if (session.expiresAt && Date.now() > Number(session.expiresAt)) {
      this.clearPendingAuthSession();
      return null;
    }
    return session;
  },

  clearPendingAuthSession: function () {
    wx.removeStorageSync(AUTH_SESSION_STORAGE_KEY);
  },

  resumePendingAuthSession: function () {
    if (this.data.authPolling) {
      return;
    }

    if (this.isLoggedIn()) {
      this.clearPendingAuthSession();
      return;
    }

    const pending = this.getPendingAuthSession();
    if (!pending || !pending.sessionId) {
      return;
    }

    this.setData({
      authPolling: true,
      authSessionId: pending.sessionId,
      authUserCode: pending.userCode || "",
      authVerificationUrl: pending.verificationUrl || "",
    });

    this.pollLoginStatus(pending.sessionId, Number(pending.interval || 3));
  },

  handleLogout: function () {
    app.globalData.auth = {};
    wx.removeStorageSync("auth");
    this.clearPendingAuthSession();
    this.stopLoginPolling();
    this.syncAuthState();
    wx.showToast({ title: "Logged out", icon: "none" });
  },

  copyAuthUrl: function () {
    const verificationUrl = (this.data.authVerificationUrl || "").trim();
    if (!verificationUrl) {
      wx.showToast({ title: "No URL yet", icon: "none" });
      return;
    }

    wx.setClipboardData({
      data: verificationUrl,
      success: () => {
        wx.showToast({ title: "URL copied", icon: "success" });
      },
    });
  },

  // fetchRecentGmailSubjects: function () {
  //   if (this.data.loadingGmailSubjects) {
  //     return;
  //   }

  //   if (!this.isLoggedIn()) {
  //     wx.showToast({ title: "Login first", icon: "none" });
  //     return;
  //   }

  //   this.setData({ loadingGmailSubjects: true });

  //   const auth = app.globalData.auth || wx.getStorageSync("auth") || {};
  //   const accessToken = auth.accessToken || "";
  //   if (!accessToken) {
  //     this.setData({ loadingGmailSubjects: false });
  //     wx.showToast({ title: "Missing access token", icon: "none" });
  //     return;
  //   }

  //   requestAsync({
  //     url: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
  //     method: "GET",
  //     header: {
  //       Authorization: `Bearer ${accessToken}`,
  //     },
  //     data: {
  //       maxResults: 5,
  //     },
  //   })
  //     .then((listRes) => {
  //       if (!(listRes.statusCode >= 200 && listRes.statusCode < 300)) {
  //         const detail = (listRes.data && (listRes.data.error_description || listRes.data.error)) || "Gmail request failed";
  //         throw new Error(String(detail));
  //       }

  //       const messages = (listRes.data && listRes.data.messages) || [];
  //       if (!messages.length) {
  //         wx.showToast({ title: "No emails found", icon: "none" });
  //         return [];
  //       }

  //       const requests = messages.slice(0, 5).map((msg) =>
  //         requestAsync({
  //           url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
  //           method: "GET",
  //           header: {
  //             Authorization: `Bearer ${accessToken}`,
  //           },
  //           data: {
  //             format: "metadata",
  //             metadataHeaders: "Subject",
  //           },
  //         }),
  //       );

  //       return Promise.all(requests);
  //     })
  //     .then((messageResponses) => {
  //       if (!Array.isArray(messageResponses) || !messageResponses.length) {
  //         return;
  //       }

  //       const subjects = messageResponses
  //         .map((res) => {
  //           const headers = (res.data && res.data.payload && res.data.payload.headers) || [];
  //           const subjectHeader = headers.find((h) => (h.name || "").toLowerCase() === "subject");
  //           return (subjectHeader && subjectHeader.value) || "(No subject)";
  //         })
  //         .slice(0, 5);

  //       const lines = subjects.map((subject, index) => `${index + 1}. ${subject}`).join("\n");
  //       wx.showModal({
  //         title: "Last 5 Email Subjects",
  //         content: lines,
  //         showCancel: false,
  //       });
  //     })
  //     .catch((err) => {
  //       const msg = String((err && err.message) || "Gmail request failed").slice(0, 30);
  //       wx.showToast({ title: msg || "Request failed", icon: "none" });
  //     })
  //     .finally(() => {
  //       this.setData({ loadingGmailSubjects: false });
  //     });
  // },

  onHide: function () {
    this.setData({ authPolling: false });
  },

  onUnload: function () {
    this.setData({ authPolling: false });
  },
});
