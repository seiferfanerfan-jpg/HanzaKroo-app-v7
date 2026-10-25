# هنذاكروا | Hanzakro

تطبيق Android عربي مبني بـ Expo وReact Native وTypeScript مع Expo Router ومسارات شاشة داخل `src/app/`. يفتح منصة تعليمية يحددها المستخدم داخل WebView، ويحفظ الرابط والهوية والإعدادات محليًا. أيقونة التطبيق الأصلية من صورة المستخدم مضمنة محليًا في `assets/icon.png`، لذلك لا يحتاج التطبيق إلى تنزيل الأيقونة من الإنترنت.

## المتطلبات والتشغيل

استخدم Node.js 22 أو إصدارًا متوافقًا مع Expo SDK الموجود في `package.json`، ومدير الحزم pnpm 11. ثبّت الحزم ثم شغّل خادم التطوير:

```bash
pnpm install
pnpm start
```

يستخدم هذا المشروع `expo-speech-recognition` ووحدات أصلية أخرى. لذلك يلزم Android development build، ولا يكفي فتح المشروع في Expo Go. بعد إعداد Android SDK على جهاز التطوير:

```bash
pnpm android
pnpm lint
pnpm typecheck
pnpm run check:expo
pnpm test:core
```

يحتوي `eas.json` على ملفي بناء Android: ملف `preview` ينتج APK للتجربة، وملف `production` ينتج AAB. بعد تسجيل الدخول إلى حساب Expo وضبط بيانات التوقيع، نفّذ `pnpm dlx eas-cli@latest build -p android --profile preview` أو `pnpm dlx eas-cli@latest build -p android --profile production`. لا يحتوي المستودع على مفاتيح توقيع أو أسرار. لم يُنفذ البناء النهائي أو التوقيع تلقائيًا.

## إعداد EAS وإنشاء APK

يحتوي profile باسم `apk` على `distribution: internal` و`android.buildType: apk`. بعد تسجيل الدخول إلى Expo من جهازك، نفّذ مرة واحدة من جذر المشروع:

```bash
pnpm dlx eas-cli@latest login
pnpm run eas:configure
pnpm run eas:build:apk
```

سيضيف أمر التهيئة `projectId` الخاص بحساب Expo إلى إعدادات التطبيق، وقد يطلب من EAS إنشاء Android keystore. لا تُدخل أسرار التوقيع إلى Git.

يوجد أيضًا سير عمل يدوي في `.github/workflows/build-apk.yml`. لإطلاقه من GitHub، أضف Personal Access Token من Expo باسم السر `EXPO_TOKEN` إلى إعدادات المستودع، ثم شغّل **Actions → Build Android APK → Run workflow** واختر profile `apk`. يتطلب التشغيل الأول تهيئة `projectId` وبيانات التوقيع من حساب Expo؛ لا يبدأ سير العمل بدون `EXPO_TOKEN`.

## الخصائص والحالة

يدعم الإصدار الحالي إعداد رابط HTTPS واختياره، واختيار الهوية، وعرض الدعاء قبل المنصة، وحفظ التفضيلات، وشاشة إعدادات، وإشعار ترحيب محلي بعد طلب الإذن، وWebView مع تحميل وأخطاء وتنقل رجوع وأدوات تحكم. أضيف جسر Web Speech محدود للمضيف الذي حفظه المستخدم لتحويل النص إلى كلام والتعرف على الكلام، على أن تختبر الوظائف على development build وجهاز Android حقيقي.

يتضمن `pnpm test:core` اختبارات منطقية مستقلة عن الجهاز للرابط الآمن، ومسارات التشغيل، وتطبيع التفضيلات والحفظ المتسلسل، وإشعار الترحيب، وعزل جسر Web Speech عن المصادر غير الموثوقة. لا تستبدل هذه الاختبارات تجربة Android الفعلية.

الفيديو وملء الشاشة يعتمدان على دعم WebView والجهاز والموقع نفسه. لا يتيح التطبيق تجاوز تسجيل الدخول أو حماية المحتوى ولا ينزّل الفيديوهات المحمية. وضع Kiosk الحقيقي وإشعارات Web Push غير مفعلين؛ يتطلبان تهيئة جهاز/خادم وأذونات إضافية. لا تُعتبر الوظيفة التي لم تُختبر على جهاز فعلي متحققة.

راجع `TODO.md` لحالة التنفيذ والمتطلبات المتبقية، و`plan.md` لقرارات البنية والتصميم، و[`docs/technical-notes.md`](docs/technical-notes.md) لمراجع المكتبات ونتائج التحقق وحدود الاختبار.
