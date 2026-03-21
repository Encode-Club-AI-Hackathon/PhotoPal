Page({
  data: {
    url: ''
  },
  onLoad: function (options) {
    const incoming = options && options.url ? decodeURIComponent(options.url) : ''
    this.setData({
      url: incoming
    })
  }
})
