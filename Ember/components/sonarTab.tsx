import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { presenceTracker, type ResponderPresence } from '@/lib/presenceTracker';

const MAX_DISTANCE_FT = 120;
const RING_FRACTIONS = [0.33, 0.66, 1];

function hashToAngle(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return (hash % 360) * (Math.PI / 180);
}

function qualityColor(quality: number) {
  if (quality >= 70) return '#4ade80';
  if (quality >= 40) return '#fbbf24';
  return '#ef4444';
}

export default function SonarTab() {
  const [responders, setResponders] = useState<ResponderPresence[]>([]);
  const [selected, setSelected] = useState<ResponderPresence | null>(null);
  const [sonarSize, setSonarSize] = useState(() => {
    const { width } = Dimensions.get('window');
    return Math.min(width - 32, 360);
  });

  const sweepAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = presenceTracker.subscribe(setResponders);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setSonarSize(Math.min(window.width - 32, 360));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sweepLoop = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulseLoop = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    sweepLoop.start();
    pulseLoop.start();
    return () => {
      sweepLoop.stop();
      pulseLoop.stop();
    };
  }, [pulseAnim, sweepAnim]);

  const rotate = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.2],
  });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 0],
  });

  const center = sonarSize / 2;
  const maxRadius = center - 20;

  const blips = useMemo(() => {
    return responders.map((r) => {
      const distanceRatio = Math.min(r.distanceFt, MAX_DISTANCE_FT) / MAX_DISTANCE_FT;
      const radius = distanceRatio * maxRadius;
      const angle = hashToAngle(r.identity);
      return {
        responder: r,
        x: center + radius * Math.cos(angle) - 9,
        y: center + radius * Math.sin(angle) - 9,
        color: qualityColor(r.signalQuality),
      };
    });
  }, [responders, center, maxRadius]);

  const strongCount = responders.filter((r) => r.signalQuality >= 70).length;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Mesh Sonar</Text>
          <Text style={styles.subtitle}>
            {responders.length === 0
              ? 'Waiting for responder pings...'
              : `${responders.length} responder${responders.length === 1 ? '' : 's'} tracked · ${strongCount} strong link${strongCount === 1 ? '' : 's'}`}
          </Text>
        </View>
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Live</Text>
        </View>
      </View>

      <View style={styles.sonarWrapper}>
        <View style={[styles.sonar, { width: sonarSize, height: sonarSize, borderRadius: sonarSize / 2 }]}>
          {RING_FRACTIONS.map((frac, idx) => {
            const ringSize = sonarSize * frac;
            return (
              <View
                key={`ring-${idx}`}
                style={[
                  styles.ring,
                  {
                    width: ringSize,
                    height: ringSize,
                    borderRadius: ringSize / 2,
                    top: center - ringSize / 2,
                    left: center - ringSize / 2,
                  },
                ]}
              />
            );
          })}

          <View style={[styles.crosshair, styles.crosshairH, { top: center - 0.5, width: sonarSize }]} />
          <View style={[styles.crosshair, styles.crosshairV, { left: center - 0.5, height: sonarSize }]} />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.sweepContainer,
              {
                width: sonarSize,
                height: sonarSize,
                transform: [{ rotate }],
              },
            ]}
          >
            <View
              style={[
                styles.sweepArm,
                {
                  height: center,
                  top: 0,
                  left: center - 1,
                },
              ]}
            />
            <View
              style={[
                styles.sweepGlow,
                {
                  width: sonarSize,
                  height: sonarSize,
                  borderRadius: sonarSize / 2,
                },
              ]}
            />
          </Animated.View>

          <View style={[styles.tower, { top: center - 16, left: center - 16 }]}>
            <MaterialCommunityIcons name="radio-tower" size={20} color="#0B0E14" />
          </View>

          {blips.map(({ responder, x, y, color }) => (
            <React.Fragment key={responder.identity}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.blipPulse,
                  {
                    top: y - 6,
                    left: x - 6,
                    borderColor: color,
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                  },
                ]}
              />
              <TouchableOpacity
                style={[styles.blip, { top: y, left: x, backgroundColor: color }]}
                activeOpacity={0.7}
                onPress={() => setSelected(responder)}
                hitSlop={8}
              />
            </React.Fragment>
          ))}
        </View>

        <View style={styles.scaleLabels}>
          {RING_FRACTIONS.map((frac, idx) => (
            <Text key={idx} style={styles.scaleLabel}>
              {Math.round(MAX_DISTANCE_FT * frac)} ft
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.legend}>
        <LegendDot color="#4ade80" label="Strong" />
        <LegendDot color="#fbbf24" label="Fair" />
        <LegendDot color="#ef4444" label="Weak" />
      </View>

      <Modal transparent visible={Boolean(selected)} animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)} />
        {selected && (
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <MaterialCommunityIcons
                name="account-circle"
                size={28}
                color={qualityColor(selected.signalQuality)}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailTitle}>{selected.email}</Text>
                <Text style={styles.detailSub}>
                  {selected.directlyConnected ? 'Direct Bluetooth link' : 'Relayed through mesh'}
                </Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <MetricBlock label="Distance" value={`${selected.distanceFt} ft`} />
              <MetricBlock
                label="Signal"
                value={`${selected.signalQuality}/100`}
                valueColor={qualityColor(selected.signalQuality)}
              />
              <MetricBlock
                label="Last ping"
                value={`${Math.max(0, Math.round((Date.now() - selected.lastSeenAt) / 1000))}s`}
              />
            </View>

            <View style={styles.qualityBar}>
              <View
                style={[
                  styles.qualityFill,
                  {
                    width: `${Math.max(6, selected.signalQuality)}%`,
                    backgroundColor: qualityColor(selected.signalQuality),
                  },
                ]}
              />
            </View>

            <Text style={styles.detailHint}>
              Mesh quality improves as peers move closer or relay hops are added. Encourage
              responders to stay within 80 ft of a peer for best reach.
            </Text>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function MetricBlock({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.metricBlock}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14', paddingHorizontal: 14, paddingTop: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderColor: 'rgba(74, 222, 128, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  statusText: { color: '#4ade80', fontSize: 11, fontWeight: '700' },
  sonarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  sonar: {
    backgroundColor: '#05110c',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.18)',
    overflow: 'hidden',
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  crosshair: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
  },
  crosshairH: { height: 1, left: 0 },
  crosshairV: { width: 1, top: 0 },
  sweepContainer: { position: 'absolute', top: 0, left: 0, alignItems: 'center' },
  sweepArm: {
    position: 'absolute',
    width: 2,
    backgroundColor: 'rgba(0, 229, 255, 0.85)',
  },
  sweepGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderTopColor: 'rgba(0, 229, 255, 0.15)',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
  },
  tower: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00E5FF',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  blip: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  blipPulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
  },
  scaleLabels: {
    marginTop: 10,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  scaleLabel: { color: '#4b5563', fontSize: 11 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 6,
    marginBottom: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: '#9ca3af', fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  detailCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 12,
  },
  detailHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  detailTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  detailSub: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  metricRow: { flexDirection: 'row', gap: 10 },
  metricBlock: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  metricLabel: { color: '#6b7280', fontSize: 11, fontWeight: '600' },
  metricValue: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 2 },
  qualityBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1f2937',
    overflow: 'hidden',
  },
  qualityFill: { height: '100%', borderRadius: 4 },
  detailHint: { color: '#6b7280', fontSize: 12, lineHeight: 17 },
  closeBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: { color: '#0B0E14', fontWeight: '700' },
});
