const app = getApp()

Page({
  data: {
    title: 'Profile',
    loadingProfile: false,
    profileError: '',
    userInfo: {},
    hasUserInfo: false,
    authSetting: {},
    accountInfo: {},
    sessionStatus: 'Unknown',
    rawProfile: ''
  },
  onLoad: function () {
    this.refreshAvailableInfo()
  },
  onShow: function () {
    this.refreshAvailableInfo()
  },
  refreshAvailableInfo: function () {
    const currentUser = app.globalData.userInfo || {}
    this.setData({
      userInfo: currentUser,
      hasUserInfo: !!currentUser.nickName
    })

    wx.getSetting({
      success: (res) => {
        this.setData({
          authSetting: res.authSetting || {}
        })
      }
    })

    try {
      const account = wx.getAccountInfoSync()
      this.setData({
        accountInfo: (account && account.miniProgram) || {}
      })
    } catch (err) {
      this.setData({
        accountInfo: {}
      })
    }

    wx.checkSession({
      success: () => {
        this.setData({ sessionStatus: 'Valid' })
      },
      fail: () => {
        this.setData({ sessionStatus: 'Expired' })
      }
    })
  },
  getUserProfile: function () {
    this.setData({
      loadingProfile: true,
      profileError: ''
    })

    wx.getUserProfile({
      desc: 'Used to display your profile details in PhotoPal.',
      lang: 'en',
      success: (res) => {
        const info = res.userInfo || {}
        app.globalData.userInfo = info

        this.setData({
          userInfo: info,
          hasUserInfo: !!info.nickName,
          rawProfile: JSON.stringify(res, null, 2)
        })
      },
      fail: (err) => {
        this.setData({
          profileError: (err && err.errMsg) || 'Failed to fetch profile information.'
        })
      },
      complete: () => {
        this.setData({
          loadingProfile: false
        })
      }
    })
  },
  openSettings: function () {
    wx.openSetting({
      success: () => {
        this.refreshAvailableInfo()
      }
    })
  }
})
