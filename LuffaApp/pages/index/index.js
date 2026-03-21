//index.js
const app = getApp();
const luffa = require("../../utils/luffa");
const { defaultIcon } = require("../../utils/icon");
const { defaultSettingsIcon } = require("../../utils/settings_icon");

const API_BASE = "https://grizzly-organic-kingfish.ngrok-free.app";
const AUTH_SESSION_STORAGE_KEY = "pendingAuthSession";

Page({
  data: {
    title: "PhotoPal",
    subtitle: "Plan shoots, track leads, and focus on the work you love.",
    displayName: "Photographer",
    settingsIcon: defaultSettingsIcon,
    title: "PhotoPal",
    subtitle: "Plan shoots, track leads, and focus on the work you love.",
    displayName: "Photographer",
    settingsIcon: defaultSettingsIcon,
    tickIcon: defaultIcon,
    connectingWallet: false,
    walletConnected: false,
    walletAddress: "",
    walletNickname: "",
    walletUid: "",
    walletCid: "",
    authPolling: false,
    authSessionId: "",
    authUserCode: "",
    authVerificationUrl: "",
  },
  onLoad: function () {
    this.updateDisplayName();
    this.updateDisplayName();
    this.syncWalletState();
    this.resumePendingAuthSession();
  },
  onShow: function () {
    this.updateDisplayName();
    this.updateDisplayName();
    this.syncWalletState();
    this.resumePendingAuthSession();
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
      return;
    }

    this.setData({
      walletConnected: false,
      walletAddress: "",
      walletNickname: "",
      walletUid: "",
      walletCid: "",
    });
    this.updateDisplayName();
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
  goToSuggestedOpportunities: function () {
    if (!this.data.walletConnected) {
      wx.showToast({ title: "Connect wallet first", icon: "none" });
      return;
    }

    wx.navigateTo({
      url: "../suggested-opportunities/suggested-opportunities",
    });
  },
  handleLogin: function () {
    if (this.data.authPolling) return;

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
              content: `Open Safari/Chrome and visit the copied URL.\nCode: ${d.user_code || "-"}`,
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
          };
          wx.setStorageSync("auth", app.globalData.auth);
          this.clearPendingAuthSession();
          this.stopLoginPolling();
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
