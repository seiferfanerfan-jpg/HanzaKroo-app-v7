import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { PORTALS, type Portal } from '../data/portals';
import { useAppState } from '../lib/appState';

const BLUE = '#1479F8';
const NAVY = '#14254A';
const MUTED = '#71809A';

export default function IndexRoute() {
  const router = useRouter();
  const { ready, patchPrefs, setActiveUrl, setRollbackUrl } = useAppState();
  const [openingPortal, setOpeningPortal] = useState<string | null>(null);
  const openingRef = useRef(false);

  const openPortal = async (portal: Portal) => {
    if (!ready || openingRef.current) return;
    openingRef.current = true;
    setOpeningPortal(portal.id);
    try {
      const saved = await patchPrefs({ platformUrl: portal.url });
      if (!saved) {
        openingRef.current = false;
        setOpeningPortal(null);
        return;
      }
      setActiveUrl(portal.url);
      setRollbackUrl(null);
      router.push('/platform');
    } catch {
      openingRef.current = false;
      setOpeningPortal(null);
      Alert.alert('تعذر فتح المنصة', 'حصلت مشكلة غير متوقعة. حاول مرة ثانية.');
    }
  };

  if (!ready) {
    return (
      <View style={styles.loadingPage}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>بنجهّز مكان مذاكرتك…</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.logoFrame}>
            <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="شعار هنذاكروا" />
          </View>
          <Text style={styles.title}>أهلًا بك في هنذاكروا</Text>
          <Text style={styles.tagline}>سيستم كامل عشان نجيب 91%</Text>
          <Text style={styles.intro}>بتأثير المدرب، اختار منصة المذاكرة اللي هتبدأ منها، وهتفتح جوا التطبيق.</Text>
        </View>

        <View style={styles.options}>
          {PORTALS.map((portal, index) => {
            const busy = openingPortal !== null;
            return (
              <Pressable
                key={portal.id}
                accessibilityRole="button"
                accessibilityLabel={`فتح ${portal.title} داخل التطبيق`}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => { void openPortal(portal); }}
                style={({ pressed }) => [styles.portalCard, index === 1 && styles.portalCardSecondary, pressed && !busy && styles.pressed, busy && styles.disabled]}
              >
                <View style={[styles.portalMarker, index === 1 && styles.portalMarkerSecondary]}>
                  <Text style={styles.portalMarkerText}>{portal.marker}</Text>
                </View>
                <View style={styles.portalInfo}>
                  <Text style={styles.portalTitle}>{portal.title}</Text>
                  <Text style={styles.portalDescription}>{portal.description}</Text>
                </View>
                {openingPortal === portal.id ? <ActivityIndicator color={BLUE} /> : <Text style={styles.arrow}>‹</Text>}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.footer}>اختيارك محفوظ على جهازك، وتقدر ترجع وتبدّل المنصة في أي وقت.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F8FE' },
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#F5F8FE' },
  loadingText: { color: MUTED, fontSize: 15, textAlign: 'center' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingTop: 28, paddingBottom: 32, gap: 28 },
  hero: { alignItems: 'center', gap: 10 },
  logoFrame: { width: 100, height: 100, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', marginBottom: 5, elevation: 4, shadowColor: '#22395B', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  logo: { width: 96, height: 96, borderRadius: 26 },
  title: { color: NAVY, fontSize: 29, fontWeight: '900', textAlign: 'center' },
  tagline: { color: BLUE, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  intro: { color: MUTED, fontSize: 15, lineHeight: 24, textAlign: 'center', maxWidth: 340 },
  options: { gap: 14, width: '100%' },
  portalCard: { minHeight: 92, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2EAF6', elevation: 3, shadowColor: '#243A5B', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  portalCardSecondary: { borderColor: '#D9E8FF' },
  portalMarker: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE },
  portalMarkerSecondary: { backgroundColor: NAVY },
  portalMarkerText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  portalInfo: { flex: 1, alignItems: 'flex-end', gap: 5 },
  portalTitle: { color: NAVY, fontSize: 17, fontWeight: '800', textAlign: 'right' },
  portalDescription: { color: MUTED, fontSize: 13, textAlign: 'right' },
  arrow: { color: BLUE, fontSize: 34, lineHeight: 38, fontWeight: '500' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.62 },
  footer: { color: '#8A96A9', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
