import { Platform } from 'react-native';
import {
  AndroidImportance,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import { createWelcomePoster } from './welcomeNotificationCore';

export const WELCOME_NOTIFICATION_BODY = 'أهلا وسهلا ي حنونتي ده سيستم كامل عشان نجيب 91٪ مع بعض';

setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
        body: WELCOME_NOTIFICATION_BODY,
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'welcome' } : {}),
      },
      trigger: null,
    });
  },
});
