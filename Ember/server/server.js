// server/server.js
const WebSocket = require('ws');

const PORT = Number(process.env.WS_PORT || 8089);
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server listening on ws://localhost:${PORT}`);

// ----- State -----
const towers = new Map();               // towerId -> { name, ws, missionActive }
const chatHistory = [];                // all chat messages since mission start
const joinRequests = new Map();        // requestId -> { fromResponderWs, towerId, responderEmail }
const missionTeams = new Map();        // towerId -> Set<responderEmail>

// ----- Helper: send JSON to a specific client -----
function sendTo(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ----- Broadcast to all -----
function broadcast(data) {
  wss.clients.forEach(client => {
    sendTo(client, data);
  });
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    console.log('Received:', msg.type, 'from', msg.sender || msg.towerId);

    switch (msg.type) {
      // ---------- Existing message types ----------
      case 'chat_message':
        chatHistory.push(msg);           // store for late joiners
        broadcast(msg);
        break;

      case 'hazard_report':
        broadcast(msg);
        const analysis = await analyseHazard(msg.imageBase64);
        const recommendation = {
          type: 'ai_recommendation',
          id: msg.id,
          analysis: analysis.summary,
          protocol: analysis.protocol,
          status: 'pending',
          timestamp: Date.now(),
        };
        broadcast(recommendation);
        break;

      case 'recommendation_action':
        const action = {
          type: msg.action === 'approve' ? 'recommendation_approved' : 'recommendation_denied',
          id: msg.recommendationId,
        };
        broadcast(action);
        break;

      // ---------- Mission lifecycle ----------
      case 'mission_start': {
        const existing = towers.get(msg.towerId) || { name: msg.towerName, ws };
        towers.set(msg.towerId, {
          ...existing,
          name: msg.towerName,
          ws,
          missionActive: true,
        });
        if (!missionTeams.has(msg.towerId)) {
          missionTeams.set(msg.towerId, new Set());
        }
        broadcast(msg);
        broadcast({
          type: 'team_update',
          towerId: msg.towerId,
          teamEmails: Array.from(missionTeams.get(msg.towerId) ?? []),
        });
        break;
      }

      // ---------- NEW: Tower registration ----------
      case 'tower_register':
        towers.set(msg.towerId, {
          name: msg.towerName,
          ws: ws,
          missionActive: msg.missionActive ?? true,
        });
        // Let all future get_towers requests find it
        break;

      // ---------- NEW: Responder requests tower list ----------
      case 'get_towers':
        const towerList = Array.from(towers.entries()).map(([id, info]) => ({
          id,
          name: info.name,
          missionActive: info.missionActive,
        }));
        sendTo(ws, { type: 'tower_list', towers: towerList });
        break;

      // ---------- NEW: Responder wants to join a mission ----------
      case 'join_request': {
        const tower = towers.get(msg.towerId);
        if (!tower || !tower.missionActive) {
          sendTo(ws, { type: 'join_denied', reason: 'Tower not available' });
          return;
        }
        // Store the request so we can match later
        const requestId = `${Date.now()}-${Math.random()}`;
        joinRequests.set(requestId, {
          fromResponderWs: ws,
          towerId: msg.towerId,
          responderEmail: msg.responderEmail,
        });
        // Notify the tower
        sendTo(tower.ws, {
          type: 'join_request_alert',
          requestId,
          responderEmail: msg.responderEmail,
        });
        break;
      }

      // ---------- NEW: Tower accepts/denies a join request ----------
      case 'join_response': {
        const request = joinRequests.get(msg.requestId);
        if (!request) return;

        if (msg.accept) {
          if (!missionTeams.has(request.towerId)) {
            missionTeams.set(request.towerId, new Set());
          }
          missionTeams.get(request.towerId).add(request.responderEmail);
          const teamEmails = Array.from(missionTeams.get(request.towerId));

          // Send full chat history to new responder
          sendTo(request.fromResponderWs, {
            type: 'mission_joined',
            towerId: request.towerId,
            towerName: towers.get(request.towerId)?.name,
            messages: chatHistory,   // full history
            teamEmails,
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
    // If a tower disconnects, remove it from the list
    for (const [id, info] of towers.entries()) {
      if (info.ws === ws) {
        towers.delete(id);
        missionTeams.delete(id);
        console.log('Tower disconnected:', id);
        break;
      }
    }
  });
});

// Mock AI analysis (already present)
async function analyseHazard(imageBase64) {
  await new Promise((r) => setTimeout(r, 1000));
  return {
    summary: 'Chemical detected: Chlorine (Cl₂)',
    protocol: 'Evacuate 100m radius, deploy Level A protection, ventilate area.',
  };
}