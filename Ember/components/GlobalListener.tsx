import { useEffect } from 'react';

import { useAppState } from '@/context/AppStateContext';
import { wsManager } from '@/lib/webSocketManager';

export default function GlobalListener() {
  const { dispatch } = useAppState();

  useEffect(() => {
    const unsubscribe = wsManager.subscribe((data) => {
      if (data?.type === 'chat_message') {
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: data.id,
            sender: data.sender ?? 'Unknown',
            content: data.content ?? '',
            timestamp: data.timestamp ?? Date.now(),
          },
        });
      }
    });

    return unsubscribe;
  }, [dispatch]);

  return null;
}

