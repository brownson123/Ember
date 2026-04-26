// Backboard.io client for stateful LLM + memory.
// Backboard expects:
//   - Header `X-API-Key: <key>` (NOT Authorization: Bearer)
//   - Base path under /api on https://app.backboard.io

const BACKBOARD_API_KEY =
  process.env.BACKBOARD_API_KEY || process.env.EXPO_PUBLIC_BACKBOARD_API_KEY;

const RAW_BASE = process.env.BACKBOARD_BASE_URL || 'https://app.backboard.io/';
// Normalize: strip trailing slash, then ensure /api suffix.
const TRIMMED = RAW_BASE.replace(/\/+$/, '');
const BACKBOARD_BASE_URL = TRIMMED.endsWith('/api') ? TRIMMED : `${TRIMMED}/api`;

const DEFAULT_PROVIDER = process.env.BACKBOARD_PROVIDER || 'anthropic';
const DEFAULT_MODEL = process.env.BACKBOARD_MODEL || 'claude-3-haiku-20240307';
const TRIAGE_ASSISTANT_NAME = 'Nexus Link Mission Triage';
const TRIAGE_SYSTEM_PROMPT = `You are an emergency-response AI for the Nexus Link mission-coordination platform. You receive chat messages from field responders. For each message decide whether it contains mission-relevant intel (objectives, casualty/civilian counts, hazards, progress updates, sector status, resource needs). Reply with ONLY strict JSON in this exact shape, no markdown, no preamble:
{"worthTracking": <true|false>, "analysis": "<one human-friendly sentence summarizing the situation>", "protocol": "<one actionable instruction>", "riskLevel": "Low|Moderate|High|Critical|Unknown"}
Rules:
- worthTracking=true ONLY when there is real intel; greetings, chitchat, opinions => false.
- analysis must be human-readable for a voice alert (e.g., "Seven civilians are trapped in an active building fire.").
- protocol is the action plan (e.g., "Add '7 trapped civilians' to mission objectives and update situational awareness.").
- riskLevel reflects life-safety risk inferred from the message.`;

let cachedAssistantId = null;

// Health state: assume unhealthy until startup probe (or a successful call) flips it.
const health = {
  available: false,
  lastCheckedAt: 0,
  lastError: null,
};
let recheckTimer = null;

function isConfigured() {
  return Boolean(BACKBOARD_API_KEY) && !/^your[-_]/.test(BACKBOARD_API_KEY);
}

function isAvailable() {
  return health.available;
}

function getHealth() {
  return { ...health };
}

function markHealthy() {
  if (!health.available) console.log('Backboard: marked HEALTHY (now primary AI).');
  health.available = true;
  health.lastError = null;
  health.lastCheckedAt = Date.now();
}

function markUnhealthy(err) {
  const message = err?.message || String(err || 'unknown');
  if (health.available) console.warn(`Backboard: marked UNHEALTHY — falling back to Gemma. Reason: ${message}`);
  health.available = false;
  health.lastError = message;
  health.lastCheckedAt = Date.now();
}

