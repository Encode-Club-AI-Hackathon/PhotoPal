//index.js
const app = getApp();
const { defaultSettingsIcon } = require("../../utils/settings_icon");

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
  },
  onLoad: function () {
    this.updateDisplayName();
    this.updateDisplayName();
    this.syncWalletState();
  },
  onShow: function () {
    this.updateDisplayName();
    this.updateDisplayName();
    this.syncWalletState();
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
  handleLogin: function (event) {
    const URL = "http://localhost:8000/custom/login";
    console.log(app.globalData.userInfo);
    wx.navigateTo({
      url: "../suggested-opportunities/suggested-opportunities",
    });
  },
  handleLogin: function (event) {
    const URL = "http://localhost:8000/custom/login";
    console.log(app.globalData.userInfo);
    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(URL)}`,
    });
  },
});
