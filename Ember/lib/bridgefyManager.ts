// lib/bridgefyManager.ts
import Bridgefy, { BridgefyEvents, BridgefyPropagationProfile } from 'bridgefy-react-native';

type BridgefyMessageHandler = (message: {
  type: string;
  senderId: string;
  payload: any;
}) => void;

class BridgefyManager {
  private handlers: Set<BridgefyMessageHandler> = new Set();
  private isInitialized = false;
  private myUserId: string = '';
  private receiveSubscription?: { remove: () => void };

  async init(userId: string): Promise<void> {
    if (this.isInitialized || !userId) return;
    this.myUserId = userId;

    try {
      await Bridgefy.initialize('<YOUR_BRIDGEFY_API_KEY>', true); // true = enable encryption
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

      // Device discovered / lost (optional)
      Bridgefy.addEventListener(BridgefyEvents.BRIDGEFY_DID_CONNECT, (data: any) => {
        console.log('Device connected:', data);
      });

      Bridgefy.addEventListener(BridgefyEvents.BRIDGEFY_DID_DISCONNECT, (data: any) => {
        console.log('Device lost:', data);
      });
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
    Bridgefy.sendBroadcast(JSON.stringify(message)).catch((error) => {
      console.error('Bridgefy send error:', error);
    });
    return true;
  }

  subscribe(handler: BridgefyMessageHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  getMyUserId(): string {
    return this.myUserId;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export const bridgefyManager = new BridgefyManager();