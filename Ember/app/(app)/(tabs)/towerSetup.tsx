import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import {
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import { wsManager } from '@/lib/webSocketManager';

const { width, height } = Dimensions.get('window');

export default function TowerSetup() {
  const router = useRouter();
  const [towerName, setTowerName] = useState('');

  const handleBroadcast = () => {
    if (!towerName.trim()) return;
    const cleanName = towerName.trim();
    const normalizedTowerId = cleanName.toLowerCase().replace(/\s+/g, '-');

    // Register early so responders can already discover this tower as standing by.
    wsManager.send({
      type: 'tower_register',
      towerId: normalizedTowerId,
      towerName: cleanName,
      missionActive: false,
    });

    const encodedName = encodeURIComponent(cleanName);
    const towerId = encodeURIComponent(normalizedTowerId);
    router.push(`/(app)/(tabs)/towerDashboard?towerName=${encodedName}&towerId=${towerId}` as Href);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
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
          {/* Command‑style decorative lines */}
          <Line x1="50%" y1="5%" x2="50%" y2="25%" stroke="#00E5FF" strokeWidth="0.5" opacity="0.5" />
          <Circle cx="50%" cy="25%" r="3" fill="#00E5FF" opacity="0.6" />
          <Line x1="50%" y1="25%" x2="30%" y2="45%" stroke="#00E5FF" strokeWidth="0.5" opacity="0.4" />
          <Line x1="50%" y1="25%" x2="70%" y2="45%" stroke="#00E5FF" strokeWidth="0.5" opacity="0.4" />
          <Circle cx="30%" cy="45%" r="3" fill="#00E5FF" opacity="0.5" />
          <Circle cx="70%" cy="45%" r="3" fill="#00E5FF" opacity="0.5" />
        </Svg>
      </View>

      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.glow} />
          <MaterialCommunityIcons name="tower-fire" size={72} color="#00E5FF" />
        </View>

        <Text style={styles.heading}>Command Post Setup</Text>
        <Text style={styles.subtitle}>
          Enter a name for your control tower. Responders will see this when they connect.
        </Text>

        {/* Tower Name Input */}
        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons
            name="pencil-outline"
            size={20}
            color="#6b7280"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="e.g. Fireteam Alpha"
            placeholderTextColor="#6b7280"
            value={towerName}
            onChangeText={setTowerName}
            autoCapitalize="words"
            maxLength={30}
          />
        </View>

        {/* Broadcast Button */}
        <TouchableOpacity
          style={[styles.broadcastButton, !towerName.trim() && styles.broadcastButtonDisabled]}
          onPress={handleBroadcast}
          disabled={!towerName.trim()}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="broadcast" size={22} color="#0B0E14" />
          <Text style={styles.broadcastButtonText}>Broadcast & Await Responders</Text>
        </TouchableOpacity>

        {/* Hint */}
        <Text style={styles.hint}>
          Your device will act as the local command hub. No internet required.
        </Text>
      </View>
    </KeyboardAvoidingView>
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
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#00E5FF',
    opacity: 0.15,
    transform: [{ scale: 1.4 }],
  },
  heading: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 12,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1f2e',
    borderWidth: 1.5,
    borderColor: '#2a3441',
    borderRadius: 16,
    marginBottom: 24,
  },
  inputIcon: {
    marginLeft: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 16,
  },
  broadcastButton: {
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
  },
  broadcastButtonDisabled: {
    backgroundColor: '#2a3441',
    shadowOpacity: 0,
    elevation: 0,
  },
  broadcastButtonText: {
    color: '#0B0E14',
    fontWeight: '700',
    fontSize: 18,
  },
  hint: {
    color: '#4b5563',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
});