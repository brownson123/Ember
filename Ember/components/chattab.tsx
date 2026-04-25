import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
    FlatList, StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { useAppState, type ChatMessage } from '@/context/AppStateContext';
import { supabase } from '../lib/supabase';
import { wsManager } from '../lib/webSocketManager';

interface ChatTabProps {
  isTower: boolean;
}

export default function ChatTab({ isTower }: ChatTabProps) {
  const [input, setInput] = useState('');
  const [userEmail, setUserEmail] = useState<string>('');
  const { state } = useAppState();

  // Get current user's email once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? 'Unknown');
    });
  }, []);

  // Send a new message (only sends, doesn't add locally)
  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content) return;
    const sender = userEmail || (await supabase.auth.getUser()).data.user?.email || 'Unknown';
    const message = {
      type: 'chat_message',
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender,
      content,
      timestamp: Date.now(),
    };
    wsManager.send(message);
    setInput('');
  }, [input, userEmail]);

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageRow}>
      <View style={styles.avatar}>
        <MaterialCommunityIcons name="account" size={24} color="#00E5FF" />
      </View>
      <View style={styles.bubble}>
        <Text style={styles.sender}>{item.sender}</Text>
        <Text style={styles.content}>{item.content}</Text>
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
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1f2e',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  bubble: {
    flex: 1, backgroundColor: '#1a1f2e', borderRadius: 12, padding: 10,
  },
  sender: { color: '#00E5FF', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  content: { color: '#e5e7eb', fontSize: 14 },
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