var NETWORK = 'endless'

function create16String() {
  var len = 16
  var chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'
  var result = ''
  for (var i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function connect(metadata) {
  return new Promise(function (resolve, reject) {
    wx.invokeNativePlugin({
      api_name: 'luffaWebRequest',
      data: {
        uuid: create16String(),
        methodName: 'connect',
        initData: {
          network: NETWORK
        },
        metadata: {
          superBox: true,
          url: (metadata && metadata.url) || '',
          icon: (metadata && metadata.icon) || ''
        },
        from: '',
        data: {}
      },
      success: function (res) { resolve(res) },
      fail: function (err) { reject(err) }
    })
  })
}

module.exports = {
  NETWORK: NETWORK,
  connect: connect
}
