import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useAppState } from '../lib/appState';

export default function IndexRoute() {
  const router = useRouter();
  const { ready, prefs } = useAppState();

  useEffect(() => {
    if (!ready) return;
    if (!prefs.platformUrl) router.replace('/setup');
    else if (!prefs.identity) router.replace('/identity');
    else router.replace('/prayer');
  }, [ready, prefs.platformUrl, prefs.identity, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#F7FAFF' }}>
      <StatusBar style="dark" />
      <ActivityIndicator size="large" color="#1479F8" />
      <Text style={{ color: '#71809A', textAlign: 'center' }}>بنجهّز مكان مذاكرتك…</Text>
    </View>
  );
}
