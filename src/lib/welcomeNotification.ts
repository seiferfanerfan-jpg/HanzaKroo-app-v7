import { Platform } from 'react-native';
import {
  AndroidImportance,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';

let postedThisRun = false;

export async function postWelcomeOnce(): Promise<'posted' | 'denied' | 'unsupported' | 'already-posted'> {
  if (postedThisRun) return 'already-posted';
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'unsupported';

  try {
    if (Platform.OS === 'android') {
      await setNotificationChannelAsync('welcome', {
        name: 'ترحيب هنذاكروا',
        importance: AndroidImportance.DEFAULT,
        vibrationPattern: [0, 180, 90, 180],
        lightColor: '#1479F8',
      });
    }
    let permission = await getPermissionsAsync();
    if (!permission.granted && permission.status === 'undetermined') {
      permission = await requestPermissionsAsync();
    }
    if (!permission.granted) return 'denied';

    await scheduleNotificationAsync({
      content: {
        title: 'هنذاكروا',
        body: 'أهلًا وسهلًا بأبطال هنذاكروا... ده سيستم كامل في خدمتكم 😉، عشان تجيبوا 91٪ فيما أعلى، متنسوش تقرؤوا الدعاء وتسمّوا الله... وربنا يوفقكم ويجوّزكم بعض 😂♥️',
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'welcome' } : {}),
      },
      trigger: null,
    });
    postedThisRun = true;
    return 'posted';
  } catch {
    return 'denied';
  }
}
