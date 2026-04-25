const BACKBOARD_API_KEY =
  process.env.BACKBOARD_API_KEY || process.env.EXPO_PUBLIC_BACKBOARD_API_KEY;
const BACKBOARD_BASE_URL = process.env.BACKBOARD_BASE_URL || 'https://api.backboard.ai/v1';

function isConfigured() {
  return Boolean(BACKBOARD_API_KEY);
}

async function request(path, options = {}) {
  if (!isConfigured()) return null;

  const response = await fetch(`${BACKBOARD_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${BACKBOARD_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Backboard request failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function createThread() {
  const data = await request('/threads', {
    method: 'POST',
    body: JSON.stringify({ metadata: { incident: 'Ember Mission' } }),
  });

  return data?.id || null;
}

async function addMessage(threadId, message) {
  if (!threadId) return null;
  return request(`/threads/${threadId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ role: 'user', content: JSON.stringify(message) }),
  });
}

async function getThreadSummary(threadId) {
  if (!threadId) return null;
  return request(`/threads/${threadId}/summary`);
}

module.exports = {
  createThread,
  addMessage,
  getThreadSummary,
};

