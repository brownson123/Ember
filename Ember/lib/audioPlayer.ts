// lib/audioPlayer.ts
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export async function playAudioFromBase64Url(base64Url: string) {
  if (!base64Url) return;
  // Extract base64 portion
  const base64 = base64Url.includes(',') ? base64Url.split(',')[1] : base64Url;
  const uri = `data:audio/mpeg;base64,${base64}`;

  const { sound } = await Audio.Sound.createAsync({ uri });
  await sound.playAsync();
  // Optional: unload after playing
  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.isLoaded && status.didJustFinish) {
      sound.unloadAsync();
    }
  });
}

export function speakTextFallback(text: string) {
  if (!text) return;
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}