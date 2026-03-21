const app = getApp()
const { AGENT_API_BASE_URL } = require('../../config/agent_api')
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('../../config/supabase')

const AGENT_ANALYZE_TIMEOUT_MS = 420000

function normalizeUrl(url) {
  const raw = (url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

function splitCsv(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function cleanHandle(value) {
  return (value || '').replace(/^@+/, '').trim()
}

function normalizeSecondaryNiches(value) {
  if (Array.isArray(value)) return value.map((item) => `${item}`.trim()).filter(Boolean)
  return splitCsv(value)
}

function normalizeProfileFromAgent(rawProfile, fallbackWebsiteUrl, fallbackInstagramHandle) {
  const profile = rawProfile || {}
  return {
    name: (profile.name || '').trim(),
    primary_niche: (profile.primary_niche || '').trim(),
    contact_email: (profile.contact_email || '').trim(),
    website_url: normalizeUrl(profile.website_url || fallbackWebsiteUrl),
    instagram_handle: cleanHandle(profile.instagram_handle || fallbackInstagramHandle) || null,
    secondary_niches: normalizeSecondaryNiches(profile.secondary_niches),
    human_presence: profile.human_presence === null || profile.human_presence === undefined ? null : !!profile.human_presence,
    location_city: (profile.location_city || '').trim(),
    location_country: (profile.location_country || '').trim(),
    willingness_to_travel: !!profile.willingness_to_travel,
    studio_access: !!profile.studio_access
  }
}

function extractJsonObject(text) {
  const source = `${text || ''}`.trim()
  if (!source) return null

  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch ? fencedMatch[1].trim() : source

  try {
    return JSON.parse(candidate)
  } catch (err) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch (secondErr) {
        return null
      }
    }
    return null
  }
}

function comparableProfile(profile) {
  const normalized = normalizeProfileFromAgent(profile, '', '')
  return {
    ...normalized,
    human_presence: !!normalized.human_presence,
    secondary_niches: normalized.secondary_niches
  }
}

function areProfilesEqual(left, right) {
  return JSON.stringify(comparableProfile(left)) === JSON.stringify(comparableProfile(right))
}

Page({
  data: {
    step: 'initial',
    submitting: false,
    saving: false,
    name: '',
    contactEmail: '',
    locationCity: '',
    locationCountry: '',
    instagramHandle: '',
    portfolioUrl: '',
    primaryNiche: '',
    secondaryNiches: '',
    humanPresence: false,
    willingToTravel: false,
    studioAccess: false,
    agentProfileOriginal: null
  },
  onLoad: function () {
    this.setData({
      step: 'initial',
      name: '',
      contactEmail: '',
      locationCity: '',
      locationCountry: '',
      instagramHandle: '',
      portfolioUrl: '',
      primaryNiche: '',
      secondaryNiches: '',
      humanPresence: false,
      willingToTravel: false,
      studioAccess: false,
      agentProfileOriginal: null
    })
  },
  onNameInput: function (e) { this.setData({ name: e.detail.value }) },
  onContactEmailInput: function (e) { this.setData({ contactEmail: e.detail.value }) },
  onLocationCityInput: function (e) { this.setData({ locationCity: e.detail.value }) },
  onLocationCountryInput: function (e) { this.setData({ locationCountry: e.detail.value }) },
  onInstagramInput: function (e) { this.setData({ instagramHandle: e.detail.value }) },
  onPortfolioUrlInput: function (e) { this.setData({ portfolioUrl: e.detail.value }) },
  onPrimaryNicheInput: function (e) { this.setData({ primaryNiche: e.detail.value }) },
  onSecondaryNichesInput: function (e) { this.setData({ secondaryNiches: e.detail.value }) },
  onHumanPresenceChange: function (e) { this.setData({ humanPresence: !!e.detail.value }) },
  onTravelChange: function (e) { this.setData({ willingToTravel: !!e.detail.value }) },
  onStudioChange: function (e) { this.setData({ studioAccess: !!e.detail.value }) },
  onSubmit: function () {
    if (this.data.submitting || this.data.saving) return

    if (this.data.step === 'confirm') {
      this.onConfirmDetails()
      return
    }

    this.onAnalyzePortfolio()
  },
  onAnalyzePortfolio: function () {
    if (this.data.submitting) return

    if (!AGENT_API_BASE_URL) {
      wx.showToast({ title: 'Set LUFFA_AGENT_API_BASE_URL', icon: 'none' })
      return
    }

    const websiteUrl = normalizeUrl(this.data.portfolioUrl)
    if (!websiteUrl) {
      wx.showToast({ title: 'Portfolio link is required', icon: 'none' })
      return
    }

    const payload = {
      website_url: websiteUrl,
      instagram_handle: cleanHandle(this.data.instagramHandle) || null,
      photographer_id: (app.globalData.wallet && app.globalData.wallet.uid) || null
    }

    this.setData({ submitting: true })

    wx.request({
      url: `${AGENT_API_BASE_URL}/agents/portfolio-analyser`,
      method: 'POST',
      timeout: AGENT_ANALYZE_TIMEOUT_MS,
      header: { 'Content-Type': 'application/json' },
      data: payload,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const agentProfile = this.extractAgentProfile(res.data, websiteUrl, this.data.instagramHandle)
          if (!agentProfile || !agentProfile.website_url) {
            wx.showToast({ title: 'Agent returned no profile', icon: 'none' })
            return
          }

          this.populateConfirmForm(agentProfile)

          wx.showToast({ title: 'Review auto-filled details', icon: 'none' })
          return
        }

        const detail = (res.data && (res.data.detail || res.data.error)) || 'Request failed'
        wx.showToast({ title: `${detail}`.slice(0, 30), icon: 'none' })
      },
      fail: (err) => {
        const timeoutErr = err && err.errMsg && err.errMsg.includes('timed out')
        wx.showToast({ title: timeoutErr ? 'Analysis timed out, try again' : 'API unreachable', icon: 'none' })
        console.error('portfolio-analyser request failed:', err)
      },
      complete: () => {
        this.setData({ submitting: false })
      }
    })
  },
  extractAgentProfile: function (responseBody, fallbackWebsite, fallbackInstagram) {
    const profiles =
      (responseBody && responseBody.data && Array.isArray(responseBody.data.profiles) && responseBody.data.profiles) ||
      (responseBody && Array.isArray(responseBody.profiles) && responseBody.profiles) ||
      []

    if (profiles.length) {
      return normalizeProfileFromAgent(profiles[0], fallbackWebsite, fallbackInstagram)
    }

    const rawResponse = responseBody && responseBody.raw_response
    const parsed = extractJsonObject(rawResponse)
    const rawProfiles =
      (parsed && parsed.data && Array.isArray(parsed.data.profiles) && parsed.data.profiles) ||
      (parsed && Array.isArray(parsed.profiles) && parsed.profiles) ||
      []

    if (!rawProfiles.length) return null
    return normalizeProfileFromAgent(rawProfiles[0], fallbackWebsite, fallbackInstagram)
  },
  populateConfirmForm: function (profile) {
    this.setData({
      step: 'confirm',
      name: profile.name || '',
      contactEmail: profile.contact_email || '',
      locationCity: profile.location_city || '',
      locationCountry: profile.location_country || '',
      instagramHandle: profile.instagram_handle || '',
      portfolioUrl: profile.website_url || '',
      primaryNiche: profile.primary_niche || '',
      secondaryNiches: (profile.secondary_niches || []).join(', '),
      humanPresence: !!profile.human_presence,
      willingToTravel: !!profile.willingness_to_travel,
      studioAccess: !!profile.studio_access,
      agentProfileOriginal: profile
    })
  },
  buildProfileFromForm: function () {
    return normalizeProfileFromAgent({
      name: this.data.name,
      primary_niche: this.data.primaryNiche,
      contact_email: this.data.contactEmail,
      website_url: this.data.portfolioUrl,
      instagram_handle: this.data.instagramHandle,
      secondary_niches: this.data.secondaryNiches,
      human_presence: this.data.humanPresence,
      location_city: this.data.locationCity,
      location_country: this.data.locationCountry,
      willingness_to_travel: this.data.willingToTravel,
      studio_access: this.data.studioAccess
    }, this.data.portfolioUrl, this.data.instagramHandle)
  },
  onConfirmDetails: function () {
    const finalProfile = this.buildProfileFromForm()
    if (!finalProfile.website_url) {
      wx.showToast({ title: 'Portfolio link is required', icon: 'none' })
      return
    }

    const originalProfile = normalizeProfileFromAgent(
      this.data.agentProfileOriginal || {},
      this.data.portfolioUrl,
      this.data.instagramHandle
    )
    const wasEdited = !areProfilesEqual(finalProfile, originalProfile)

    if (!wasEdited) {
      this.finalizeCompletion(finalProfile)
      return
    }

    this.saveEditedProfileToSupabase(finalProfile)
  },
  saveEditedProfileToSupabase: function (profile) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_URL.includes('supabase.co')) {
      wx.showToast({ title: 'Supabase config missing', icon: 'none' })
      return
    }

    const photographerId = (app.globalData.wallet && app.globalData.wallet.uid) || ''
    if (!photographerId) {
      wx.showToast({ title: 'Photographer ID missing', icon: 'none' })
      return
    }

    const row = {
      photographer_id: photographerId,
      name: profile.name || null,
      primary_niche: profile.primary_niche || null,
      contact_email: profile.contact_email || null,
      website_url: profile.website_url || null,
      instagram_handle: profile.instagram_handle || null,
      secondary_niches: profile.secondary_niches || [],
      human_presence: profile.human_presence,
      location_city: profile.location_city || null,
      location_country: profile.location_country || null,
      willingness_to_travel: !!profile.willingness_to_travel,
      studio_access: !!profile.studio_access
    }

    this.setData({ saving: true })

    wx.request({
      url: `${SUPABASE_URL}/rest/v1/photographer_profiles?on_conflict=photographer_id`,
      method: 'POST',
      header: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      data: row,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          wx.showToast({ title: 'Changes saved', icon: 'success' })
          this.finalizeCompletion(profile)
          return
        }

        const detail =
          (res.data && (res.data.message || res.data.error || res.data.details || res.data.hint)) ||
          'Save failed'
        wx.showToast({ title: `${detail}`.slice(0, 30), icon: 'none' })
        console.error('supabase save failed:', res)
      },
      fail: (err) => {
        wx.showToast({ title: 'Save failed', icon: 'none' })
        console.error('supabase save request failed:', err)
      },
      complete: () => {
        this.setData({ saving: false })
      }
    })
  },
  finalizeCompletion: function (profile) {
    wx.showToast({ title: 'Profile confirmed', icon: 'success' })
    setTimeout(() => {
      wx.navigateBack()
    }, 500)
  }
})
