let generatedEnv = {}
try {
  // Mini program runtime does not inject .env into process.env.
  generatedEnv = require('./env.generated')
} catch (e) {
  generatedEnv = {}
}

const runtimeEnv = typeof process !== 'undefined' && process.env ? process.env : {}
const env = Object.assign({}, generatedEnv, runtimeEnv)

const SUPABASE_URL = env.LUFFA_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = env.LUFFA_SUPABASE_ANON_KEY || ''

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
}
