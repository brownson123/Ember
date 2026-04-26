const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const WebSocket = require('ws');
const {
  cloudVisionAnalyze,
  lookupProtocol,
  gemmaOfflineAnalysis,
  generateMissionInfo,
  analyzeChatForMissionIntel,
  analyzeHazardFromVisionTags,
} = require('./ai');
const backboard = require('./backboard');
const { createThread, addMessage, getThreadSummary } = backboard;

// Prevent gRPC/auth async errors from crashing the process when credentials are missing
process.on('unhandledRejection', (err) => {
  console.warn('Unhandled rejection (suppressed):', err?.message ?? err);
});

const PORT = Number(process.env.WS_PORT || 8089);
const wss = new WebSocket.Server({ port: PORT });
const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY || process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;

console.log(`WebSocket server listening on ws://localhost:${PORT}`);

// Probe Backboard once at boot. If healthy, it becomes the primary AI for chat-intel
// and hazard analysis. If unhealthy (no credits, no internet, billing exhausted, etc.),
// we mark it unavailable and skip it on every subsequent request until the periodic
// health monitor brings it back. Per-call failures during runtime also flip the flag,
// so a mid-mission internet drop falls over to Gemma immediately.
if (backboard.isConfigured()) {
  console.log('Backboard: configured, running startup health probe...');
  backboard.healthCheck().then((ok) => {
    if (ok) {
      console.log('Backboard: PRIMARY AI online.');
    } else {
      const h = backboard.getHealth();
      console.log(`Backboard: PRIMARY unavailable. Falling back to Gemma. Reason: ${h.lastError}`);
    }
    backboard.startHealthMonitor({ intervalMs: 5 * 60 * 1000 });
  }).catch((err) => {
    console.warn('Backboard: startup probe error:', err.message);
    backboard.startHealthMonitor({ intervalMs: 5 * 60 * 1000 });
  });
} else {
  console.log('Backboard: not configured — using Gemma as primary AI.');
}

const towers = new Map(); // towerId -> { name, ws, missionActive }
const chatHistory = []; // all chat messages since mission start
const joinRequests = new Map(); // requestId -> { fromResponderWs, towerId, responderEmail }
const missionTeams = new Map(); // towerId -> Set<responderEmail>
const activeRecommendations = new Map(); // recId -> { analysis, protocol }
const threadByTower = new Map(); // towerId -> threadId
const approvedContext = []; // approved messages and recommendations for mission briefing

function sendTo(ws, data) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data) {
  wss.clients.forEach((client) => {
    sendTo(client, data);
  });
}

