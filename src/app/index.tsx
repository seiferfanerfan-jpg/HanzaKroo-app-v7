import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Redirect } from 'expo-router';
import { useAppState } from '../lib/appState';
import { getStartupRoute } from '../lib/startupRoute';

const BLUE = '#1479F8';
const MUTED = '#71809A';

export default function IndexRoute() {
  const { ready, prefs } = useAppState();

  if (ready) return <Redirect href={getStartupRoute(prefs)} />;

  return (
    <View style={styles.loadingPage}>
      <StatusBar style="dark" />
      <ActivityIndicator size="large" color={BLUE} />
      <Text style={styles.loadingText}>بنجهّز الدعاء…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#F5F8FE' },
  loadingText: { color: MUTED, fontSize: 15, textAlign: 'center' },
});
