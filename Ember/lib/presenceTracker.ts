import { bridgefyManager } from '@/lib/bridgefyManager';
import { sendMeshFirst } from '@/lib/transportManager';
import { wsManager } from '@/lib/webSocketManager';

export type ResponderPresence = {
  identity: string;
  email: string;
  lastSeenAt: number;
  directlyConnected: boolean;
  signalQuality: number;
  distanceFt: number;
};

type PresenceListener = (responders: ResponderPresence[]) => void;

const PING_INTERVAL_MS = 4000;
const STALE_MS = 15000;
const HARD_EXPIRE_MS = 35000;
const MAX_DISTANCE_FT = 120;

class PresenceTracker {
  private mode: 'idle' | 'responder' | 'tower' = 'idle';
  private myIdentity: string = '';
  private myEmail: string = '';
  private responders = new Map<string, ResponderPresence>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<PresenceListener>();
  private unsubscribeMesh: (() => void) | null = null;
  private unsubscribeWs: (() => void) | null = null;
  private unsubscribePeers: (() => void) | null = null;

  startAsResponder(identity: string, email: string = identity) {
    if (this.mode === 'responder' && this.myIdentity === identity) return;
    this.stop();
    this.mode = 'responder';
    this.myIdentity = identity;
    this.myEmail = email;
    this.sendPing();
    this.pingInterval = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
  }

  startAsTower(identity: string) {
    if (this.mode === 'tower' && this.myIdentity === identity) return;
    this.stop();
    this.mode = 'tower';
    this.myIdentity = identity;

    const handleIncoming = (incoming: any) => {
      const data = incoming?.payload && incoming?.type
        ? { type: incoming.type, ...incoming.payload }
        : incoming;
      if (data?.type !== 'presence_ping') return;
      const identity = data?.identity;
      if (!identity || identity === this.myIdentity) return;
      this.upsertResponder(identity, data?.email ?? identity);
    };

    this.unsubscribeMesh = bridgefyManager.subscribe(handleIncoming);
    this.unsubscribeWs = wsManager.subscribe(handleIncoming);
    this.unsubscribePeers = bridgefyManager.subscribeConnectedPeers(() => {
      this.recomputeAll();
      this.emit();
    });

    this.refreshInterval = setInterval(() => {
      this.recomputeAll();
      this.emit();
    }, 2000);
  }

  stop() {
    this.mode = 'idle';
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.unsubscribeMesh?.();
    this.unsubscribeMesh = null;
    this.unsubscribeWs?.();
    this.unsubscribeWs = null;
    this.unsubscribePeers?.();
    this.unsubscribePeers = null;
    this.responders.clear();
    this.emit();
  }

  subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private sendPing() {
    sendMeshFirst('presence_ping', {
      identity: this.myIdentity,
      email: this.myEmail || this.myIdentity,
      sentAt: Date.now(),
    });
  }

  private upsertResponder(identity: string, email: string) {
    const now = Date.now();
    const existing = this.responders.get(identity);
    const base: ResponderPresence = existing ?? {
      identity,
      email,
      lastSeenAt: now,
      directlyConnected: false,
      signalQuality: 0,
      distanceFt: MAX_DISTANCE_FT,
    };
    const refreshed = {
      ...base,
      email: email || base.email,
      lastSeenAt: now,
      directlyConnected: bridgefyManager.getConnectedPeers().has(identity),
    };
    this.responders.set(identity, this.computeMetrics(refreshed));
    this.emit();
  }

  private computeMetrics(r: ResponderPresence): ResponderPresence {
    const age = Date.now() - r.lastSeenAt;
    const freshness = Math.max(0, Math.min(1, 1 - age / STALE_MS));
    const base = r.directlyConnected ? 92 : 55;
    const signalQuality = Math.round(base * freshness);
    const distanceFt = Math.max(3, Math.min(MAX_DISTANCE_FT, Math.round(MAX_DISTANCE_FT - signalQuality * 1.15)));
    return { ...r, signalQuality, distanceFt };
  }

  private recomputeAll() {
    const now = Date.now();
    for (const [id, r] of this.responders) {
      if (now - r.lastSeenAt > HARD_EXPIRE_MS) {
        this.responders.delete(id);
        continue;
      }
      this.responders.set(id, this.computeMetrics({
        ...r,
        directlyConnected: bridgefyManager.getConnectedPeers().has(id),
      }));
    }
  }

  private snapshot(): ResponderPresence[] {
    return Array.from(this.responders.values()).sort((a, b) =>
      a.email.localeCompare(b.email)
    );
  }

  private emit() {
    const values = this.snapshot();
    this.listeners.forEach((l) => l(values));
  }
}

export const presenceTracker = new PresenceTracker();
