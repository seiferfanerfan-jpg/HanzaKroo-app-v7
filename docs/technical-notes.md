# ملاحظات التوافق والاختبار

## مراجع التنفيذ

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) هو أساس القالب وإصدارات وحدات Expo المثبتة.
- [Expo Notifications](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/) مرجع القناة المحلية وطلب الإذن والإشعار الذي يعرضه Android. التطبيق لا يدعي دعم Web Push أو الإشعارات البعيدة.
- [Expo Speech](https://docs.expo.dev/versions/v58.0.0/sdk/speech/) مرجع تحويل النص إلى كلام والأصوات المتاحة. لا توفر Expo Speech إيقافًا مؤقتًا/استئنافًا للنطق على Android، لذلك يوضح التطبيق هذا القيد.
- [expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition) مرجع إعداد config plugin والصلاحيات المطلوبة. هذا امتداد أصلي؛ يحتاج development build ولا يعمل بمجرد فتح المشروع في Expo Go.
- [React Native WebView](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md) مرجع تشغيل JavaScript وHTML5 inline والفيديو وملء الشاشة. تعتمد تجربة الوسائط على إصدار Android ومحرك WebView وسياسات الموقع نفسه.

## نتائج التحقق في بيئة التطوير

- `pnpm lint` — ناجح عبر إعداد Expo flat ESLint.
- `pnpm typecheck` — ناجح، بما يشمل مسارات Expo Router المولدة.
- `pnpm run check:expo` — ناجح، 20/20.
- `pnpm exec expo install --check` — جميع الحزم متوافقة مع SDK 58.
- `pnpm exec expo export --platform android --output-dir dist` — نجح تجميع Expo Router، وشملت الحزمة Android bundle بحجم يقارب 2.7 ميغابايت؛ حجم الأيقونة 282,685 بايت.
- `pnpm exec expo prebuild --platform android --no-install` — نجح توليد إعداد Android الأصلي من config plugins بما فيها Expo Router.
- أُجري فحص نصي للتأكد من عدم تضمين مفاتيح API أو أسرار في ملفات المشروع.

## ما لم يُختبر

لم يُبنَ APK/AAB ولم يُشغّل التطبيق على جهاز Android حقيقي: لا يتوفر Android SDK في بيئة التطوير، كما يتطلب بناء EAS تسجيل الدخول وإعداد التوقيع. لذلك تبقى معاينة الإشعار والصوت والميكروفون والفيديو وملء الشاشة على الجهاز اختبارًا مطلوبًا، ولا توصف بأنها مؤكدة.

- [Expo Router SDK 58: manual installation](https://docs.expo.dev/versions/v58.0.0/router/installation/) يحدد `expo-router/entry` كنقطة تشغيل و`src/app/_layout.tsx` كتخطيط الجذر.
- [Expo Router navigation](https://docs.expo.dev/router/basics/navigation/) و[layouts](https://docs.expo.dev/router/basics/navigation-layouts/) يشرحان ملفات المسارات و`router.push`/`router.replace` ومكدس الشاشات الذي يستخدمه المشروع للتنقل بين الإعداد والهوية والدعاء والمنصة والإعدادات.
