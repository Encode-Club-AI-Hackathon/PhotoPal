//index.js
const app = getApp()
const luffa = require('../../utils/luffa')
const { defaultIcon } = require('../../utils/icon')
const { defaultSettingsIcon } = require('../../utils/settings_icon')
const { defaultInfoIcon } = require('../../utils/info')
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('../../config/supabase')

function buildWalletFromPayload(payload) {
  const data = payload || {}
  return {
    address: data.address || data.walletAddress || '',
    avatarUrl: data.avatar || data.avatarUrl || '',
    avatarFrame: data.avatar_frame || data.avatarFrame || '',
    cid: data.cid || '',
    nickname: data.nickname || data.nickName || 'Anonymous',
    uid: data.uid || ''
  }
}

const API_BASE = "https://grizzly-organic-kingfish.ngrok-free.app";
const AUTH_SESSION_STORAGE_KEY = "pendingAuthSession";
const AUTH_TOKEN_TTL_MS = 15 * 60 * 1000;

Page({
  data: {
    title: "PhotoPal",
    subtitle: "Plan shoots, track leads, and focus on the work you love.",
    displayName: "Photographer",
    settingsIcon: defaultSettingsIcon,
    infoIcon: defaultInfoIcon,
    googleIcon: '/utils/google_icon.png',
    tickIcon: defaultIcon,
    connectingWallet: false,
    checkingProfile: false,
    walletConnected: false,
    hasPhotographerProfile: false,
    walletAddress: '',
    walletNickname: '',
    walletUid: '',
    walletCid: '',
    authPolling: false,
    authSessionId: "",
    authUserCode: "",
    authVerificationUrl: "",
    loggedIn: false,
    showAuthCenter: false,
  },
  onLoad: function () {
    this.updateDisplayName();
    this.updateDisplayName();
    this.syncWalletState();
    this.resumePendingAuthSession();
    this.refreshAuthState();
  },
  onShow: function () {
    this.updateDisplayName();
    this.updateDisplayName();
    this.syncWalletState();
    this.resumePendingAuthSession();
    this.refreshAuthState();
  },
  refreshAuthState: function () {
    const loggedIn = this.isLoggedIn();
    this.setData({
      loggedIn,
      showAuthCenter: !this.data.walletConnected && !loggedIn,
    });
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
      });
      this.updateDisplayName();
      this.checkPhotographerProfile(wallet.uid || "");
      this.setData({ showAuthCenter: false });
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
    });
    this.updateDisplayName();
    this.setData({ showAuthCenter: !this.data.loggedIn });
  },
  checkPhotographerProfile: function (uid, onDone) {
    const finish = (exists) => {
      this.setData({
        hasPhotographerProfile: !!exists,
        checkingProfile: false,
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
      method: 'GET',
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
        this.refreshAuthState();
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
      title: "About",
      content: "PhotoPal helps photographers connect wallet, complete profile, and discover business opportunities.",
      showCancel: false,
      confirmText: "OK",
    });
  },
  goToSuggestedOpportunities: function () {
    if (!this.data.walletConnected) {
      wx.showToast({ title: "Connect wallet first", icon: "none" });
      return;
    }

    if (!this.data.hasPhotographerProfile) {
      wx.showToast({ title: "Complete profile first", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: "../suggested-opportunities/suggested-opportunities",
    });
  },
  goToProfileIntake: function () {
    if (!this.data.walletConnected) {
      wx.showToast({ title: 'Connect wallet first', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: '../profile-intake/profile-intake'
    })
  },
  goToProfile: function () {
    if (!this.data.walletConnected) {
      wx.showToast({ title: 'Connect wallet first', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: '../profile/profile'
    })
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
        const d = (res && res.data) || {};
        const status = d.status;

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
          this.refreshAuthState();
          wx.showToast({ title: "Login successful", icon: "success" });
          return;
        }

        if (status === "denied" || status === "expired") {
          this.clearPendingAuthSession();
          this.stopLoginPolling();
          this.refreshAuthState();
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
      this.refreshAuthState();
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

  onHide: function () {
    this.setData({ authPolling: false });
  },

  onUnload: function () {
    this.setData({ authPolling: false });
  },
});
