import { Stack } from 'expo-router';
import { AppStateProvider } from '../lib/appState';

export default function RootLayout() {
  return (
    <AppStateProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F7FAFF' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="identity" />
        <Stack.Screen name="prayer" />
        <Stack.Screen name="platform" />
        <Stack.Screen name="settings" />
      </Stack>
    </AppStateProvider>
  );
}
