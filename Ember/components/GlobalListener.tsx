import { useEffect } from 'react';

import { useAppState } from '@/context/AppStateContext';
import { wsManager } from '@/lib/webSocketManager';

export default function GlobalListener() {
  const { dispatch } = useAppState();

  useEffect(() => {
    const unsubscribe = wsManager.subscribe((data) => {
      switch (data?.type) {
        case 'chat_message':
          dispatch({
            type: 'ADD_MESSAGE',
            payload: {
              id: data.id,
              sender: data.sender ?? 'Unknown',
              content: data.content ?? '',
              timestamp: data.timestamp ?? Date.now(),
              type: 'chat_message',
            },
          });
          break;

        case 'hazard_report':
          dispatch({
            type: 'ADD_MESSAGE',
            payload: {
              id: data.id,
              sender: data.sender ?? 'Unknown',
              content: '[Hazard image uploaded]',
              timestamp: data.timestamp ?? Date.now(),
              type: 'hazard_report',
              imageBase64: data.imageBase64,
            },
          });
          break;

        case 'ai_recommendation':
          dispatch({
            type: 'ADD_RECOMMENDATION',
            payload: {
              id: data.id,
              analysis: data.analysis ?? '',
              protocol: data.protocol ?? '',
              status: data.status ?? 'pending',
              timestamp: data.timestamp ?? Date.now(),
            },
          });
          break;

        case 'tower_list':
          // Tower discovery list is local to ControlTowerSelect.
          break;

        case 'join_request_alert':
          dispatch({
            type: 'SHOW_JOIN_REQUEST',
            payload: { requestId: data.requestId, responderEmail: data.responderEmail },
          });
          break;

        case 'mission_joined':
          dispatch({ type: 'LOAD_MESSAGES', payload: data.messages ?? [] });
          dispatch({ type: 'SET_ACTIVE_TEAM', payload: data.teamEmails ?? [] });
          break;

        case 'team_update':
          dispatch({ type: 'SET_ACTIVE_TEAM', payload: data.teamEmails ?? [] });
          break;

        case 'join_denied':
          // Handled directly by responder selection screen for UI messaging.
          break;

        case 'recommendation_approved':
        case 'recommendation_denied':
          dispatch({
            type: 'UPDATE_RECOMMENDATION',
            payload: {
              id: data.id,
              status: data.type === 'recommendation_approved' ? 'approved' : 'denied',
            },
          });
          break;

        default:
          break;
      }
    });

    return unsubscribe;
  }, [dispatch]);

  return null;
}

