const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('../../config/supabase')
const { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLE_ID } = require('../../config/maps')

Page({
  data: {
    title: 'Suggested Opportunities',
    leads: [],
    activeContactLeadKey: '',
    loading: false,
    errorMessage: ''
  },
  onLoad: function () {
    this.fetchSuggestedLeads()
  },
  fetchSuggestedLeads: function () {
    if (!SUPABASE_URL.includes('supabase.co') || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
      this.setData({
        errorMessage: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in config/supabase.js first.'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.request({
      url: `${SUPABASE_URL}/rest/v1/businesses?select=id,website,created_at,lon,lat,business_name,type,contact_name,email_address,phone_number,notes_needs&order=created_at.desc`,
      method: 'GET',
      header: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      success: (res) => {
        const leads = Array.isArray(res.data)
          ? res.data.map((item, index) => {
            const location = this.parseCoordinates(item.lat, item.lon, index)
            return {
              id: item.id || item.website || `lead-${index}`,
              leadKey: `${item.id || item.website || 'lead'}-${index}`,
              website: item.website || '',
              businessName: item.business_name || 'Untitled Business',
              type: item.type || 'General',
              contactName: item.contact_name || '',
              emailAddress: item.email_address || '',
              phoneNumber: item.phone_number || '',
              notesNeeds: item.notes_needs || '',
              hasCoordinates: location.hasCoordinates,
              latitude: location.latitude,
              longitude: location.longitude,
              staticMapUrl: location.staticMapUrl,
              browserMapUrl: location.browserMapUrl
            }
          })
          : []

        this.setData({
          leads,
          activeContactLeadKey: ''
        })
      },
      fail: (err) => {
        this.setData({
          errorMessage: `Unable to load opportunities. ${err && err.errMsg ? err.errMsg : ''}`
        })
      },
      complete: () => {
        this.setData({
          loading: false
        })
      }
    })
  },
  parseCoordinates: function (lat, lon) {
    let safeLat = Number(lat)
    let safeLon = Number(lon)

    if (Number.isNaN(safeLat) || Number.isNaN(safeLon)) {
      return {
        hasCoordinates: false,
        latitude: 0,
        longitude: 0,
        staticMapUrl: '',
        browserMapUrl: ''
      }
    }

    // Handle datasets where latitude/longitude are accidentally swapped.
    if (Math.abs(safeLat) > 90 && Math.abs(safeLon) <= 90) {
      const tmp = safeLat
      safeLat = safeLon
      safeLon = tmp
    }

    if (Math.abs(safeLat) > 90 || Math.abs(safeLon) > 180) {
      return {
        hasCoordinates: false,
        latitude: 0,
        longitude: 0,
        staticMapUrl: '',
        browserMapUrl: ''
      }
    }

    const latFixed = safeLat.toFixed(6)
    const lonFixed = safeLon.toFixed(6)
    const styleId = MAPBOX_STYLE_ID || 'mapbox/streets-v12'
    const tokenQuery = MAPBOX_ACCESS_TOKEN ? `?access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}` : ''
    const staticMapUrl = MAPBOX_ACCESS_TOKEN
      ? `https://api.mapbox.com/styles/v1/${styleId}/static/pin-s+ff3b30(${lonFixed},${latFixed})/${lonFixed},${latFixed},14,0/640x360${tokenQuery}`
      : ''
    const browserMapUrl = `https://www.openstreetmap.org/?mlat=${latFixed}&mlon=${lonFixed}#map=15/${latFixed}/${lonFixed}`

    return {
      hasCoordinates: true,
      latitude: safeLat,
      longitude: safeLon,
      staticMapUrl,
      browserMapUrl
    }
  },
  toggleContact: function (event) {
    const leadKey = event.currentTarget.dataset.leadKey || ''
    if (!leadKey) {
      return
    }

    const isCurrentlyOpen = this.data.activeContactLeadKey === leadKey
    this.setData({
      activeContactLeadKey: isCurrentlyOpen ? '' : leadKey
    })
  },
  callPhone: function (event) {
    const phone = event.currentTarget.dataset.phone
    if (!phone) {
      wx.showToast({
        title: 'No phone number',
        icon: 'none'
      })
      return
    }

    wx.makePhoneCall({
      phoneNumber: `${phone}`
    })
  },
  copyEmail: function (event) {
    const email = event.currentTarget.dataset.email
    if (!email) {
      wx.showToast({
        title: 'No email address',
        icon: 'none'
      })
      return
    }

    wx.setClipboardData({
      data: `${email}`
    })
  },
  openWebsite: function (event) {
    const rawWebsite = (event.currentTarget.dataset.website || '').trim()
    if (!rawWebsite) {
      wx.showToast({
        title: 'No website URL',
        icon: 'none'
      })
      return
    }

    const normalized = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`

    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(normalized)}`,
      fail: () => {
        wx.showToast({
          title: 'Unable to open website',
          icon: 'none'
        })
      }
    })
  },
  openInMap: function (event) {
    const mapUrl = (event.currentTarget.dataset.mapurl || '').trim()
    const latitude = Number(event.currentTarget.dataset.lat)
    const longitude = Number(event.currentTarget.dataset.lon)

    if (!mapUrl && (Number.isNaN(latitude) || Number.isNaN(longitude))) {
      wx.showToast({
        title: 'Location unavailable',
        icon: 'none'
      })
      return
    }

    const fallbackMapUrl = `https://www.openstreetmap.org/?mlat=${latitude.toFixed(6)}&mlon=${longitude.toFixed(6)}#map=15/${latitude.toFixed(6)}/${longitude.toFixed(6)}`
    const targetUrl = mapUrl || fallbackMapUrl

    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(targetUrl)}`,
      fail: () => {
        wx.showToast({
          title: 'Unable to open map',
          icon: 'none'
        })
      }
    })
  }
})
