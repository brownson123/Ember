type MessageHandler = (data: any) => void;
type ConnectionHandler = (connected: boolean) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string = '';
  private handlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;

  connect(url: string) {
    if (!url) return;

    if (
      this.ws &&
      this.url === url &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return; // already connected to the same URL
    }

    this.manualDisconnect = false;
    this.url = url;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected to', url);
      this.connectionHandlers.forEach((handler) => handler(true));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlers.forEach((handler) => handler(data));
      } catch {}
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket closed', event.code, event.reason);
      this.connectionHandlers.forEach((handler) => handler(false));

      if (this.manualDisconnect) return;
      // Auto-reconnect after 3 seconds
      this.reconnectTimer = setTimeout(() => this.connect(url), 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error', error);
    };
  }

  disconnect() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connectionHandlers.forEach((handler) => handler(false));
  }

  send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not open – message not sent');
    }
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  subscribeConnection(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler);
    handler(this.ws?.readyState === WebSocket.OPEN);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }
}

export const wsManager = new WebSocketManager();