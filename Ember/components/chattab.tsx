import { useAppState, type ChatMessage } from '@/context/AppStateContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
    FlatList, StyleSheet,
    Text, TextInput, TouchableOpacity, Image,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { sendMeshFirst } from '@/lib/transportManager';

interface ChatTabProps {
  isTower: boolean;
}

export default function ChatTab({ isTower }: ChatTabProps) {
  const [input, setInput] = useState('');
  const [userEmail, setUserEmail] = useState<string>('');
  const { state } = useAppState();

  const resizeForMesh = useCallback(async (uri: string) => {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 200 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return result.base64 ?? null;
  }, []);

  // Get current user's email once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? 'Unknown');
    });
  }, []);

  const pickImage = useCallback(async () => {
    // Ask for camera permissions
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Camera permission is required to take hazard photos.');
      return;
    }
  
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.8,
    });
  
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      let base64 = asset.base64;
      if (asset.uri) {
        base64 = await resizeForMesh(asset.uri);
      }
      if (!base64) {
        alert('Unable to read image data. Please try again.');
        return;
      }
  
      const { data: freshUser } = await supabase.auth.getUser();
      const payload = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: freshUser.user?.email || userEmail || 'Unknown',
        imageBase64: base64,
        timestamp: Date.now(),
      };
      const message = {
        type: 'hazard_report',
        payload,
      };
      sendMeshFirst(message.type, message.payload);
    }
  }, [resizeForMesh, userEmail]);

  // Send a new message (only sends, doesn't add locally)
  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content) return;
    const { data: freshUser } = await supabase.auth.getUser();
    const sender = freshUser.user?.email || userEmail || 'Unknown';
    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender,
      content,
      timestamp: Date.now(),
    };
    const message = {
      type: 'chat_message',
      payload,
    };
    sendMeshFirst(message.type, message.payload);
    setInput('');
  }, [input, userEmail]);

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageRow}>
      <View style={styles.avatar}>
        <MaterialCommunityIcons name={item.type === 'image' ? 'camera' : 'account'} size={24} color="#00E5FF" />
      </View>
      <View style={styles.bubble}>
        <Text style={styles.sender}>{item.sender}</Text>
        <Text style={styles.content}>{item.content}</Text>
        {item.imageBase64 && (
          <Image
            source={{ uri: `data:image/jpeg;base64,${item.imageBase64}` }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        )}
        {item.analysis ? (
          <View style={styles.analysisCard}>
            <Text style={styles.analysisTitle}>AI Analysis</Text>
            <Text style={styles.analysisText}>{item.analysis}</Text>
            {item.protocol ? <Text style={styles.protocolText}>Protocol: {item.protocol}</Text> : null}
            {item.status === 'pending' ? <Text style={styles.pendingText}>Pending approval</Text> : null}
            {item.status === 'approved' ? <Text style={styles.approvedText}>Approved</Text> : null}
            {item.status === 'denied' ? <Text style={styles.deniedText}>Denied</Text> : null}
          </View>
        ) : null}
        <Text style={styles.time}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={state.messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
      />
      <View style={styles.inputBar}>
  <TouchableOpacity onPress={pickImage} style={styles.cameraBtn}>
    <MaterialCommunityIcons name="camera" size={24} color="#00E5FF" />
  </TouchableOpacity>
  <TextInput
    style={styles.input}
    placeholder="Type a message..."
    placeholderTextColor="#6b7280"
    value={input}
    onChangeText={setInput}
    onSubmitEditing={sendMessage}
  />
  <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
    <MaterialCommunityIcons name="send" size={24} color="#0B0E14" />
  </TouchableOpacity>
</View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14' },
  messageRow: {
    flexDirection: 'row', marginBottom: 12, paddingHorizontal: 8,
  },
  cameraBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#1a1f2e',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1f2e',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  bubble: {
    flex: 1, backgroundColor: '#1a1f2e', borderRadius: 12, padding: 10,
  },
  sender: { color: '#00E5FF', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  content: { color: '#e5e7eb', fontSize: 14 },
  previewImage: {
    width: 180,
    height: 120,
    borderRadius: 8,
    marginTop: 8,
  },
  analysisCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2a3441',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#0f1419',
  },
  analysisTitle: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  analysisText: { color: '#e5e7eb', fontSize: 12 },
  protocolText: { color: '#f8fafc', fontSize: 12, marginTop: 6 },
  pendingText: { color: '#fbbf24', fontSize: 12, marginTop: 6 },
  approvedText: { color: '#4ade80', fontSize: 12, marginTop: 6 },
  deniedText: { color: '#ef4444', fontSize: 12, marginTop: 6 },
  time: { color: '#6b7280', fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  inputBar: {
    flexDirection: 'row', padding: 12, borderTopWidth: 1,
    borderTopColor: '#1a1f2e', backgroundColor: '#0f1419',
    alignItems: 'center',
  },
  input: {
    flex: 1, backgroundColor: '#1a1f2e', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, color: '#fff',
    marginRight: 8, borderWidth: 1, borderColor: '#2a3441',
  },
  sendButton: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#00E5FF',
    justifyContent: 'center', alignItems: 'center',
  },
});