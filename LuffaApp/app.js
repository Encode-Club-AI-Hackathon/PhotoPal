
//app.js
App({
  onLaunch: function () {
    // show localstorage
    let logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // login
    wx.login({
      success: res => {
        // get custom login info res
      }
    })
    // get user settings
    wx.getSetting({
      success: res => {
        if (res.authSetting['scope.userInfo']) {
          // Already authorized, you can directly call getUserInfo to get the avatar nickname without popping up
          wx.getUserInfo({
            success: res => {
              // get custom user info res
              this.globalData.userInfo = res.userInfo;
            }
          })
        }
      }
    })
  },
  globalData: {
    userInfo: null
  }
})