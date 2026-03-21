Page({
  data: {
    title: 'Settings'
  },
  goToProfile: function () {
    wx.navigateTo({
      url: '../profile/profile'
    })
  }
})
