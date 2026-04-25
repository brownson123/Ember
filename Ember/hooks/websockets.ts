import { wsManager } from '@/lib/webSocketManager';
import { useEffect, useState } from 'react';

export function useWebSocket(url: string, onMessage?: (msg: any) => void) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!url) return;

    wsManager.connect(url);
    const unsubscribeConnection = wsManager.subscribeConnection(setConnected);
    if (!onMessage) return unsubscribeConnection;
    const unsubscribeMessage = wsManager.subscribe(onMessage);

    return () => {
      unsubscribeMessage();
      unsubscribeConnection();
    };
  }, [url, onMessage]);

  const send = (msg: object) => {
    wsManager.send(msg);
  };

  return { connected, send };
}