import { useWebSocket } from '@/hooks/websockets';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getWebSocketUrl } from '@/hooks/get-websocket-url';

const TOWER_CHANNEL = 'tower-lobby';

export default function Dashboard() {
  const router = useRouter();
  const { towerId, towerName } = useLocalSearchParams<{ towerId?: string; towerName?: string }>();
  const wsUrl = getWebSocketUrl();
  const [activeEmail, setActiveEmail] = React.useState<string>('Unknown');

  const onMessage = useCallback(
    (msg: { type?: string; towerId?: string; towerName?: string }) => {
      if (msg?.type !== 'mission_start') return;

      const encodedTowerId = encodeURIComponent(msg.towerId ?? towerId ?? '');
      const encodedTowerName = encodeURIComponent(msg.towerName ?? towerName ?? 'Control Tower');
      router.replace(
        `/mainDashboard?role=responder&towerId=${encodedTowerId}&towerName=${encodedTowerName}` as Href
      );
    },
    [router, towerId, towerName]
  );

  const { connected } = useWebSocket(wsUrl, onMessage);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setActiveEmail(data.user?.email ?? 'Unknown');
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;

    const setupPresence = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!isMounted) return;

      const userId = auth.user?.id ?? `responder-${Date.now()}`;
      activeChannel = supabase.channel(TOWER_CHANNEL, {
        config: { presence: { key: `responder-${userId}` } },
      });

      activeChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && activeChannel) {
          await activeChannel.track({
            role: 'responder',
            towerId: towerId ?? null,
            towerName: towerName ?? null,
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
  }, [towerId, towerName]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Responder Dashboard</Text>
      <Text style={styles.subtitle}>
        Connected to {towerName ?? 'control tower'}.
      </Text>
      <Text style={styles.identity}>Active user: {activeEmail}</Text>
      <Text style={styles.connection}>
        {connected ? 'Listening for mission start...' : 'Connecting to sync channel...'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0E14',
    padding: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 10,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
  },
  identity: {
    color: '#e5e7eb',
    fontSize: 12,
    marginTop: 8,
  },
  connection: {
    color: '#00E5FF',
    fontSize: 12,
    marginTop: 8,
  },
});

