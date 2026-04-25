import { Platform } from 'react-native';

const DEFAULT_PORT = 8089;

export function getWebSocketUrl() {
  const configured = process.env.EXPO_PUBLIC_WS_URL;
  if (configured) return configured;

  // Sensible local defaults in development when env is not set.
  if (__DEV__) {
    if (Platform.OS === 'android') return `ws://10.0.2.2:${DEFAULT_PORT}`;
    return `ws://localhost:${DEFAULT_PORT}`;
  }

  return `ws://localhost:${DEFAULT_PORT}`;
}

