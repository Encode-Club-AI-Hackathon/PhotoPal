let generatedEnv = {}
try {
  generatedEnv = require('./env.generated')
} catch (e) {
  generatedEnv = {}
}

const runtimeEnv = typeof process !== 'undefined' && process.env ? process.env : {}
const env = Object.assign({}, generatedEnv, runtimeEnv)

const AGENT_API_BASE_URL = env.LUFFA_AGENT_API_BASE_URL || ''

module.exports = {
  AGENT_API_BASE_URL,
}
