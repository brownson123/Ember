import { useEffect } from 'react';

import { useAppState } from '@/context/AppStateContext';
import { playAudioFromBase64Url, speakTextFallback } from '@/lib/audioPlayer';
import { bridgefyManager } from '@/lib/bridgefyManager';
import { wsManager } from '@/lib/webSocketManager';

export default function GlobalListener() {
  const { dispatch, state } = useAppState();

  useEffect(() => {
    const handleIncoming = (incoming: any) => {
      const data = incoming?.payload && incoming?.type
        ? { type: incoming.type, ...incoming.payload }
        : incoming;

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
              content: 'Hazard image captured. Analyzing...',
              timestamp: data.timestamp ?? Date.now(),
              type: 'image',
              imageBase64: data.imageBase64,
              analysis: null,
              protocol: null,
              status: 'pending',
            },
          });
          break;

        case 'ai_recommendation':
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: {
              id: data.id,
              analysis: data.analysis ?? '',
              protocol: data.protocol ?? '',
              status: data.status ?? 'pending',
            },
          });
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

        case 'mission_info_update':
          dispatch({ type: 'SET_MISSION_INFO', payload: data.missionInfo });
          dispatch({ type: 'MARK_INFO_READ' });
          break;

        case 'message_approval_update':
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: { id: data.messageId, status: data.action === 'approve' ? 'approved' : 'denied' },
          });
          break;

        case 'voice_alert':
          if (state.role === 'tower') break;
          if (data?.audioUrl) {
            playAudioFromBase64Url(data.audioUrl).catch(() => {
              speakTextFallback(data?.text ?? 'New update from command');
            });
          } else {
            speakTextFallback(data?.text ?? 'New update from command');
          }
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
            type: 'UPDATE_MESSAGE',
            payload: {
              id: data.id,
              status: data.type === 'recommendation_approved' ? 'approved' : 'denied',
            },
          });
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
    };

    const unsubscribeBridgefy = bridgefyManager.subscribe(handleIncoming);
    const unsubscribeWs = wsManager.subscribe(handleIncoming);

    return () => {
      unsubscribeBridgefy();
      unsubscribeWs();
    };
  }, [dispatch]);

  return null;
}

