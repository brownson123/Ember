const vision = require('@google-cloud/vision');

let visionClient = null;
try {
  visionClient = new vision.ImageAnnotatorClient();
} catch (err) {
  console.warn('Google Vision client failed to initialize — image analysis disabled:', err.message);
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

  const [result] = await visionClient.annotateImage(request);
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
  const hazards = approvedItems.filter(i => i.type === 'hazard');
  const intel = approvedItems.filter(i => i.type === 'intel');

  if (approvedItems.length === 0) {
    return {
      summary: 'No confirmed intelligence yet. Awaiting tower approvals.',
      hazards: [],
      intel: [],
      riskLevel: 'Unknown',
    };
  }

  const riskLevel = hazards.length === 0 ? 'Low'
    : hazards.length <= 2 ? 'Moderate'
    : 'High';

  const summary = [
    hazards.length > 0
      ? `${hazards.length} confirmed hazard${hazards.length > 1 ? 's' : ''}: ${hazards.map(h => h.analysis).join('; ')}.`
      : 'No confirmed hazards.',
    intel.length > 0
      ? `${intel.length} confirmed field report${intel.length > 1 ? 's' : ''} from responders.`
      : '',
    `Active protocols: ${hazards.length > 0 ? hazards.map(h => h.protocol).join(' | ') : 'None'}.`,
  ].filter(Boolean).join(' ');

  return {
    summary,
    hazards: hazards.map(h => ({ analysis: h.analysis, protocol: h.protocol })),
    intel: intel.map(i => ({ sender: i.sender, content: i.content })),
    riskLevel,
  };
}

async function generateMissionInfo(approvedItems = []) {
  const fallback = buildFallbackMissionInfo(approvedItems);
  if (approvedItems.length === 0) return fallback;

  const hazards = approvedItems.filter(i => i.type === 'hazard');
  const intel = approvedItems.filter(i => i.type === 'intel');

  const prompt = `You are an emergency response AI assistant. Based on the following confirmed field data, write a concise mission briefing.

Confirmed hazards:
${hazards.length > 0 ? hazards.map(h => `- ${h.analysis} (Protocol: ${h.protocol})`).join('\n') : '- None'}

Confirmed field intelligence:
${intel.length > 0 ? intel.map(i => `- ${i.sender}: "${i.content}"`).join('\n') : '- None'}

Respond with a JSON object only, no markdown, in this exact format:
{"summary":"<2-3 sentence mission briefing>","riskLevel":"<Low|Moderate|High|Critical>"}`;

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:1b',
        prompt,
        stream: false,
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
      intel: fallback.intel,
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
};

