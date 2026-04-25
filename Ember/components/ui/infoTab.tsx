import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type TimelineItem = { time: string; event: string };

const timeline: TimelineItem[] = [
  { time: '14:23', event: 'Dispatch - Structure fire reported' },
  { time: '14:25', event: 'First unit on scene' },
  { time: '14:27', event: 'Hazmat detected - Chlorine' },
  { time: '14:30', event: 'Evacuation order issued' },
  { time: '14:32', event: 'Survivor located - Sector 3' },
];

export default function InfoTab() {
  const [expanded, setExpanded] = useState(false);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.card} onPress={() => setExpanded((prev) => !prev)} activeOpacity={0.8}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Situation Report</Text>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#9ca3af"
          />
        </View>
        {expanded && (
          <Text style={styles.cardText}>
            Multi-floor structure fire at 2847 Oak Street. Chlorine detected on site. 15 responders
            deployed. 2 victims located. Evacuation perimeter established at 100m.
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="alert-outline" size={18} color="#f97316" />
          <Text style={styles.cardTitle}>Structure Integrity</Text>
        </View>
        <Text style={styles.cardText}>Damage assessment: 67%</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="account-group-outline" size={18} color="#00E5FF" />
          <Text style={styles.cardTitle}>Officers On Scene</Text>
        </View>
        <Text style={styles.cardText}>15 responders actively connected.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="weather-partly-cloudy" size={18} color="#00E5FF" />
          <Text style={styles.cardTitle}>Weather Conditions</Text>
        </View>
        <Text style={styles.cardText}>24 C, wind 12 km/h NE</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="timeline-clock-outline" size={18} color="#00E5FF" />
          <Text style={styles.cardTitle}>Incident Timeline</Text>
        </View>
        {timeline.map((item) => (
          <View key={`${item.time}-${item.event}`} style={styles.timelineRow}>
            <Text style={styles.timelineTime}>{item.time}</Text>
            <Text style={styles.timelineEvent}>{item.event}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14' },
  content: { padding: 14, gap: 10 },
  card: {
    backgroundColor: '#1a1f2e',
    borderWidth: 1,
    borderColor: '#2a3441',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cardText: { color: '#9ca3af', fontSize: 13, lineHeight: 18 },
  timelineRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  timelineTime: { color: '#6b7280', fontSize: 12, minWidth: 42 },
  timelineEvent: { color: '#e5e7eb', fontSize: 12, flex: 1 },
});
