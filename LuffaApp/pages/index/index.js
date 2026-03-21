//index.js
const app = getApp()
const luffa = require('../../utils/luffa')
const { defaultIcon } = require('../../utils/icon')
const { defaultSettingsIcon } = require('../../utils/settings_icon')

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
    title: 'PhotoPal',
    subtitle: 'Plan shoots, track leads, and focus on the work you love.',
    displayName: 'Photographer',
    settingsIcon: defaultSettingsIcon,
    tickIcon: defaultIcon,
    connectingWallet: false,
    walletConnected: false,
    walletAddress: '',
    walletNickname: '',
    walletUid: '',
    walletCid: ''
  },
  onLoad: function () {
    this.updateDisplayName()
    this.syncWalletState()
  },
  onShow: function () {
    this.updateDisplayName()
    this.syncWalletState()
  },
  updateDisplayName: function () {
    const wallet = app.globalData.wallet || {}
    const userInfo = app.globalData.userInfo || {}
    this.setData({
      displayName: wallet.nickname || userInfo.nickName || 'Photographer'
    })
  },
  syncWalletState: function () {
    const wallet = app.globalData.wallet
    if (wallet && wallet.address) {
      this.setData({
        walletConnected: true,
        walletAddress: wallet.address || '',
        walletNickname: wallet.nickname || '',
        walletUid: wallet.uid || '',
        walletCid: wallet.cid || ''
      })
      this.updateDisplayName()
      return
    }

    this.setData({
      walletConnected: false,
      walletAddress: '',
      walletNickname: '',
      walletUid: '',
      walletCid: ''
    })
    this.updateDisplayName()
  },
  onConnectWallet: function () {
    if (this.data.connectingWallet || this.data.walletConnected) {
      return
    }

    this.setData({ connectingWallet: true })

    luffa.connect().then((res) => {
      const wallet = buildWalletFromPayload((res && res.data) || {})
      if (!wallet.address) {
        this.setData({ connectingWallet: false })
        wx.showToast({ title: 'Wallet data unavailable', icon: 'none' })
        return
      }

      app.globalData.wallet = wallet
      wx.setStorageSync('wallet', wallet)
      this.setData({ connectingWallet: false })
      this.syncWalletState()
      wx.showToast({ title: 'Wallet connected', icon: 'success' })
    }).catch((err) => {
      console.error('Connect wallet failed:', err)
      this.setData({ connectingWallet: false })
      wx.showToast({ title: 'Connection failed', icon: 'none' })
    })
  },
  goToSettings: function () {
    wx.navigateTo({
      url: '../settings/settings'
    })
  },
  goToSuggestedOpportunities: function () {
    if (!this.data.walletConnected) {
      wx.showToast({ title: 'Connect wallet first', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: '../suggested-opportunities/suggested-opportunities'
    })
  }
})
