require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const WebSocket = require('ws');
const { cloudVisionAnalyze, lookupProtocol, gemmaOfflineAnalysis, generateMissionInfo } = require('./ai');
const { createThread, addMessage, getThreadSummary } = require('./backboard');

// Prevent gRPC/auth async errors from crashing the process when credentials are missing
process.on('unhandledRejection', (err) => {
  console.warn('Unhandled rejection (suppressed):', err?.message ?? err);
});

const PORT = Number(process.env.WS_PORT || 8089);
const wss = new WebSocket.Server({ port: PORT });
const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY || process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;

console.log(`WebSocket server listening on ws://localhost:${PORT}`);

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
      case 'chat_message':
        chatHistory.push(msg);
        broadcast(msg);
        break;

      case 'hazard_report': {
        chatHistory.push(msg);
        broadcast(msg);

        let summary = '';
        let protocol = '';

        try {
          const { text, objects } = await cloudVisionAnalyze(msg.imageBase64);
          summary = `Detected: ${text || objects.join(', ') || 'Unknown hazard'}`;
          protocol = lookupProtocol(objects, text);
        } catch (err) {
          console.log('Cloud Vision unavailable, switching to offline fallback:', err.message);
          protocol = await gemmaOfflineAnalysis('', ['unknown']);
          summary = 'Offline analysis: unknown hazard';
        }

        const recommendation = {
          type: 'ai_recommendation',
          id: msg.id,
          analysis: summary,
          protocol,
          status: 'pending',
          timestamp: Date.now(),
        };
        activeRecommendations.set(recommendation.id, {
          analysis: recommendation.analysis,
          protocol: recommendation.protocol,
        });
        chatHistory.push(recommendation);
        broadcast(recommendation);

        const threadId = threadByTower.get(msg.towerId);
        if (threadId) {
          try {
            await addMessage(threadId, { type: 'hazard_report', ...msg, summary, protocol });
            await addMessage(threadId, recommendation);
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

            try {
              const audioUrl = await generateVoiceAlert(approvedRec.protocol);
              broadcast({
                type: 'voice_alert',
                text: approvedRec.protocol,
                audioUrl,
                target: 'responders',
              });
            } catch (err) {
              console.error('ElevenLabs error:', err.message);
              broadcast({
                type: 'voice_alert',
                text: approvedRec.protocol,
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

      case 'message_approval': {
        if (msg.action === 'approve' && !approvedContext.some(i => i.id === msg.messageId)) {
          approvedContext.push({ type: 'intel', id: msg.messageId, content: msg.content, sender: msg.sender });
          generateMissionInfo(approvedContext).then(missionInfo => {
            broadcast({ type: 'mission_info_update', missionInfo });
          });
        }
        broadcast({ type: 'message_approval_update', messageId: msg.messageId, action: msg.action });
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