// screens/ControlTowerSelect.tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useWebSocket } from '@/hooks/websockets';
import { getWebSocketUrl } from '@/hooks/get-websocket-url';

const { width, height } = Dimensions.get('window');
const TOWER_CHANNEL = 'tower-lobby';

type Tower = {
  id: string;
  name: string;
  signalStrength: number;
  responders: number;
  role: string;
};

export default function ControlTowerSelect() {
  const router = useRouter();
  const [availableTowers, setAvailableTowers] = useState<Tower[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const wsUrl = getWebSocketUrl();

  const selectedTower = useMemo(
    () => availableTowers.find((tower) => tower.id === selectedId) ?? null,
    [availableTowers, selectedId]
  );

  const onMissionMessage = useCallback(
    (msg: { type?: string; towerId?: string; towerName?: string }) => {
      if (msg?.type !== 'mission_start' || !selectedTower) return;
      if (msg.towerId && msg.towerId !== selectedTower.id) return;

      const encodedId = encodeURIComponent(selectedTower.id);
      const encodedName = encodeURIComponent(selectedTower.name);
      router.replace(`/mainDashboard?role=responder&towerId=${encodedId}&towerName=${encodedName}` as Href);
    },
    [router, selectedTower]
  );

  useWebSocket(wsUrl, onMissionMessage);

  useEffect(() => {
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;

    const syncTowersFromPresence = () => {
      if (!activeChannel || !isMounted) return;
      const presence = activeChannel.presenceState<{
        role?: 'tower' | 'responder';
        towerId?: string;
        towerName?: string;
        updatedAt?: string;
      }>();

      const uniqueTowers = new Map<string, Tower>();

      Object.values(presence).forEach((sessions) => {
        sessions.forEach((session) => {
          if (session.role !== 'tower' || !session.towerId) return;

          if (!uniqueTowers.has(session.towerId)) {
            uniqueTowers.set(session.towerId, {
              id: session.towerId,
              name: session.towerName ?? 'Control Tower',
              signalStrength: 100,
              responders: 0,
              role: 'Control Tower',
            });
          }
        });
      });

      // Count responder sessions per tower.
      Object.values(presence).forEach((sessions) => {
        sessions.forEach((session) => {
          if (session.role !== 'responder' || !session.towerId) return;
          const tower = uniqueTowers.get(session.towerId);
          if (tower) {
            tower.responders += 1;
          }
        });
      });

      const nextTowers = Array.from(uniqueTowers.values());
      setAvailableTowers(nextTowers);

      // Reset selection if selected tower no longer exists.
      setSelectedId((prev) => (prev && nextTowers.some((tower) => tower.id === prev) ? prev : null));
    };

    const setupChannel = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? `responder-${Date.now()}`;

      activeChannel = supabase.channel(TOWER_CHANNEL, {
        config: { presence: { key: `responder-${userId}` } },
      });

      activeChannel
        .on('presence', { event: 'sync' }, syncTowersFromPresence)
        .on('presence', { event: 'join' }, syncTowersFromPresence)
        .on('presence', { event: 'leave' }, syncTowersFromPresence)
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && activeChannel) {
            await activeChannel.track({
              role: 'responder',
              towerId: null,
              updatedAt: new Date().toISOString(),
            });
          }
        });
    };

    void setupChannel();

    return () => {
      isMounted = false;
      if (activeChannel) {
        void activeChannel.untrack();
        void supabase.removeChannel(activeChannel);
      }
    };
  }, []);

  const handleConnect = () => {
    if (!selectedTower) return;
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      const encodedName = encodeURIComponent(selectedTower.name);
      const encodedId = encodeURIComponent(selectedTower.id);
      router.push(`/dashboard?towerName=${encodedName}&towerId=${encodedId}` as Href);
    }, 1500);
  };

  const renderTowerItem = ({ item }: { item: Tower }) => {
    const isSelected = item.id === selectedId;
    return (
      <TouchableOpacity
        style={[styles.towerCard, isSelected && styles.towerCardSelected]}
        onPress={() => setSelectedId(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.towerHeader}>
          <View style={styles.towerIconContainer}>
            <MaterialCommunityIcons
              name={
                item.role.includes('Medical')
                  ? 'hospital-box'
                  : item.role.includes('Police')
                  ? 'shield-account'
                  : item.role.includes('SAR')
                  ? 'magnify'
                  : 'fire'
              }
              size={24}
              color={isSelected ? '#00E5FF' : '#9ca3af'}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.towerName, isSelected && styles.towerNameSelected]}>
              {item.name}
            </Text>
            <Text style={styles.towerRole}>{item.role}</Text>
          </View>
          <View style={styles.signalContainer}>
            <MaterialCommunityIcons
              name="signal-cellular-3"
              size={18}
              color={getSignalColor(item.signalStrength)}
            />
            <Text style={[styles.signalText, { color: getSignalColor(item.signalStrength) }]}>
              {item.signalStrength}%
            </Text>
          </View>
        </View>

        <View style={styles.towerFooter}>
          <MaterialCommunityIcons name="account-group" size={16} color="#6b7280" />
          <Text style={styles.responderCount}>{item.responders} responders connected</Text>
        </View>

        {isSelected && (
          <View style={styles.selectedIndicator}>
            <View style={styles.selectedDot} />
            <Text style={styles.selectedText}>Selected</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Background Mesh Pattern */}
      <View style={styles.bgPattern}>
        <Svg width={width} height={height}>
          <Defs>
            <Pattern id="mesh" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <Path
                d="M 50 0 L 100 50 L 50 100 L 0 50 Z"
                fill="none"
                stroke="#00E5FF"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </Pattern>
          </Defs>
          <Rect width={width} height={height} fill="url(#mesh)" />
          {/* Decorative connections */}
          <Line x1="50%" y1="10%" x2="30%" y2="30%" stroke="#00E5FF" strokeWidth="0.5" opacity="0.4" />
          <Line x1="70%" y1="20%" x2="40%" y2="60%" stroke="#00E5FF" strokeWidth="0.5" opacity="0.4" />
          <Line x1="20%" y1="50%" x2="80%" y2="70%" stroke="#00E5FF" strokeWidth="0.5" opacity="0.4" />
          <Circle cx="50%" cy="10%" r="3" fill="#00E5FF" opacity="0.6" />
          <Circle cx="30%" cy="30%" r="3" fill="#00E5FF" opacity="0.6" />
          <Circle cx="70%" cy="20%" r="3" fill="#00E5FF" opacity="0.6" />
          <Circle cx="40%" cy="60%" r="3" fill="#00E5FF" opacity="0.6" />
          <Circle cx="20%" cy="50%" r="3" fill="#00E5FF" opacity="0.6" />
          <Circle cx="80%" cy="70%" r="3" fill="#00E5FF" opacity="0.6" />
        </Svg>
      </View>

      <View style={styles.content}>
        <Text style={styles.heading}>Select Control Tower</Text>
        <Text style={styles.subtitle}>Choose the command node for your unit</Text>

        <FlatList
          data={availableTowers}
          keyExtractor={(item) => item.id}
          renderItem={renderTowerItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="tower-fire" size={40} color="#6b7280" />
              <Text style={styles.emptyStateTitle}>No control towers found</Text>
              <Text style={styles.emptyStateText}>
                Waiting for a control tower to start broadcasting.
              </Text>
            </View>
          }
        />

        <TouchableOpacity
          style={[
            styles.connectButton,
            (!selectedId || connecting || availableTowers.length === 0) && styles.connectButtonDisabled,
          ]}
          onPress={handleConnect}
          disabled={!selectedId || connecting || availableTowers.length === 0}
          activeOpacity={0.8}
        >
          {connecting ? (
            <Text style={styles.connectingText}>Connecting...</Text>
          ) : (
            <>
              <MaterialCommunityIcons name="connection" size={22} color="#0B0E14" />
              <Text style={styles.connectButtonText}>Connect to Control Tower</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getSignalColor = (strength: number): string => {
  if (strength >= 80) return '#4ade80';
  if (strength >= 60) return '#fbbf24';
  return '#ef4444';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E14',
  },
  bgPattern: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  content: {
    flex: 1,
    zIndex: 10,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  heading: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 28,
  },
  list: {
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 56,
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    color: '#e5e7eb',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyStateText: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  towerCard: {
    backgroundColor: '#1a1f2e',
    borderWidth: 1.5,
    borderColor: '#2a3441',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  towerCardSelected: {
    borderColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  towerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  towerIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(0,229,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  towerName: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '600',
  },
  towerNameSelected: {
    color: '#fff',
  },
  towerRole: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  signalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signalText: {
    fontSize: 12,
    fontWeight: '500',
  },
  towerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  responderCount: {
    color: '#6b7280',
    fontSize: 12,
  },
  selectedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00E5FF',
  },
  selectedText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '600',
  },
  connectButton: {
    backgroundColor: '#00E5FF',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
    marginTop: 20,
  },
  connectButtonDisabled: {
    backgroundColor: '#2a3441',
    shadowOpacity: 0,
    elevation: 0,
  },
  connectButtonText: {
    color: '#0B0E14',
    fontWeight: '700',
    fontSize: 18,
  },
  connectingText: {
    color: '#0B0E14',
    fontWeight: '600',
  },
});