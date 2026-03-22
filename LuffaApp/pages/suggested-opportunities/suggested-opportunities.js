const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('../../config/supabase')
const { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLE_ID } = require('../../config/maps')

Page({
  data: {
    title: 'Suggested Opportunities',
    leads: [],
    activeContactLeadKey: '',
    loading: false,
    errorMessage: '',
    radiusKm: 50.0,
    limitCount: 20
  },
  onLoad: function () {
    this.fetchSuggestedLeads()
  },
  requestSpatialRpc: function (latitude, longitude, onSuccess, onFailure) {
    const attempts = [
      { user_lat: latitude, user_lon: longitude, radius_meters: 50000, result_limit: this.data.limitCount },
      { latitude, longitude, radius_meters: 50000, result_limit: this.data.limitCount },
      { lat: latitude, lon: longitude, radius_meters: 50000, limit: this.data.limitCount }
    ]

    const tryRequest = (index) => {
      if (index >= attempts.length) {
        onFailure('RPC call failed. Check function arguments and RLS policies.')
        return
      }

      wx.request({
        url: `${SUPABASE_URL}/rest/v1/rpc/suggest_businesses_for_photographer`,
        method: 'POST',
        header: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        data: attempts[index],
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300 && Array.isArray(res.data)) {
            onSuccess(res.data)
            return
          }

          const detail = res && res.data && res.data.message ? `${res.data.message}` : ''
          if (res.statusCode === 404 || res.statusCode === 400) {
            tryRequest(index + 1)
            return
          }
          onFailure(`HTTP ${res.statusCode}. ${detail}`.trim())
        },
        fail: (err) => {
          onFailure((err && err.errMsg) || 'Network request failed')
        }
      })
    }

    tryRequest(0)
  },
  resolvePhotographerCoordinates: function (photographerId, onSuccess, onFailure) {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/photographer_profiles?photographer_id=eq.${encodeURIComponent(photographerId)}&select=*&limit=1`,
      method: 'GET',
      header: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300 || !Array.isArray(res.data) || !res.data.length) {
          onFailure('Could not load photographer location.')
          return
        }

        const row = res.data[0] || {}
        const latitude = Number(row.latitude !== undefined && row.latitude !== null ? row.latitude : row.lat)
        const longitude = Number(row.longitude !== undefined && row.longitude !== null ? row.longitude : row.lon)

        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
          onFailure('Photographer location is missing. Please update your profile location.')
          return
        }

        onSuccess(latitude, longitude)
      },
      fail: (err) => {
        onFailure((err && err.errMsg) || 'Failed to fetch photographer location')
      }
    })
  },
  fetchSuggestedLeads: function () {
    const app = getApp()
    const wallet = app && app.globalData && app.globalData.wallet
    const walletUid = wallet && wallet.uid ? `${wallet.uid}`.trim() : ''

    if (!walletUid) {
      this.setData({
        errorMessage: 'Unable to identify current user. Please log in again.'
      })
      return
    }

    if (!SUPABASE_URL.includes('supabase.co') || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
      this.setData({
        errorMessage: 'Supabase configuration is missing in config/supabase.js.'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: ''
    })

    this.resolvePhotographerCoordinates(
      walletUid,
      (latitude, longitude) => {
        this.requestSpatialRpc(
          latitude,
          longitude,
          (rows) => {
            const leads = rows.map((item, index) => {
              const location = this.parseCoordinates(item.lat, item.lon, index)
              const distanceMeters = Number(item.distance)
              const hasDistance = !Number.isNaN(distanceMeters)
              const distanceKmValue = hasDistance ? distanceMeters / 1000 : null
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
                distanceKm: distanceKmValue !== null ? distanceKmValue.toFixed(2) : 'Unknown',
                matchScore: hasDistance ? Math.max(0, 100 - distanceKmValue) : 0,
                matchReason: 'Nearby business (location filtered)',
                hasCoordinates: location.hasCoordinates,
                latitude: location.latitude,
                longitude: location.longitude,
                staticMapUrl: location.staticMapUrl,
                browserMapUrl: location.browserMapUrl
              }
            })

            this.setData({
              leads,
              activeContactLeadKey: '',
              loading: false,
              errorMessage: ''
            })
          },
          (message) => {
            this.setData({
              leads: [],
              activeContactLeadKey: '',
              loading: false,
              errorMessage: `Unable to load opportunities. ${message}`
            })
          }
        )
      },
      (message) => {
        this.setData({
          leads: [],
          activeContactLeadKey: '',
          loading: false,
          errorMessage: `Unable to load opportunities. ${message}`
        })
      }
    )
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