async function generateVoiceAlert(text) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('Missing ElevenLabs API key');
  }

  const voiceId = 'JBFqnCBsd6RMkjVDRZzb';
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status} ${await response.text()}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:audio/mpeg;base64,${buffer.toString('base64')}`;
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    console.log('Received:', msg.type, 'from', msg.sender || msg.towerId);

    switch (msg.type) {
      case 'chat_message': {
        chatHistory.push(msg);
        broadcast(msg);

        (async () => {
          try {
            if (activeRecommendations.has(msg.id)) return;
            const backboardThreadId = threadByTower.get(msg.towerId);
            const intel = await analyzeChatForMissionIntel(msg.content, msg.sender, { backboardThreadId });
            if (!intel.worthTracking) {
              console.log(`Chat intel: skipped (not mission-relevant) — "${msg.content?.slice(0, 80)}"`);
              return;
            }

            console.log(`Chat intel: recommendation queued — ${intel.analysis}`);

            const recommendation = {
              type: 'ai_recommendation',
              id: msg.id,
              source: 'chat_intel',
              analysis: intel.analysis,
              protocol: intel.protocol,
              status: 'pending',
              timestamp: Date.now(),
            };

            activeRecommendations.set(msg.id, {
              analysis: recommendation.analysis,
              protocol: recommendation.protocol,
            });
            chatHistory.push(recommendation);
            broadcast(recommendation);

            const threadId = threadByTower.get(msg.towerId);
            if (threadId) {
              try {
                await addMessage(threadId, recommendation);
              } catch (err) {
                console.error('Backboard log error:', err.message);
              }
            }
          } catch (err) {
            console.warn('Chat intel pipeline error:', err.message);
          }
        })();
        break;
      }

      case 'hazard_report': {
        chatHistory.push(msg);
        broadcast(msg);

        let visionText = '';
        let visionObjects = [];
        try {
          const v = await cloudVisionAnalyze(msg.imageBase64);
          visionText = v.text || '';
          visionObjects = v.objects || [];
          console.log(`Vision: text="${visionText.slice(0, 80)}" objects=[${visionObjects.join(', ')}]`);
        } catch (err) {
          console.log('Cloud Vision unavailable, AI will analyze without tags:', err.message);
        }

        const backboardThreadId = threadByTower.get(msg.towerId);
        const intel = await analyzeHazardFromVisionTags(visionText, visionObjects, { backboardThreadId });

        const recommendation = {
          type: 'ai_recommendation',
          id: msg.id,
          analysis: intel.analysis,
          protocol: intel.protocol,
          riskLevel: intel.riskLevel,
          status: 'pending',
          timestamp: Date.now(),
        };
        activeRecommendations.set(recommendation.id, {
          analysis: recommendation.analysis,
          protocol: recommendation.protocol,
        });
        chatHistory.push(recommendation);
        broadcast(recommendation);
        console.log(`Hazard recommendation queued — ${intel.analysis}`);

        if (backboardThreadId) {
          try {
            await addMessage(backboardThreadId, { type: 'hazard_report', id: msg.id, sender: msg.sender, vision: { text: visionText, objects: visionObjects }, analysis: intel.analysis, protocol: intel.protocol });
          } catch (err) {
            console.error('Backboard log error:', err.message);
          }
        }
        break;
      }

      case 'recommendation_action': {
        if (msg.action === 'approve') {
          const approvedRec = activeRecommendations.get(msg.recommendationId);
          if (approvedRec && !approvedContext.some(i => i.id === msg.recommendationId)) {
            approvedContext.push({ type: 'hazard', id: msg.recommendationId, ...approvedRec });
            generateMissionInfo(approvedContext).then(missionInfo => {
              broadcast({ type: 'mission_info_update', missionInfo });
            });

            const spokenText = approvedRec.analysis || approvedRec.protocol || 'New mission update approved.';
            try {
              const audioUrl = await generateVoiceAlert(spokenText);
              broadcast({
                type: 'voice_alert',
                text: spokenText,
                audioUrl,
                target: 'responders',
              });
            } catch (err) {
              console.error('ElevenLabs error:', err.message);
              broadcast({
                type: 'voice_alert',
                text: spokenText,
                target: 'responders',
              });
            }

            const towerThreadId = threadByTower.get(msg.towerId);
            if (towerThreadId) {
              try {
                await addMessage(towerThreadId, {
                  type: 'protocol_approved',
                  recommendationId: msg.recommendationId,
                  protocol: approvedRec.protocol,
                });
              } catch (err) {
                console.error('Backboard log error:', err.message);
              }
            }
          }
        }

        const statusEvent = {
          type: msg.action === 'approve' ? 'recommendation_approved' : 'recommendation_denied',
          id: msg.recommendationId,
        };
        chatHistory.push(statusEvent);
        broadcast(statusEvent);
        break;
      }

      case 'presence_ping': {
        broadcast(msg);
        break;
      }

      case 'mission_start': {
        const existing = towers.get(msg.towerId) || { name: msg.towerName, ws };
        towers.set(msg.towerId, {
          ...existing,
          name: msg.towerName,
          ws,
          missionActive: true,
        });
        missionTeams.set(msg.towerId, new Set());
        chatHistory.length = 0;
        activeRecommendations.clear();
        approvedContext.length = 0;
        broadcast(msg);
        broadcast({
          type: 'team_update',
          towerId: msg.towerId,
          teamEmails: Array.from(missionTeams.get(msg.towerId) ?? []),
        });
        break;
      }

      case 'tower_register': {
        towers.set(msg.towerId, {
          name: msg.towerName,
          ws,
          missionActive: msg.missionActive ?? true,
        });

        if (!threadByTower.has(msg.towerId)) {
          try {
            const threadId = await createThread();
            if (threadId) threadByTower.set(msg.towerId, threadId);
          } catch (err) {
            console.error('Backboard thread create failed:', err.message);
          }
        }
        break;
      }

      case 'get_towers': {
        const towerList = Array.from(towers.entries()).map(([id, info]) => ({
          id,
          name: info.name,
          missionActive: info.missionActive,
        }));
        sendTo(ws, { type: 'tower_list', towers: towerList });
        break;
      }

      case 'join_request': {
        const tower = towers.get(msg.towerId);
        if (!tower || !tower.missionActive) {
          sendTo(ws, { type: 'join_denied', reason: 'Tower not available' });
          return;
        }
        const requestId = `${Date.now()}-${Math.random()}`;
        joinRequests.set(requestId, {
          fromResponderWs: ws,
          towerId: msg.towerId,
          responderEmail: msg.responderEmail,
        });
        sendTo(tower.ws, {
          type: 'join_request_alert',
          requestId,
          responderEmail: msg.responderEmail,
        });
        break;
      }

      case 'join_response': {
        const request = joinRequests.get(msg.requestId);
        if (!request) return;

        if (msg.accept) {
          if (!missionTeams.has(request.towerId)) {
            missionTeams.set(request.towerId, new Set());
          }
          missionTeams.get(request.towerId).add(request.responderEmail);
          const teamEmails = Array.from(missionTeams.get(request.towerId));

          const threadId = threadByTower.get(request.towerId);
          let summary = '';
          if (threadId) {
            try {
              const summaryData = await getThreadSummary(threadId);
              summary = summaryData?.summary || '';
            } catch (err) {
              console.error('Backboard summary error:', err.message);
            }
          }

          sendTo(request.fromResponderWs, {
            type: 'mission_joined',
            towerId: request.towerId,
            towerName: towers.get(request.towerId)?.name,
            messages: chatHistory,
            teamEmails,
            backboardSummary: summary,
          });

          broadcast({
            type: 'team_update',
            towerId: request.towerId,
            teamEmails,
          });
        } else {
          sendTo(request.fromResponderWs, { type: 'join_denied' });
        }
        joinRequests.delete(msg.requestId);
        break;
      }

      default:
        sendTo(ws, msg);
    }
  });

  ws.on('close', () => {
    for (const [id, info] of towers.entries()) {
      if (info.ws === ws) {
        towers.delete(id);
        missionTeams.delete(id);
        threadByTower.delete(id);
        console.log('Tower disconnected:', id);
        break;
      }
    }
  });
});