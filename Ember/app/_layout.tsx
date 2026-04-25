import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import GlobalListener from '@/components/GlobalListener';
import { AppStateProvider } from '@/context/AppStateContext';
import { getWebSocketUrl } from '@/hooks/get-websocket-url';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { wsManager } from '@/lib/webSocketManager';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    const wsUrl = getWebSocketUrl();
    wsManager.connect(wsUrl);
    return () => wsManager.disconnect();
  }, []);

  return (
    <AppStateProvider>
      <GlobalListener />
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AppStateProvider>
  );
}
