const WebSocket = require('ws');

const port = Number(process.env.WS_PORT || 8089);
const wss = new WebSocket.Server({ port });

console.log(`WebSocket server listening on ws://localhost:${port}`);

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Received:', msg);

    // Broadcast to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    });
  });

  ws.on('close', () => console.log('Client disconnected'));
});