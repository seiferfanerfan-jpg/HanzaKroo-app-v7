import { Platform } from 'react-native';
import {
  AndroidImportance,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';
import { createWelcomePoster, type WelcomeResult } from './welcomeNotificationCore';

const postWelcome = createWelcomePoster({
  platform: Platform.OS,
  ensureChannel: async () => {
    await setNotificationChannelAsync('welcome', {
      name: 'ترحيب هنذاكروا',
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180, 90, 180],
      lightColor: '#1479F8',
    });
  },
  getPermission: async () => {
    const permission = await getPermissionsAsync();
    return { granted: permission.granted, status: permission.status };
  },
  requestPermission: async () => {
    const permission = await requestPermissionsAsync();
    return { granted: permission.granted, status: permission.status };
  },
  schedule: async () => {
    await scheduleNotificationAsync({
      content: {
        title: 'هنذاكروا',
        body: 'أهلًا وسهلًا بأبطال هنذاكروا... ده سيستم كامل في خدمتكم 😉، عشان تجيبوا 91٪ فيما أعلى، متنسوش تقرؤوا الدعاء وتسمّوا الله... وربنا يوفقكم ويجوّزكم بعض 😂♥️',
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'welcome' } : {}),
      },
      trigger: null,
    });
  },
});

export async function postWelcomeOnce(): Promise<WelcomeResult> {
  return postWelcome();
}
