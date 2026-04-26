import React, { useEffect, useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import ChatTab from '@/components/chattab';
import SonarTab from '@/components/sonarTab';
import { supabase } from '@/lib/supabase';
import { useAppState } from '@/context/AppStateContext';
import { sendMeshFirst } from '@/lib/transportManager';
import { wsManager } from '@/lib/webSocketManager';
import { presenceTracker } from '@/lib/presenceTracker';

type TabKey = 'overview' | 'chat' | 'info' | 'sonar';

function getRiskColor(level: string | undefined | null): string {
  switch (String(level || '').toLowerCase()) {
    case 'critical':
      return '#dc2626';
    case 'high':
      return '#ef4444';
    case 'moderate':
      return '#fbbf24';
    case 'low':
      return '#4ade80';
    default:
      return '#6b7280';
  }
}

export default function MainDashboard() {
  const { role, towerName } = useLocalSearchParams<{ role?: string; towerName?: string }>();
  const isTower = role === 'tower';
  const { state, dispatch } = useAppState();
  const router = useRouter();

  const handleExitMission = () => {
    router.replace(isTower ? '/towerSetup' as Href : '/controlTowerSelect' as Href);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as Href);
  };
  const activeTab = state.activeTab as TabKey;

  const subtitle = useMemo(() => {
    if (isTower) return `Control tower active: ${towerName ?? 'Unnamed Tower'}`;
    return `Connected to ${towerName ?? 'control tower'}`;
  }, [isTower, towerName]);

const setActiveTab = (tab: TabKey) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab });
  };

  useEffect(() => {
    dispatch({ type: 'SET_ROLE', payload: isTower ? 'tower' : 'responder' });
  }, [isTower, dispatch]);

  useEffect(() => {
    if (activeTab === 'chat') {
      dispatch({ type: 'MARK_CHAT_READ' });
      return;
    }

    if (activeTab === 'info') {
      dispatch({ type: 'MARK_INFO_READ' });
    }
  }, [activeTab, dispatch]);

  useEffect(() => {
    if (!isTower) return;

    const normalizedTowerId = (towerName ?? 'control-tower').toLowerCase().replace(/\s+/g, '-');
    const normalizedTowerName = towerName ?? 'Control Tower';

    const announceTower = () => {
      sendMeshFirst('tower_announcement', {
        towerId: normalizedTowerId,
        towerName: normalizedTowerName,
        missionActive: true,
      });
    };

    announceTower();
    const intervalId = setInterval(announceTower, 5000);

    return () => clearInterval(intervalId);
  }, [isTower, towerName]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const email = data.user?.email ?? data.user?.id ?? `user-${Date.now()}`;
      if (isTower) {
        presenceTracker.startAsTower(email);
      } else {
        presenceTracker.startAsResponder(email, email);
      }
    };
    void start();
    return () => {
      cancelled = true;
      presenceTracker.stop();
    };
  }, [isTower]);

  useEffect(() => {
    if (!isTower && activeTab === 'sonar') {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: 'overview' });
    }
  }, [isTower, activeTab, dispatch]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Main Dashboard</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.tabContent}>
        {activeTab === 'overview' && (
          <>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Operational Sync</Text>
              <Text style={styles.panelText}>
                All connected devices listen to the same mission start event over the websocket channel.
              </Text>
              <Text style={styles.panelMeta}>{isTower ? 'Role: Control Tower' : 'Role: Responder'}</Text>
            </View>

            <View style={styles.panel}>
              <View style={styles.teamHeader}>
                <MaterialCommunityIcons name="account-group" size={18} color="#00E5FF" />
                <Text style={styles.panelTitle}>Active Team</Text>
              </View>
              {state.activeTeamEmails.length === 0 ? (
                <Text style={styles.panelText}>No responders accepted into mission yet.</Text>
              ) : (
                state.activeTeamEmails.map((email) => (
                  <Text key={email} style={styles.teamEmail}>
                    - {email}
                  </Text>
                ))
              )}
            </View>

            <TouchableOpacity style={styles.exitButton} onPress={handleExitMission}>
              <MaterialCommunityIcons name="exit-run" size={18} color="#fbbf24" />
              <Text style={styles.exitButtonText}>Exit Mission</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <MaterialCommunityIcons name="logout" size={18} color="#ef4444" />
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        )}

        {activeTab === 'chat' && <ChatTab isTower={isTower} />}

        {activeTab === 'sonar' && isTower && <SonarTab />}

        {activeTab === 'info' && (
          <ScrollView contentContainerStyle={styles.infoContainer}>
            <View style={styles.panel}>
              <View style={styles.teamHeader}>
                <MaterialCommunityIcons
                  name="shield-alert"
                  size={18}
                  color={getRiskColor(state.missionInfo?.riskLevel)}
                />
                <Text style={styles.panelTitle}>
                  Risk Level: {state.missionInfo?.riskLevel ?? 'Unknown'}
                </Text>
              </View>
              <Text style={styles.panelText}>
                {state.missionInfo?.summary ?? 'AI briefing appears once the tower approves a hazard photo or a mission-critical chat insight.'}
              </Text>
              <Text style={styles.panelMeta}>
                Generated by Gemma (offline) / Backboard (online)
              </Text>
            </View>

            {(state.missionInfo?.hazards?.length ?? 0) > 0 && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Approved AI Recommendations</Text>
                {state.missionInfo!.hazards.map((h, i) => (
                  <View key={i} style={styles.requestRow}>
                    <Text style={styles.requestTitle}>{h.analysis}</Text>
                    <Text style={styles.requestStatus}>{h.protocol}</Text>
                  </View>
                ))}
              </View>
            )}

            {!state.missionInfo && (
              <View style={styles.panel}>
                <Text style={styles.panelText}>
                  {isTower
                    ? 'Approve AI recommendations (from hazard photos or chat intel) in Chat to populate the briefing.'
                    : 'Briefing populates after the tower approves AI recommendations from images or chat.'}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('overview')}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="view-dashboard"
            size={24}
            color={activeTab === 'overview' ? '#00E5FF' : 'rgba(255,255,255,0.6)'}
          />
          <Text style={[styles.navLabel, activeTab === 'overview' && styles.navLabelActive]}>
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('chat')}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="message-text"
            size={24}
            color={activeTab === 'chat' ? '#00E5FF' : 'rgba(255,255,255,0.6)'}
          />
          {state.unreadChatCount > 0 && activeTab !== 'chat' && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{state.unreadChatCount}</Text>
            </View>
          )}
          <Text style={[styles.navLabel, activeTab === 'chat' && styles.navLabelActive]}>
            Chat
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('info')}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="information-outline"
            size={24}
            color={activeTab === 'info' ? '#00E5FF' : 'rgba(255,255,255,0.6)'}
          />
          {state.unreadInfoCount > 0 && activeTab !== 'info' && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{state.unreadInfoCount}</Text>
            </View>
          )}
          <Text style={[styles.navLabel, activeTab === 'info' && styles.navLabelActive]}>
            Info
          </Text>
        </TouchableOpacity>

        {isTower && (
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setActiveTab('sonar')}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="radar"
              size={24}
              color={activeTab === 'sonar' ? '#00E5FF' : 'rgba(255,255,255,0.6)'}
            />
            <Text style={[styles.navLabel, activeTab === 'sonar' && styles.navLabelActive]}>
              Sonar
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {isTower && state.joinRequest && (
        <Modal transparent visible animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Join Request</Text>
              <Text style={styles.modalText}>
                {state.joinRequest.responderEmail} wants to join the active mission.
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.denyButton]}
                  onPress={() => {
                    wsManager.send({
                      type: 'join_response',
                      requestId: state.joinRequest?.requestId,
                      accept: false,
                    });
                    dispatch({ type: 'HIDE_JOIN_REQUEST' });
                  }}
                >
                  <Text style={styles.modalButtonText}>Deny</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.acceptButton]}
                  onPress={() => {
                    wsManager.send({
                      type: 'join_response',
                      requestId: state.joinRequest?.requestId,
                      accept: true,
                    });
                    dispatch({ type: 'HIDE_JOIN_REQUEST' });
                  }}
                >
                  <Text style={styles.modalButtonText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E14',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
    backgroundColor: '#0f1419',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 4,
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  panel: {
    backgroundColor: '#1a1f2e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a3441',
    padding: 14,
    marginBottom: 12,
  },
  panelTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  panelText: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 19,
  },
  panelMeta: {
    color: '#00E5FF',
    fontSize: 12,
    marginTop: 8,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  teamEmail: {
    color: '#e5e7eb',
    fontSize: 13,
    marginBottom: 4,
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  exitButtonText: {
    color: '#fbbf24',
    fontWeight: '600',
    fontSize: 14,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  signOutButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 14,
  },
  infoContainer: {
    paddingBottom: 16,
  },
  requestRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a3441',
  },
  requestTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '500',
  },
  requestStatus: {
    color: '#fbbf24',
    fontSize: 12,
    marginTop: 2,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#0f1419',
    borderTopWidth: 1,
    borderTopColor: '#1a1f2e',
    paddingHorizontal: 24,
    paddingVertical: 12,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 48,
    gap: 4,
    position: 'relative',
  },
  navLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
  navLabelActive: {
    color: '#00E5FF',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '82%',
    backgroundColor: '#1a1f2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a3441',
    padding: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalText: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  denyButton: {
    backgroundColor: '#ef4444',
  },
  acceptButton: {
    backgroundColor: '#00E5FF',
  },
  modalButtonText: {
    color: '#0B0E14',
    fontSize: 14,
    fontWeight: '700',
  },
});