const luffa = require('../../utils/luffa')
const app = getApp()

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
    title: 'Settings',
    connecting: false,
    connected: false,
    address: '',
    nickname: '',
    uid: '',
    cid: '',
    avatarUrl: '',
    avatarFrame: ''
  },
  onLoad: function () {
    this.syncWalletState()
  },
  onShow: function () {
    this.syncWalletState()
  },
  syncWalletState: function () {
    const wallet = app.globalData.wallet
    if (wallet) {
      this.setData({
        connected: true,
        address: wallet.address || '',
        nickname: wallet.nickname || '',
        uid: wallet.uid || '',
        cid: wallet.cid || '',
        avatarUrl: wallet.avatarUrl || '',
        avatarFrame: wallet.avatarFrame || ''
      })
      return
    }

    this.setData({
      connected: false,
      address: '',
      nickname: '',
      uid: '',
      cid: '',
      avatarUrl: '',
      avatarFrame: ''
    })
  },
  goToProfile: function () {
    wx.navigateTo({
      url: '../profile/profile'
    })
  },
  onConnectWallet: function () {
    if (this.data.connecting) {
      return
    }

    this.setData({ connecting: true })

    luffa.connect().then((res) => {
      const payload = (res && res.data) || {}
      const wallet = buildWalletFromPayload(payload)

      if (!wallet.address) {
        this.setData({ connecting: false })
        wx.showToast({ title: 'Wallet data unavailable', icon: 'none' })
        return
      }

      app.globalData.wallet = wallet
      wx.setStorageSync('wallet', wallet)

      this.setData({
        connecting: false,
        connected: true,
        address: wallet.address,
        nickname: wallet.nickname,
        uid: wallet.uid,
        cid: wallet.cid,
        avatarUrl: wallet.avatarUrl,
        avatarFrame: wallet.avatarFrame
      })

      wx.showToast({ title: 'Wallet connected', icon: 'success' })
    }).catch((err) => {
      console.error('Connect wallet failed:', err)
      this.setData({ connecting: false })
      wx.showToast({ title: 'Connection failed', icon: 'none' })
    })
  },
  onDisconnectWallet: function () {
    app.globalData.wallet = null
    wx.removeStorageSync('wallet')
    this.syncWalletState()
    wx.showToast({ title: 'Wallet disconnected', icon: 'success' })
  }
})
