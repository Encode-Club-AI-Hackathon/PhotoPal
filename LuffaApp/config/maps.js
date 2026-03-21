const runtimeEnv = typeof process !== 'undefined' && process.env ? process.env : {}

const MAPBOX_ACCESS_TOKEN = runtimeEnv.LUFFA_MAPBOX_ACCESS_TOKEN || ''
const MAPBOX_STYLE_ID = runtimeEnv.LUFFA_MAPBOX_STYLE_ID || 'mapbox/streets-v12'

module.exports = {
  MAPBOX_ACCESS_TOKEN,
  MAPBOX_STYLE_ID,
}
