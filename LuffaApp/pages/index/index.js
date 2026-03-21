//index.js
const app = getApp();

const { defaultSettingsIcon } = require("../../utils/settings_icon");

Page({
  data: {
    title: "PhotoPal",
    subtitle: "Plan shoots, track leads, and focus on the work you love.",
    displayName: "Photographer",
    settingsIcon: defaultSettingsIcon,
  },
  onLoad: function () {
    this.updateDisplayName();
  },
  onShow: function () {
    this.updateDisplayName();
  },
  updateDisplayName: function () {
    const userInfo = app.globalData.userInfo || {};
    this.setData({
      displayName: userInfo.nickName || "Photographer",
    });
  },
  goToSettings: function () {
    wx.navigateTo({
      url: "../settings/settings",
    });
  },
  goToSuggestedOpportunities: function () {
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
