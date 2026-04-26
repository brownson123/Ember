const vision = require('@google-cloud/vision');
const backboard = require('./backboard');

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

const fs = require('fs');
const VISION_TIMEOUT_MS = Number(process.env.VISION_TIMEOUT_MS || 15000);

let visionClient = null;
const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (credsPath && !fs.existsSync(credsPath)) {
  console.warn(`Google Vision: GOOGLE_APPLICATION_CREDENTIALS path does not exist (${credsPath}) — Vision disabled.`);
} else {
  try {
    visionClient = new vision.ImageAnnotatorClient();
    console.log('Google Vision client initialized.');
  } catch (err) {
    console.warn('Google Vision client failed to initialize — image analysis disabled:', err.message);
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

const PROTOCOL_MAP = {
  chlorine: 'Evacuate 100m radius, deploy Level A protection, ventilate area.',
  ammonia: 'Evacuate 50m, wear SCBA, use water fog to absorb vapors.',
  'sulfuric acid': 'Contain spill, use calcium carbonate to neutralize, avoid water.',
  fire: 'Initiate fire suppression, evacuate civilians, check for structural damage.',
  default: 'Approach with caution. Refer to hazardous materials guide.',
};

async function cloudVisionAnalyze(imageBase64) {
  if (!visionClient) throw new Error('Vision client not initialized');
  const request = {
    image: { content: imageBase64 },
    features: [
      { type: 'TEXT_DETECTION' },
      { type: 'LABEL_DETECTION', maxResults: 5 },
      { type: 'OBJECT_LOCALIZATION', maxResults: 5 },
    ],
  };

  const [result] = await withTimeout(
    visionClient.annotateImage(request),
    VISION_TIMEOUT_MS,
    'Cloud Vision',
  );
  const text = result.textAnnotations?.[0]?.description || '';
  const labels = result.labelAnnotations?.map((label) => label.description) || [];
  const objects = result.localizedObjectAnnotations?.map((obj) => obj.name) || [];

  return {
    text: text.trim(),
    objects: [...new Set([...labels, ...objects])],
  };
}

function lookupProtocol(detectedObjects = [], text = '') {
  const combined = [...detectedObjects, String(text).toLowerCase()];
  for (const [key, protocol] of Object.entries(PROTOCOL_MAP)) {
    if (combined.some((entry) => String(entry).toLowerCase().includes(key))) {
      return protocol;
    }
  }
  return PROTOCOL_MAP.default;
}

async function gemmaOfflineAnalysis(text = '', objects = []) {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return lookupProtocol(objects, text);
}

function buildFallbackMissionInfo(approvedItems = []) {
  const hazards = approvedItems.filter((i) => i.type === 'hazard');

  if (hazards.length === 0) {
    return {
      summary: 'AI briefing will appear once a hazard photo has been approved.',
      hazards: [],
      riskLevel: 'Unknown',
    };
  }

  const riskLevel = hazards.length <= 1 ? 'Low'
    : hazards.length <= 3 ? 'Moderate'
    : 'High';

  const summary = [
    `${hazards.length} approved AI recommendation${hazards.length > 1 ? 's' : ''}: ${hazards.map((h) => h.analysis).join('; ')}.`,
    `Active protocols: ${hazards.map((h) => h.protocol).join(' | ')}.`,
  ].join(' ');

  return {
    summary,
    hazards: hazards.map((h) => ({ analysis: h.analysis, protocol: h.protocol })),
    riskLevel,
  };
}

const CHAT_INTEL_PROMPT = (sender, text) => `You are an emergency-response AI assistant. A responder named "${sender}" just posted this chat message:

"${text}"

Decide if this message contains mission-relevant intel worth tracking on the mission briefing.
Mission-relevant intel examples:
- Objectives or goals ("save 7 civilians trapped inside")
- Progress updates ("2 of 7 civilians evacuated")
- Hazards or risks ("fire spreading to 3rd floor", "gas leak detected")
- Casualty / resource counts ("3 injured", "need EMS")
- Positional / sector intel ("Sector B cleared")
Ignore greetings, acknowledgements, chitchat, and opinions.

Respond with JSON only, no markdown, exactly in this shape:
{"worthTracking": <true|false>, "analysis": "<clear objective or status update, one sentence>", "protocol": "<short actionable protocol, one sentence>", "riskLevel": "<Low|Moderate|High|Critical|Unknown>"}

If worthTracking is false, set analysis, protocol and riskLevel to empty strings / "Unknown".`;

function extractJsonObject(raw = '') {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function shapeIntelResult(parsed) {
  if (!parsed?.worthTracking) return null;
  const analysis = String(parsed.analysis || '').trim();
  if (!analysis) return null;
  const protocol = String(parsed.protocol || '').trim()
    || 'Review with command and update SOP as needed.';
  const riskLevel = String(parsed.riskLevel || 'Unknown').trim() || 'Unknown';
  return { worthTracking: true, analysis, protocol, riskLevel };
}

function shapeHazardResult(parsed) {
  if (!parsed) return null;
  const analysis = String(parsed.analysis || '').trim();
  if (!analysis) return null;
  const protocol = String(parsed.protocol || '').trim()
    || 'Verify scene visually and report back to command before approaching.';
  const riskLevel = String(parsed.riskLevel || 'Unknown').trim() || 'Unknown';
  return { worthTracking: true, analysis, protocol, riskLevel };
}

async function tryBackboard(prompt, threadId, shaper) {
  if (!backboard.isConfigured()) throw new Error('Backboard not configured');
  if (!backboard.isAvailable()) throw new Error('Backboard marked unavailable (will recheck periodically)');
  if (!threadId) throw new Error('Backboard threadId missing');
  const data = await backboard.runMessage(threadId, prompt);
  if (data?.status && String(data.status).toUpperCase() === 'FAILED') {
    throw new Error(`Backboard run FAILED: ${data.content || 'unknown'}`);
  }
  const text = data?.content ?? '';
  return shaper(extractJsonObject(text));
}

async function tryOllama(prompt, shaper) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: 'json',
    }),
  });
  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
  const data = await response.json();
  return shaper(extractJsonObject(data.response));
}

