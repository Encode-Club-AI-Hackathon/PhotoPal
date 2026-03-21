let generatedEnv = {}
try {
  // Mini program runtime does not inject .env into process.env.
  generatedEnv = require('./env.generated')
} catch (e) {
  generatedEnv = {}
}

const runtimeEnv = typeof process !== 'undefined' && process.env ? process.env : {}
const env = Object.assign({}, generatedEnv, runtimeEnv)

const MAPBOX_ACCESS_TOKEN = env.LUFFA_MAPBOX_ACCESS_TOKEN || ''
const MAPBOX_STYLE_ID = env.LUFFA_MAPBOX_STYLE_ID || 'mapbox/streets-v12'

module.exports = {
  MAPBOX_ACCESS_TOKEN,
  MAPBOX_STYLE_ID,
}
