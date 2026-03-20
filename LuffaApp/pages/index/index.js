//index.js
//get application instance
const { defaultIcon } = require('../../utils/icon');
const app = getApp()


Page({
  data: {
    motto: 'Hello World',
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo')
  },
  // event handler function
  bindViewTap: function () {
    wx.navigateTo({
      url: '../logs/logs'
    })
  },
  onLoad: function () {
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
    } else if (this.data.canIUse) {
      // do someting
    } else {
      // There is no compatibility processing for open-type=getUserInfo version
      wx.getUserInfo({
        success: res => {
          app.globalData.userInfo = res.userInfo
          this.setData({
            userInfo: res.userInfo,
            hasUserInfo: true
          })
        }
      })
    }
  },
  getUserInfo: function (e) {
    console.log('getUserInfo ----> ', e);
    app.globalData.userInfo = e.detail.userInfo || "";
    const userInfo = e.detail.userInfo || {
      avatarUrl: defaultIcon,
      nickName: 'userNickName'
    }
    this.setData({
      userInfo: userInfo,
      hasUserInfo: true
    })
  }
})
