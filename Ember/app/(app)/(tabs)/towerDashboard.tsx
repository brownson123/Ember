import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

const TOWER_CHANNEL = 'tower-lobby';

export default function TowerDashboard() {
  const { towerName, towerId } = useLocalSearchParams<{ towerName?: string; towerId?: string }>();
  const label = towerName ?? 'Control Tower';
  const resolvedTowerId = useMemo(() => {
    if (towerId) return towerId;
    return label.toLowerCase().replace(/\s+/g, '-');
  }, [label, towerId]);

  const [connectedResponders, setConnectedResponders] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;

    const updateResponderCount = () => {
      if (!activeChannel || !isMounted) return;
      const presence = activeChannel.presenceState<{
        towerId?: string;
        role?: 'tower' | 'responder';
      }>();

      const count = Object.values(presence).reduce((total, sessions) => {
        const matching = sessions.filter(
          (session) => session.role === 'responder' && session.towerId === resolvedTowerId
        ).length;
        return total + matching;
      }, 0);

      setConnectedResponders(count);
    };

    const setupPresence = async () => {
      const { data: auth } = await supabase.auth.getUser();
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

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{label} - Awaiting Connections</Text>
      <Text style={styles.subtext}>{connectedResponders} responder(s) online</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#fff', fontSize: 18 },
  subtext: { color: '#9ca3af', fontSize: 14, marginTop: 10 },
});