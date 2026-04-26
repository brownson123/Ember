// lib/bridgefyManager.ts
let Bridgefy: any = null;
let BridgefyEvents: any = null;
let BridgefyPropagationProfile: any = null;
let warnedUnavailable = false;

try {
  const mod = require('bridgefy-react-native');
  Bridgefy = mod.default;
  BridgefyEvents = mod.BridgefyEvents;
  BridgefyPropagationProfile = mod.BridgefyPropagationProfile;
} catch (_e) {
  console.warn('Bridgefy native module unavailable — mesh networking disabled.');
}

type BridgefyMessageHandler = (message: {
  type: string;
  senderId: string;
  payload: any;
}) => void;

type PeerListener = (peers: Set<string>) => void;

class BridgefyManager {
  private handlers: Set<BridgefyMessageHandler> = new Set();
  private peerListeners: Set<PeerListener> = new Set();
  private connectedPeerIds: Set<string> = new Set();
  private isInitialized = false;
  private myUserId: string = '';
  private receiveSubscription?: { remove: () => void };

  async init(userId: string): Promise<void> {
    if (this.isInitialized || !userId) return;
    this.myUserId = userId;

    // In Expo Go or when native linking is missing, the Bridgefy module resolves to null.
    // Guard before calling any native APIs to avoid "cannot read property 'initialize' of null".
    const isBridgefyAvailable =
      !!Bridgefy &&
      typeof Bridgefy.initialize === 'function' &&
      typeof Bridgefy.start === 'function';
    if (!isBridgefyAvailable) {
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        console.warn('Bridgefy init skipped: native module unavailable in this runtime.');
      }
      return;
    }

    const apiKey = process.env.EXPO_PUBLIC_BRIDGEFY_API_KEY;
    if (!apiKey) {
      console.warn('Bridgefy init skipped: EXPO_PUBLIC_BRIDGEFY_API_KEY is missing.');
      return;
    }

    try {
      await Bridgefy.initialize(apiKey, true); // true = enable encryption
      await Bridgefy.start(userId, BridgefyPropagationProfile.REALTIME);
      this.isInitialized = true;
      console.log('Bridgefy started with user', userId);

      // Listen for received packets and fan out to subscribers.
      this.receiveSubscription = Bridgefy.onReceiveData((data: any) => {
        try {
          const rawBody = data?.data ?? data?.content;
          if (!rawBody || typeof rawBody !== 'string') return;
          const msg = JSON.parse(rawBody);
          this.handlers.forEach(h => h({
            type: msg?.type ?? 'unknown',
            senderId: data?.senderId ?? data?.peerId ?? 'unknown',
            payload: msg?.payload,
          }));
        } catch (_e) {}
      });

      Bridgefy.addEventListener(BridgefyEvents.BRIDGEFY_DID_CONNECT, (data: any) => {
        const peerId = data?.userId ?? data?.peerId;
        if (peerId) {
          this.connectedPeerIds.add(peerId);
          this.emitPeers();
        }
      });

      Bridgefy.addEventListener(BridgefyEvents.BRIDGEFY_DID_DISCONNECT, (data: any) => {
        const peerId = data?.userId ?? data?.peerId;
        if (peerId) {
          this.connectedPeerIds.delete(peerId);
          this.emitPeers();
        }
      });

      const peersEvent = BridgefyEvents?.BRIDGEFY_DID_UPDATE_CONNECTED_PEERS;
      if (peersEvent) {
        Bridgefy.addEventListener(peersEvent, (data: any) => {
          const peers: string[] = Array.isArray(data?.peers) ? data.peers : [];
          this.connectedPeerIds = new Set(peers);
          this.emitPeers();
        });
      }
    } catch (error) {
      console.error('Bridgefy init error:', error);
    }
  }

  async stop(): Promise<void> {
    try {
      this.receiveSubscription?.remove();
      this.receiveSubscription = undefined;
      if (this.isInitialized) {
        await Bridgefy.stop();
      }
    } catch (error) {
      console.error('Bridgefy stop error:', error);
    } finally {
      this.isInitialized = false;
    }
  }

  sendToAll(message: { type: string; payload?: any }): boolean {
    if (!this.isInitialized) return false;
    // Bridgefy broadcast – automatically propagates to all reachable nodes in mesh
    Bridgefy.sendBroadcast(JSON.stringify(message)).catch((error: unknown) => {
      console.error('Bridgefy send error:', error);
    });
    return true;
  }

  subscribe(handler: BridgefyMessageHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  subscribeConnectedPeers(listener: PeerListener): () => void {
    this.peerListeners.add(listener);
    listener(new Set(this.connectedPeerIds));
    return () => { this.peerListeners.delete(listener); };
  }

  getConnectedPeers(): Set<string> {
    return new Set(this.connectedPeerIds);
  }

  getMyUserId(): string {
    return this.myUserId;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  private emitPeers() {
    const snapshot = new Set(this.connectedPeerIds);
    this.peerListeners.forEach((l) => l(snapshot));
  }
}

export const bridgefyManager = new BridgefyManager();