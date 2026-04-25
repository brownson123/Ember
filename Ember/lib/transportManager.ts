import { bridgefyManager } from '@/lib/bridgefyManager';
import { wsManager } from '@/lib/webSocketManager';

type TransportMessagePayload = Record<string, any>;

export function sendMeshFirst(type: string, payload: TransportMessagePayload): boolean {
  const sentOverMesh = bridgefyManager.sendToAll({ type, payload });
  if (sentOverMesh) return true;

  wsManager.send({ type, ...payload });
  return false;
}