async function tryGemini(prompt, shaper) {
  const apiKey =
    process.env.GEMINI_API_KEY
    || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey || /your-/.test(apiKey)) throw new Error('No Gemini API key configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  });
  if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return shaper(extractJsonObject(raw));
}

const tryBackboardIntel = (prompt, threadId) => tryBackboard(prompt, threadId, shapeIntelResult);
const tryOllamaIntel = (prompt) => tryOllama(prompt, shapeIntelResult);
const tryGeminiIntel = (prompt) => tryGemini(prompt, shapeIntelResult);

const INTEL_KEYWORDS = [
  'trap', 'trapped', 'rescue', 'rescu', 'save', 'objective', 'mission',
  'fire', 'smoke', 'gas leak', 'leak', 'explosion', 'collapse', 'hazard',
  'injur', 'casualt', 'wound', 'bleed', 'evacuat', 'ems', 'medic',
  'people', 'civilian', 'victim', 'hostage', 'sector', 'cleared',
  'priority', 'risk', 'danger',
];

function heuristicIntel(text) {
  const lower = text.toLowerCase();
  if (!INTEL_KEYWORDS.some((k) => lower.includes(k))) return null;

  const peopleMatch = lower.match(/(\d+)\s+(?:people|civilians?|victims?|hostages?|persons?|trapped)/);
  const fireMentioned = /(fire|smoke|burn|blaze)/.test(lower);
  const rescueMentioned = /(rescu|save|extract|evacuat)/.test(lower);

  let analysis = '';
  let protocol = '';
  let riskLevel = 'Moderate';

  if (peopleMatch) {
    const count = peopleMatch[1];
    analysis = fireMentioned
      ? `Rescue ${count} people trapped in active fire structure. Progress: 0/${count} evacuated.`
      : `Locate and rescue ${count} reported victims at scene. Progress: 0/${count} accounted for.`;
    protocol = fireMentioned
      ? 'Initiate fire suppression, deploy search & rescue teams floor-by-floor, stage triage and EMS at safe perimeter.'
      : 'Deploy search teams in coordinated sweep, establish triage area, request additional EMS as needed.';
    riskLevel = 'High';
  } else if (fireMentioned) {
    analysis = 'Active fire reported on scene — suppression and life-safety priority.';
    protocol = 'Initiate fire suppression, evacuate civilians from structure, monitor for collapse hazards.';
    riskLevel = 'High';
  } else if (/(gas leak|leak|chemical|hazmat|chlorine|ammonia)/.test(lower)) {
    analysis = 'Hazardous material / leak reported on scene.';
    protocol = 'Establish exclusion zone, deploy SCBA/Level A protection, ventilate area, evacuate downwind.';
    riskLevel = 'High';
  } else if (/(injur|casualt|wound|bleed)/.test(lower)) {
    analysis = 'Casualties reported on scene — medical response required.';
    protocol = 'Establish triage, request additional EMS units, prioritize by severity.';
    riskLevel = 'High';
  } else if (/(sector|cleared)/.test(lower)) {
    analysis = `Sector status update from responder: "${text}".`;
    protocol = 'Update tactical map and reassign teams to remaining uncleared sectors.';
    riskLevel = 'Moderate';
  } else {
    analysis = `Mission-relevant update from responder: "${text}".`;
    protocol = 'Acknowledge update, adjust mission plan if required, share with all responders.';
    riskLevel = 'Moderate';
  }

  return { worthTracking: true, analysis, protocol, riskLevel };
}

