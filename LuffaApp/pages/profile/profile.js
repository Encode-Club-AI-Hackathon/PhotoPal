const app = getApp()
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('../../config/supabase')

function normalizeUrl(url) {
  const raw = (url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

function formatSecondaryNiches(niches) {
  if (Array.isArray(niches)) return niches.filter(Boolean).join(', ')
  return `${niches || ''}`.trim()
}

Page({
  data: {
    title: 'My Profile',
    loadingProfile: false,
    profileError: '',
    walletConnected: false,
    walletUid: '',
    walletAddress: '',
    hasPhotographerProfile: false,
    photographerProfile: null
  },
  onLoad: function () {
    this.refreshProfileData()
  },
  onShow: function () {
    this.refreshProfileData()
  },
  refreshProfileData: function () {
    const wallet = app.globalData.wallet || {}
    const walletConnected = !!wallet.address
    const walletUid = wallet.uid || ''

    this.setData({
      walletConnected,
      walletUid,
      walletAddress: wallet.address || '',
      profileError: ''
    })

    if (!walletConnected || !walletUid) {
      this.setData({
        hasPhotographerProfile: false,
        photographerProfile: null,
        profileError: walletConnected ? 'Wallet UID missing.' : 'Connect wallet to view profile.'
      })
      return
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_URL.includes('supabase.co')) {
      this.setData({
        hasPhotographerProfile: false,
        photographerProfile: null,
        profileError: 'Supabase config missing.'
      })
      return
    }

    this.setData({
      loadingProfile: true,
      profileError: ''
    })

    wx.request({
      url: `${SUPABASE_URL}/rest/v1/photographer_profiles?photographer_id=eq.${encodeURIComponent(walletUid)}&select=photographer_id,name,primary_niche,contact_email,website_url,instagram_handle,secondary_niches,human_presence,location_city,location_country,willingness_to_travel,studio_access&limit=1`,
      method: 'GET',
      header: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      success: (res) => {
        const row = Array.isArray(res.data) && res.data.length ? res.data[0] : null
        if (!row) {
          this.setData({
            hasPhotographerProfile: false,
            photographerProfile: null,
            profileError: 'No profile found yet. Complete profile analysis first.'
          })
          return
        }

        this.setData({
          hasPhotographerProfile: true,
          photographerProfile: {
            uid: row.uid || '',
            name: row.name || '',
            primaryNiche: row.primary_niche || '',
            contactEmail: row.contact_email || '',
            websiteUrl: normalizeUrl(row.website_url || ''),
            instagramHandle: row.instagram_handle || '',
            secondaryNiches: formatSecondaryNiches(row.secondary_niches),
            humanPresence: row.human_presence === null || row.human_presence === undefined ? '' : (row.human_presence ? 'Yes' : 'No'),
            locationCity: row.location_city || '',
            locationCountry: row.location_country || '',
            willingnessToTravel: row.willingness_to_travel ? 'Yes' : 'No',
            studioAccess: row.studio_access ? 'Yes' : 'No'
          }
        })
      },
      fail: (err) => {
        this.setData({
          hasPhotographerProfile: false,
          photographerProfile: null,
          profileError: (err && err.errMsg) || 'Failed to load profile.'
        })
      },
      complete: () => {
        this.setData({
          loadingProfile: false
        })
      }
    })
  },
  openWebsite: function () {
    const profile = this.data.photographerProfile || {}
    const url = normalizeUrl(profile.websiteUrl || '')
    if (!url) {
      wx.showToast({ title: 'No portfolio URL', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(url)}`
    })
  }
})
