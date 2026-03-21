let generatedEnv = {};
try {
  generatedEnv = require("./env.generated");
} catch (e) {
  generatedEnv = {};
}

const runtimeEnv = typeof process !== "undefined" && process.env ? process.env : {};
const env = Object.assign({}, generatedEnv, runtimeEnv);

const AGENT_API_BASE_URL = env.LUFFA_AGENT_API_BASE_URL || "";

function getClientAccessToken() {
  try {
    const app = getApp && getApp();
    const fromGlobal = app && app.globalData && app.globalData.auth && app.globalData.auth.accessToken;
    if (fromGlobal) return fromGlobal;
  } catch (e) {
    // Ignore runtime access issues and fall back to storage.
  }

  try {
    const stored = wx.getStorageSync("auth") || {};
    return stored.accessToken || "";
  } catch (e) {
    return "";
  }
}

function getAgentRequestHeaders(extraHeaders) {
  const headers = Object.assign({ "Content-Type": "application/json" }, extraHeaders || {});
  const token = getClientAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

module.exports = {
  AGENT_API_BASE_URL,
  getClientAccessToken,
  getAgentRequestHeaders,
};
