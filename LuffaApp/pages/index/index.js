//index.js
const app = getApp()
const luffa = require('../../utils/luffa')
const { defaultIcon } = require('../../utils/icon')
const { defaultSettingsIcon } = require('../../utils/settings_icon')
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
    checkingProfile: false,
    walletConnected: false,
    hasPhotographerProfile: false,
    walletAddress: '',
    walletNickname: '',
    walletUid: '',
    walletCid: ''
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
        walletAddress: wallet.address || '',
        walletNickname: wallet.nickname || '',
        walletUid: wallet.uid || '',
        walletCid: wallet.cid || ''
      })
      this.updateDisplayName()
      this.checkPhotographerProfile(wallet.uid || '')
      return
    }

    this.setData({
      walletConnected: false,
      hasPhotographerProfile: false,
      checkingProfile: false,
      walletAddress: '',
      walletNickname: '',
      walletUid: '',
      walletCid: ''
    })
    this.updateDisplayName()
  },
  checkPhotographerProfile: function (uid, onDone) {
    const finish = (exists) => {
      this.setData({
        hasPhotographerProfile: !!exists,
        checkingProfile: false
      })
      if (typeof onDone === 'function') onDone(!!exists)
    }

    if (!uid) {
      finish(false)
      return
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_URL.includes('supabase.co')) {
      finish(false)
      return
    }

    this.setData({ checkingProfile: true })

    wx.request({
      url: `${SUPABASE_URL}/rest/v1/photographer_profiles?uid=eq.${encodeURIComponent(uid)}&select=uid&limit=1`,
      method: 'GET',
      header: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      success: (res) => {
        const exists = Array.isArray(res.data) && res.data.length > 0
        finish(exists)
      },
      fail: () => {
        finish(false)
      }
    })
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

      app.globalData.wallet = wallet
      wx.setStorageSync('wallet', wallet)
      this.setData({ connectingWallet: false })
      this.syncWalletState()
      wx.showToast({ title: 'Wallet connected', icon: 'success' })

      this.checkPhotographerProfile(wallet.uid || '', (exists) => {
        if (exists) return
        setTimeout(() => {
          wx.navigateTo({
            url: '../profile-intake/profile-intake'
          })
        }, 350)
      })
    }).catch((err) => {
      console.error('Connect wallet failed:', err)
      this.setData({ connectingWallet: false })
      wx.showToast({ title: 'Connection failed', icon: 'none' })
    })
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
