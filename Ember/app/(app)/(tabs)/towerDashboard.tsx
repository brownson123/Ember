import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useWebSocket } from '@/hooks/websockets';
import { supabase } from '@/lib/supabase';
import { getWebSocketUrl } from '@/hooks/get-websocket-url';

const TOWER_CHANNEL = 'tower-lobby';

export default function TowerDashboard() {
  const router = useRouter();
  const { towerName, towerId } = useLocalSearchParams<{ towerName?: string; towerId?: string }>();
  const label = towerName ?? 'Control Tower';
  const resolvedTowerId = useMemo(
    () => towerId ?? label.toLowerCase().replace(/\s+/g, '-'),
    [label, towerId]
  );
  const wsUrl = getWebSocketUrl();
  const [respondersOnline, setRespondersOnline] = useState(0);

  const handleMessage = useCallback((_msg: unknown) => {
    // Reserved for responder counters and future AI events.
  }, []);

  const { connected, send } = useWebSocket(wsUrl, handleMessage);

  useEffect(() => {
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;

    const updateResponderCount = () => {
      if (!activeChannel || !isMounted) return;
      const presence = activeChannel.presenceState<{
        role?: 'tower' | 'responder';
        towerId?: string | null;
      }>();

      const count = Object.values(presence).reduce((total, sessions) => {
        const connected = sessions.filter(
          (session) => session.role === 'responder' && session.towerId === resolvedTowerId
        ).length;
        return total + connected;
      }, 0);

      setRespondersOnline(count);
    };

    const setupPresence = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!isMounted) return;

      const userId = auth.user?.id ?? `tower-${Date.now()}`;
      activeChannel = supabase.channel(TOWER_CHANNEL, {
        config: { presence: { key: `tower-${userId}` } },
      });

      activeChannel
        .on('presence', { event: 'sync' }, updateResponderCount)
        .on('presence', { event: 'join' }, updateResponderCount)
        .on('presence', { event: 'leave' }, updateResponderCount)
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && activeChannel) {
            await activeChannel.track({
              role: 'tower',
              towerId: resolvedTowerId,
              towerName: label,
              updatedAt: new Date().toISOString(),
            });
            updateResponderCount();
          }
        });
    };

    void setupPresence();

    return () => {
      isMounted = false;
      if (activeChannel) {
        void activeChannel.untrack();
        void supabase.removeChannel(activeChannel);
      }
    };
  }, [label, resolvedTowerId]);

  const handleStartMission = () => {
    send({
      type: 'mission_start',
      towerId: resolvedTowerId,
      towerName: label,
      sentAt: new Date().toISOString(),
    });

    const encodedTowerName = encodeURIComponent(label);
    const encodedTowerId = encodeURIComponent(resolvedTowerId);
    router.replace(`/mainDashboard?role=tower&towerName=${encodedTowerName}&towerId=${encodedTowerId}` as Href);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{label}</Text>
      <Text style={styles.connection}>{connected ? 'Sync channel connected' : 'Connecting to sync channel...'}</Text>
      <Text style={styles.status}>Responders: {respondersOnline} connected</Text>
      <TouchableOpacity style={styles.startButton} onPress={handleStartMission}>
        <Text style={styles.startButtonText}>Start Mission</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14', justifyContent: 'center', alignItems: 'center' },
  heading: { color: '#fff', fontSize: 28, fontWeight: '700' },
  connection: { color: '#00E5FF', fontSize: 13, marginTop: 8 },
  status: { color: '#9ca3af', fontSize: 16, marginTop: 12 },
  startButton: {
    marginTop: 40,
    backgroundColor: '#00E5FF',
    paddingVertical: 16, paddingHorizontal: 40,
    borderRadius: 16,
  },
  startButtonText: { color: '#0B0E14', fontSize: 18, fontWeight: '700' },
});