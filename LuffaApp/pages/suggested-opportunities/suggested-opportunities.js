Page({
  data: {
    title: 'Suggested Opportunities',
    leads: [],
    loading: false,
    errorMessage: ''
  },
  onLoad: function () {
    this.fetchSuggestedLeads()
  },
  fetchSuggestedLeads: function () {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.request({
      url: 'http://127.0.0.1:8000/api/leads/suggested',
      method: 'GET',
      success: (res) => {
        const leads = (res.data && res.data.leads) || []
        this.setData({
          leads
        })
      },
      fail: () => {
        this.setData({
          errorMessage: 'Unable to load opportunities right now.'
        })
      },
      complete: () => {
        this.setData({
          loading: false
        })
      }
    })
  }
})