const HAZARD_VISION_PROMPT = (text, objects) => `You are an emergency-response AI for the Nexus Link mission-coordination platform. A field responder just uploaded a hazard photo. Google Vision returned the following raw evidence:

Detected text: ${text || '(none)'}
Detected objects/labels: ${objects?.length ? objects.join(', ') : '(none)'}

Based ONLY on this evidence, produce a situational recommendation for the responder team.

Respond with ONLY strict JSON, no markdown, in this exact shape:
{"analysis": "<a single natural-language recommendation that combines (1) what the image shows and (2) the immediate action the responders should take, written as if you were briefing them over comms. Voice alert will read this verbatim.>", "protocol": "<one-to-two sentence formal safety SOP referencing standard procedures (e.g., NFPA, OSHA, EMS triage) for the briefing log>", "riskLevel": "Low|Moderate|High|Critical|Unknown"}

Style examples for the analysis field (this is the format we want):
- "The image shows the environment is surrounded by fog — move slowly and carefully, stay tight on your team, and pay close attention to your surroundings."
- "The image shows an active structure fire on multiple floors — back away to a safe perimeter, signal civilians to evacuate, and request additional engine companies before re-entering."
- "The image shows a chemical spill spreading across the floor — stop forward movement, mask up, and identify the substance from a safe distance before approaching."

Rules:
- The analysis must always start by describing what is visible ("The image shows...") then immediately give the situational instruction in the same sentence.
- Tailor the action to the SPECIFIC hazard observed; do NOT use generic advice like "approach with caution" unless the evidence is genuinely ambiguous.
- If the evidence is empty/ambiguous, analysis should be "The image is unclear — verify the scene visually and report back to command before approaching." and riskLevel "Unknown".
- Always prioritize life safety.`;

async function analyzeHazardFromVisionTags(text = '', objects = [], { backboardThreadId } = {}) {
  const prompt = HAZARD_VISION_PROMPT(text, objects);

  if (backboardThreadId) {
    try {
      const result = await tryBackboard(prompt, backboardThreadId, shapeHazardResult);
      if (result) {
        console.log('Hazard analysis: served by Backboard');
        return result;
      }
    } catch (err) {
      console.warn('Backboard hazard-analysis unavailable:', err.message);
    }
  }

  try {
    const result = await tryOllama(prompt, shapeHazardResult);
    if (result) {
      console.log('Hazard analysis: served by Ollama / Gemma');
      return result;
    }
  } catch (err) {
    console.warn('Ollama hazard-analysis unavailable:', err.message);
  }

  try {
    const result = await tryGemini(prompt, shapeHazardResult);
    if (result) {
      console.log('Hazard analysis: served by Gemini cloud');
      return result;
    }
  } catch (err) {
    console.warn('Gemini hazard-analysis unavailable:', err.message);
  }

  const detected = (text || objects.join(', ') || 'unknown hazard').slice(0, 200);
  const fallbackProtocol = lookupProtocol(objects, text);
  console.log('Hazard analysis: using local lookupProtocol fallback');
  return {
    worthTracking: true,
    analysis: `Detected ${detected}. Manual verification recommended.`,
    protocol: fallbackProtocol,
    riskLevel: 'Unknown',
  };
}

async function analyzeChatForMissionIntel(content = '', sender = 'responder', { backboardThreadId } = {}) {
  const text = String(content || '').trim();
  if (!text) return { worthTracking: false };

  const prompt = CHAT_INTEL_PROMPT(sender, text);

  if (backboardThreadId) {
    try {
      const result = await tryBackboardIntel(prompt, backboardThreadId);
      if (result) {
        console.log('Chat intel: served by Backboard');
        return result;
      }
    } catch (err) {
      console.warn('Backboard chat-intel unavailable:', err.message);
    }
  }

  try {
    const result = await tryOllamaIntel(prompt);
    if (result) {
      console.log('Chat intel: served by Ollama / Gemma');
      return result;
    }
  } catch (err) {
    console.warn('Ollama chat-intel unavailable:', err.message);
  }

  try {
    const result = await tryGeminiIntel(prompt);
    if (result) {
      console.log('Chat intel: served by Gemini cloud');
      return result;
    }
  } catch (err) {
    console.warn('Gemini chat-intel unavailable:', err.message);
  }

  const heuristic = heuristicIntel(text);
  if (heuristic) {
    console.log('Chat intel: using local heuristic fallback');
    return heuristic;
  }

  return { worthTracking: false };
}

async function generateMissionInfo(approvedItems = []) {
  const fallback = buildFallbackMissionInfo(approvedItems);
  const hazards = approvedItems.filter((i) => i.type === 'hazard');
  if (hazards.length === 0) return fallback;

  const prompt = `You are an emergency response AI assistant. Based on the following approved AI hazard recommendations, write a concise mission briefing.

Approved AI recommendations:
${hazards.map((h) => `- ${h.analysis} (Protocol: ${h.protocol})`).join('\n')}

Respond with a JSON object only, no markdown, in this exact format:
{"summary":"<2-3 sentence mission briefing>","riskLevel":"<Low|Moderate|High|Critical>"}`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

    const data = await response.json();
    const text = data.response?.trim() ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Ollama response');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary ?? fallback.summary,
      riskLevel: parsed.riskLevel ?? fallback.riskLevel,
      hazards: fallback.hazards,
    };
  } catch (err) {
    console.warn('Gemma offline analysis failed, using fallback:', err.message);
    return fallback;
  }
}

module.exports = {
  cloudVisionAnalyze,
  lookupProtocol,
  gemmaOfflineAnalysis,
  generateMissionInfo,
  analyzeChatForMissionIntel,
  analyzeHazardFromVisionTags,
};

