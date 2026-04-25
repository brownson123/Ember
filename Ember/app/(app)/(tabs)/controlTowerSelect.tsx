// screens/ControlTowerSelect.tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { bridgefyManager } from '@/lib/bridgefyManager';
import { sendMeshFirst } from '@/lib/transportManager';
import { useAppState, type ChatMessage } from '@/context/AppStateContext';
import { wsManager } from '@/lib/webSocketManager';

const { width, height } = Dimensions.get('window');

type Tower = {
  id: string;
  name: string;
  missionActive: boolean;
  responders?: number;
};

export default function ControlTowerSelect() {
  const router = useRouter();
  const { dispatch } = useAppState();
  const [availableTowers, setAvailableTowers] = useState<Tower[]>([]);
  const [joiningTowerId, setJoiningTowerId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('Unknown');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? 'Unknown');
    });
  }, []);

  useEffect(() => {
    // Ask the server for already-registered towers on mount
    wsManager.send({ type: 'get_towers' });

    const bridgefyUnsubscribe = bridgefyManager.subscribe((msg) => {
      if (msg.type === 'tower_announcement') {
        const tower = msg.payload;
        if (!tower?.towerId || !tower?.towerName) return;
        setAvailableTowers((prev) => {
          const existing = prev.find((t) => t.id === tower.towerId);
          if (existing) {
            return prev.map((t) => t.id === tower.towerId ? {
              ...t,
              name: tower.towerName,
              missionActive: Boolean(tower.missionActive),
            } : t);
          }
          return [...prev, {
            id: tower.towerId,
            name: tower.towerName,
            missionActive: Boolean(tower.missionActive),
          }];
        });
      }
    });

    const processJoinLifecycle = (data: any) => {
      if (!data) return;
      const normalized = data?.payload && data?.type
        ? { type: data.type, ...data.payload }
        : data;

      if (normalized?.type === 'tower_list') {
        const list = (normalized.towers ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          missionActive: Boolean(t.missionActive),
        }));
        setAvailableTowers(list);
        return;
      }

      if (normalized?.type === 'mission_start') {
        setAvailableTowers((prev) => {
          const existing = prev.find((t) => t.id === normalized.towerId);
          if (existing) {
            return prev.map((t) => t.id === normalized.towerId ? { ...t, missionActive: true } : t);
          }
          return [...prev, { id: normalized.towerId, name: normalized.towerName, missionActive: true }];
        });
        return;
      }

      if (normalized?.type === 'mission_joined') {
        dispatch({ type: 'LOAD_MESSAGES', payload: (normalized.messages ?? []) as ChatMessage[] });
        dispatch({ type: 'SET_ACTIVE_TEAM', payload: normalized.teamEmails ?? [] });
        setJoiningTowerId(null);
        const encodedName = encodeURIComponent(normalized.towerName ?? 'Control Tower');
        const encodedId = encodeURIComponent(normalized.towerId ?? '');
        router.replace(`/mainDashboard?role=responder&towerId=${encodedId}&towerName=${encodedName}` as Href);
      }

      if (normalized?.type === 'join_denied') {
        setJoiningTowerId(null);
        Alert.alert('Join Denied', normalized.reason ?? 'The control tower did not accept your request.');
      }
    };

    const bridgefyJoinUnsubscribe = bridgefyManager.subscribe(processJoinLifecycle);
    const wsUnsubscribe = wsManager.subscribe(processJoinLifecycle);

    return () => {
      bridgefyUnsubscribe();
      bridgefyJoinUnsubscribe();
      wsUnsubscribe();
    };
  }, [dispatch, router]);

  const handleJoinMission = async (tower: Tower) => {
    setJoiningTowerId(tower.id);
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email ?? userEmail;
    sendMeshFirst('join_request', {
      towerId: tower.id,
      responderEmail: email,
    });
  };

  const renderTowerItem = ({ item }: { item: Tower }) => {
    const isJoiningThis = joiningTowerId === item.id;
    return (
      <TouchableOpacity
        style={[styles.towerCard, item.missionActive && styles.towerCardSelected]}
        activeOpacity={0.9}
      >
        <View style={styles.towerHeader}>
          <View style={styles.towerIconContainer}>
            <MaterialCommunityIcons name="tower-fire" size={24} color={item.missionActive ? '#00E5FF' : '#9ca3af'} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.towerName, item.missionActive && styles.towerNameSelected]}>{item.name}</Text>
            <Text style={styles.towerRole}>{item.missionActive ? 'Mission in Progress' : 'Standing By'}</Text>
          </View>
        </View>

        {item.missionActive && (
          <TouchableOpacity
            style={[styles.connectButton, isJoiningThis && styles.connectButtonDisabled]}
            onPress={() => handleJoinMission(item)}
            disabled={isJoiningThis}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name={isJoiningThis ? 'loading' : 'login'} size={18} color="#0B0E14" />
            <Text style={styles.connectButtonText}>{isJoiningThis ? 'Requesting...' : 'Join Mission'}</Text>
          </TouchableOpacity>
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
        <Text style={styles.subtitle}>Join active missions or wait for a new one</Text>

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

      </View>
    </View>
  );
}

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
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
    marginTop: 12,
  },
  connectButtonDisabled: {
    backgroundColor: '#2a3441',
    shadowOpacity: 0,
    elevation: 0,
  },
  connectButtonText: {
    color: '#0B0E14',
    fontWeight: '700',
    fontSize: 14,
  },
  connectingText: {
    color: '#0B0E14',
    fontWeight: '600',
  },
});