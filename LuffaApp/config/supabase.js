const runtimeEnv = typeof process !== 'undefined' && process.env ? process.env : {}

const SUPABASE_URL = runtimeEnv.LUFFA_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = runtimeEnv.LUFFA_SUPABASE_ANON_KEY || ''

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
}
