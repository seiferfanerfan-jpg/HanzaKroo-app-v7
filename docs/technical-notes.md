# ملاحظات التوافق والاختبار

## التنفيذ والتوافق

أساس المشروع Expo SDK 58 وReact Native 0.88، مع Expo Router ومسارات في `src/app/` وفق دليل Router الرسمي [6]. يحفظ التطبيق التفضيلات عبر AsyncStorage. العودة العادية من الخلفية لا تعيد تشغيل الدعاء؛ إعادة إنشاء العملية تبدأ تشغيلًا باردًا [7].

يحتاج التطبيق إلى development build بسبب وحدات التعرف على الكلام الأصلية؛ Expo Go وحده لا يثبت دعمها. يُحصر جسر Web Speech في أصل HTTPS الذي أدخله المستخدم، ويوقف التطبيق الاستماع والنطق عند مغادرة المنصة أو انتقالها للخلفية. يعتمد دعم اللغة والصوت على خدمات النظام المتاحة فعلًا [3] [4] [5].

يؤجل التطبيق إشعار الترحيب وطلب إذنه الأول إلى ما بعد إعداد الرابط واختيار الهوية. بعد ذلك ينفذ الإشعار محليًا مع قناة Android؛ لا يستخدم التطبيق Web Push أو إرسالًا بعيدًا [2]. تصريح Android 13+ `POST_NOTIFICATIONS` موجود في Manifest حزمة `expo-notifications` ويُدمج من Gradle عند البناء، بينما يظهر إذن `RECORD_AUDIO` في Manifest المولد. يحجب إعداد Expo `READ_EXTERNAL_STORAGE` و`WRITE_EXTERNAL_STORAGE` و`SYSTEM_ALERT_WINDOW` لأنها غير مستخدمة، باستخدام `android.blockedPermissions` [1]. احتُفظ بمجلد `android/` كناتج توليد محلي مستبعد من Git؛ لم يُنفذ دمج Manifest النهائي داخل APK بعد.

يدعم WebView الفيديو inline وfullscreen على مستوى الإعداد؛ النتيجة الفعلية تعتمد على Android System WebView والموقع والتضمينات وتسجيل الدخول وسياسة autoplay. لا يتجاوز التطبيق حماية المحتوى أو يضيف تنزيل فيديو عامًا. لا يُنفذ وضع Android Lock Task/Kiosk ولا إشعارات Web Push.

## نتائج التحقق المنفذة

- `pnpm test` — نجحت الاختبارات السبعة عشر (17/17)، دون فشل أو تخطٍ.
- `pnpm typecheck` — نجح بعد آخر إصلاحات المنطق.
- `pnpm lint` — نجح دون أخطاء أو تحذيرات.
- `pnpm run check:expo` — نجح 20/20، و`pnpm exec expo install --check` أكد توافق التبعيات مع SDK 58.
- `pnpm install --frozen-lockfile` — نجح؛ ملف القفل قابل لإعادة التثبيت كما هو.
- `CI=1 pnpm exec expo prebuild --platform android --no-install` — نجح؛ أضيفت توجيهات إزالة الأذونات غير المطلوبة.
- `pnpm exec expo export --platform android --output-dir dist` — نجح تجميع Router لـAndroid (1247 وحدة؛ Hermes bundle نحو 2.7 MB). حجم `assets/icon.png` المضغوط 282,685 بايت. مجلد `dist/` مستبعد من Git.
- مراجعة Manifests الخاصة بالحزم أكدت أن `expo-notifications` يعلن `POST_NOTIFICATIONS`؛ كما يظهر `RECORD_AUDIO` في Manifest التطبيق. لم يُختبر Manifest النهائي المدمج لأن Gradle/APK لم يُبنَ.
- تغطي اختبارات Node التوجيه والروابط والتفضيلات وتسلسل الحفظ وفشله وتبديل الهوية والدعاء الحرفي وتوقيت الإشعار ومنع تكراره والجسر الصوتي. لا تمثل هذه الاختبارات تجربة WebView أو Android فعلي.
- فحص ملفات المشروع لم يُظهر مفاتيح أو كلمات مرور. تستبعد قواعد Git الملفات المحلية الحساسة ومخرجات البناء.

## APK واختبارات الهاتف

فحص EAS CLI أعاد `Not logged in`. لا يوجد Android SDK أو `adb` أو `sdkmanager` في بيئة التنفيذ، ولا متغير `EXPO_TOKEN`. لذلك لم يُنتج APK/AAB ولم يُختبر التطبيق على هاتف Android. ملف `eas.json` يهيئ `preview` لإنتاج APK داخلي و`production` لإنتاج AAB؛ يتطلب تشغيلهما تسجيل الدخول إلى Expo وإعداد التوقيع عبر EAS. لا تضع رمزًا أو مفتاح توقيع في Git أو المحادثة.

تسجل [`docs/verification-matrix.md`](verification-matrix.md) خطوات التحقق الميداني المطلوبة: دورة التشغيل البارد مقابل العودة من الخلفية، إذن إشعارات Android 13+، أصوات وخدمة التعرف المتاحة، رفض الميكروفون، فيديو HTML5 والمضمن، ملء الشاشة والرجوع والتدوير، وانقطاع الاتصال وإمكانية الوصول. لم توصف أي من هذه التجارب بأنها ناجحة على جهاز.

## References

[1]: https://docs.expo.dev/versions/v58.0.0/config/app/ "Expo app config and blockedPermissions"
[2]: https://docs.expo.dev/versions/v58.0.0/sdk/notifications/ "Expo Notifications SDK 58"
[3]: https://docs.expo.dev/versions/v58.0.0/sdk/speech/ "Expo Speech SDK 58"
[4]: https://github.com/jamsch/expo-speech-recognition "expo-speech-recognition documentation"
[5]: https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md "React Native WebView reference"
[6]: https://docs.expo.dev/versions/v58.0.0/router/installation/ "Expo Router installation for SDK 58"
[7]: https://reactnative.dev/docs/appstate.md "React Native AppState"
