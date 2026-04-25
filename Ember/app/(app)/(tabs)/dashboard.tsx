import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

const TOWER_CHANNEL = 'tower-lobby';

export default function Dashboard() {
  const { towerId, towerName } = useLocalSearchParams<{ towerId?: string; towerName?: string }>();

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
});

