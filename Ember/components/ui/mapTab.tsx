import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Responder = {
  id: string;
  name: string;
  role: string;
  vitals: { heartRate: number; temperature: number; spO2: number };
  isMaster: boolean;
};

const responders: Responder[] = [
  { id: '1', name: 'Capt. Morrison', role: 'Engine', vitals: { heartRate: 98, temperature: 37.2, spO2: 98 }, isMaster: true },
  { id: '2', name: 'Lt. Chen', role: 'EMS', vitals: { heartRate: 85, temperature: 36.8, spO2: 99 }, isMaster: false },
  { id: '3', name: 'Off. Rodriguez', role: 'Police', vitals: { heartRate: 92, temperature: 37.0, spO2: 97 }, isMaster: false },
  { id: '4', name: 'FF Davis', role: 'Engine', vitals: { heartRate: 105, temperature: 37.5, spO2: 96 }, isMaster: false },
];

export default function MapTab() {
  const [selectedResponder, setSelectedResponder] = useState<Responder | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Network Active</Text>
        <Text style={styles.headerSub}>{responders.length} nodes connected</Text>
      </View>

      <View style={styles.grid}>
        {responders.map((responder) => (
          <TouchableOpacity
            key={responder.id}
            style={[styles.nodeCard, responder.isMaster && styles.masterNode]}
            activeOpacity={0.8}
            onPress={() => setSelectedResponder(responder)}
          >
            <MaterialCommunityIcons
              name={responder.isMaster ? 'star-circle' : 'account-circle'}
              size={24}
              color={responder.isMaster ? '#FFD700' : '#00E5FF'}
            />
            <Text style={styles.nodeName}>{responder.name}</Text>
            <Text style={styles.nodeRole}>{responder.role}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal visible={Boolean(selectedResponder)} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedResponder(null)} />
        {selectedResponder && (
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selectedResponder.name}</Text>
            <Text style={styles.modalRole}>{selectedResponder.role}</Text>
            <Text style={styles.modalMetric}>Heart Rate: {selectedResponder.vitals.heartRate} bpm</Text>
            <Text style={styles.modalMetric}>Temp: {selectedResponder.vitals.temperature} C</Text>
            <Text style={styles.modalMetric}>SpO2: {selectedResponder.vitals.spO2}%</Text>
            <TouchableOpacity style={styles.callButton} onPress={() => setSelectedResponder(null)}>
              <MaterialCommunityIcons name="phone" size={18} color="#0B0E14" />
              <Text style={styles.callButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14' },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1a1f2e' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  headerSub: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 },
  nodeCard: {
    width: '48%',
    backgroundColor: '#1a1f2e',
    borderColor: '#2a3441',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  masterNode: { borderColor: '#FFD700' },
  nodeName: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 8 },
  nodeRole: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: {
    backgroundColor: '#1a1f2e',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    gap: 8,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalRole: { color: '#9ca3af', fontSize: 13, marginBottom: 6 },
  modalMetric: { color: '#e5e7eb', fontSize: 13 },
  callButton: {
    marginTop: 8,
    backgroundColor: '#00E5FF',
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  callButtonText: { color: '#0B0E14', fontWeight: '700' },
});