async function request(path, { method = 'GET', body, timeoutMs = 30000 } = {}) {
  if (!isConfigured()) throw new Error('Backboard not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BACKBOARD_BASE_URL}${path}`, {
      method,
      headers: {
        'X-API-Key': BACKBOARD_API_KEY,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Backboard ${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function listAssistants() {
  return request('/assistants');
}

async function createAssistant({ name, systemPrompt }) {
  return request('/assistants', {
    method: 'POST',
    body: { name, system_prompt: systemPrompt },
  });
}

async function getOrCreateTriageAssistant() {
  if (cachedAssistantId) return cachedAssistantId;
  if (!isConfigured()) throw new Error('Backboard not configured');

  try {
    const list = await listAssistants();
    const arr = Array.isArray(list) ? list : list?.data || [];
    const existing = arr.find((a) => a?.name === TRIAGE_ASSISTANT_NAME);
    if (existing?.assistant_id || existing?.id) {
      cachedAssistantId = existing.assistant_id || existing.id;
      return cachedAssistantId;
    }
  } catch (err) {
    console.warn('Backboard: list assistants failed:', err.message);
  }

  const created = await createAssistant({
    name: TRIAGE_ASSISTANT_NAME,
    systemPrompt: TRIAGE_SYSTEM_PROMPT,
  });
  cachedAssistantId = created?.assistant_id || created?.id || null;
  if (!cachedAssistantId) throw new Error('Backboard: failed to create triage assistant');
  return cachedAssistantId;
}

async function createThread() {
  const assistantId = await getOrCreateTriageAssistant();
  const data = await request(`/assistants/${assistantId}/threads`, {
    method: 'POST',
    body: {},
  });
  return data?.thread_id || null;
}

async function runMessage(threadId, content, {
  provider = DEFAULT_PROVIDER,
  model = DEFAULT_MODEL,
  timeoutMs = 45000,
} = {}) {
  if (!threadId) throw new Error('Backboard: thread_id required');
  try {
    const data = await request(`/threads/${threadId}/messages`, {
      method: 'POST',
      body: { content, llm_provider: provider, model_name: model },
      timeoutMs,
    });
    if (data?.status && String(data.status).toUpperCase() === 'FAILED') {
      markUnhealthy(new Error(data.content || 'Backboard run FAILED'));
    } else {
      markHealthy();
    }
    return data;
  } catch (err) {
    markUnhealthy(err);
    throw err;
  }
}

let healthCheckInFlight = null;
async function healthCheck() {
  if (healthCheckInFlight) return healthCheckInFlight;
  healthCheckInFlight = (async () => {
    if (!isConfigured()) {
      markUnhealthy(new Error('Backboard not configured (API key missing or placeholder)'));
      return false;
    }
    try {
      const tid = await createThread();
      const data = await request(`/threads/${tid}/messages`, {
        method: 'POST',
        body: {
          content: 'health-check ping. Reply only with the JSON {"ok":true}.',
          llm_provider: DEFAULT_PROVIDER,
          model_name: DEFAULT_MODEL,
        },
        timeoutMs: 20000,
      });
      if (data?.status && String(data.status).toUpperCase() === 'FAILED') {
        markUnhealthy(new Error(data.content || 'Backboard run FAILED'));
        return false;
      }
      markHealthy();
      return true;
    } catch (err) {
      markUnhealthy(err);
      return false;
    } finally {
      healthCheckInFlight = null;
    }
  })();
  return healthCheckInFlight;
}

function startHealthMonitor({ intervalMs = 5 * 60 * 1000 } = {}) {
  if (recheckTimer) return;
  recheckTimer = setInterval(() => {
    if (!health.available) {
      console.log('Backboard: re-checking health...');
      healthCheck().catch(() => {});
    }
  }, intervalMs);
  if (typeof recheckTimer.unref === 'function') recheckTimer.unref();
}

function stopHealthMonitor() {
  if (recheckTimer) {
    clearInterval(recheckTimer);
    recheckTimer = null;
  }
}

async function addMemory(content, metadata) {
  const assistantId = await getOrCreateTriageAssistant();
  return request(`/assistants/${assistantId}/memories`, {
    method: 'POST',
    body: { content, metadata: metadata || undefined },
  });
}

// Backward-compatible logger used elsewhere in the server. It now writes to
// Backboard memory (cheap / available on free tier) instead of running an LLM.
async function addMessage(_threadId, message) {
  if (!isConfigured()) return null;
  try {
    const content = typeof message === 'string' ? message : JSON.stringify(message);
    return await addMemory(content, { source: 'event_log', kind: message?.type || 'message' });
  } catch (err) {
    console.warn('Backboard addMessage(memory) failed:', err.message);
    return null;
  }
}

async function getThreadSummary() {
  // Backboard has no per-thread summary endpoint. Return null so the server
  // gracefully omits the field instead of erroring on rejoin.
  return null;
}

module.exports = {
  isConfigured,
  isAvailable,
  getHealth,
  healthCheck,
  startHealthMonitor,
  stopHealthMonitor,
  getOrCreateTriageAssistant,
  createThread,
  runMessage,
  addMemory,
  addMessage,
  getThreadSummary,
};
