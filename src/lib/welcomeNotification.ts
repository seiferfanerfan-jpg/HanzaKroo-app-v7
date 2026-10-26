import { Platform } from 'react-native';
import {
  AndroidImportance,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';
import { createWelcomePoster } from './welcomeNotificationCore';

const ensureWelcomeChannel = async () => {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync('welcome', {
    name: 'ترحيب هنذاكروا',
    importance: AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180, 90, 180],
    lightColor: '#1479F8',
  });
};

export const postWelcomeOnce = createWelcomePoster({
  platform: Platform.OS,
  ensureChannel: ensureWelcomeChannel,
  getPermission: getPermissionsAsync,
  requestPermission: requestPermissionsAsync,
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
