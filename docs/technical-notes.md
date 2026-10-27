# ملاحظات التوافق والاختبار

## التنفيذ والتوافق

أساس المشروع Expo SDK 58 وReact Native 0.88، مع Expo Router ومسارات في `src/app/` وفق دليل Router الرسمي [6] [8]. يبدأ كل تشغيل بارد بالدعاء المرتبط بالهوية المحفوظة؛ وعند غياب الهوية يطلب التطبيق اختيارها مرة واحدة ثم يعرض الدعاء. بعده تظهر شاشة الاختيار بخياري Portal وV1، ويفتح الاختيار داخل WebView. يعيد زر «الرئيسية» المستخدم إلى قائمة الاختيار؛ لا يعيد الرجوع العادي من الخلفية ضبط الشاشة [7].

يحفظ التطبيق الوجهة المختارة في `src/data/portals.ts` والتفضيلات عبر AsyncStorage. لا تعرض شاشة الاختيار أو بطاقة المنصة في الإعدادات عنوان الموقع. تغطي اختبارات Node مطابقة الخيارين مع وجهتي HTTPS والتحقق من عدم تضمين عنوان موقع صريح في شاشة الاختيار ومطابقة النص الترحيبي المطلوب.

يحتاج التطبيق إلى development build بسبب وحدات التعرف على الكلام الأصلية؛ Expo Go وحده لا يثبت دعمها. يُحصر جسر Web Speech في أصل HTTPS الذي اختاره المستخدم، ويوقف التطبيق الاستماع والنطق عند مغادرة المنصة أو انتقالها للخلفية. يعتمد دعم اللغة والصوت على خدمات النظام المتاحة فعلًا [3] [4] [5].

يؤجل التطبيق إشعار الترحيب وطلب إذنه الأول إلى ما بعد إعداد المنصة واختيار الهوية. بعد ذلك ينفذ الإشعار محليًا مع قناة Android؛ لا يستخدم التطبيق Web Push أو إرسالًا بعيدًا [2]. تصريح Android 13+ `POST_NOTIFICATIONS` موجود في Manifest حزمة `expo-notifications` ويُدمج من Gradle عند البناء، بينما يظهر إذن `RECORD_AUDIO` في Manifest المولد. يحجب إعداد Expo `READ_EXTERNAL_STORAGE` و`WRITE_EXTERNAL_STORAGE` و`SYSTEM_ALERT_WINDOW` لأنها غير مستخدمة، باستخدام `android.blockedPermissions` [1]. احتُفظ بمجلد `android/` كناتج توليد محلي مستبعد من Git؛ لم يُنفذ دمج Manifest النهائي داخل APK بعد.

يدعم WebView الفيديو inline وfullscreen على مستوى الإعداد؛ النتيجة الفعلية تعتمد على Android System WebView والموقع والتضمينات وتسجيل الدخول وسياسة autoplay. لا يتجاوز التطبيق حماية المحتوى أو يضيف تنزيل فيديو عامًا. لا يُنفذ وضع Android Lock Task/Kiosk ولا إشعارات Web Push.

## نتائج التحقق المنفذة

- `pnpm test` — نجحت الاختبارات التسعة عشر (19/19)، بما فيها مسار الدعاء عند البدء ووجهتا Portal وV1 ونص شاشة الاختيار وزر الانتقال إليها بعد الدعاء.
- `pnpm typecheck` — نجح بعد آخر التغييرات.
- `pnpm lint` — نجح دون أخطاء أو تحذيرات.
- `pnpm run check:expo` — نجح 20/20، و`pnpm exec expo install --check` أكد توافق التبعيات مع SDK 58.
- `pnpm install --frozen-lockfile` — نجح سابقًا؛ لم تتغير التبعيات أو ملف القفل لهذا التعديل.
- `CI=1 pnpm exec expo prebuild --platform android --no-install` — نجح سابقًا؛ لم تتغير الإعدادات الأصلية في هذا التعديل.
- `pnpm exec expo export --platform android --output-dir /tmp/hanzakro-android-export` — نجح في هذا التعديل؛ يجمع Metro لـAndroid (1249 وحدة؛ Hermes bundle نحو 2.7 MB). حجم `assets/icon.png` المضغوط 282,685 بايت. لم يُنشأ APK/AAB.
- مراجعة Manifests الخاصة بالحزم أكدت أن `expo-notifications` يعلن `POST_NOTIFICATIONS`؛ كما يظهر `RECORD_AUDIO` في Manifest التطبيق. لم يُختبر Manifest النهائي المدمج لأن Gradle/APK لم يُبنَ.
- لا تمثل اختبارات Node تجربة WebView أو Android فعلي.
- فحص ملفات المشروع لم يُظهر مفاتيح أو كلمات مرور. تستبعد قواعد Git الملفات المحلية الحساسة ومخرجات البناء.

## APK واختبارات الهاتف

فحص EAS CLI أعاد `Not logged in`. لا يوجد Android SDK أو `adb` أو `sdkmanager` في بيئة التنفيذ، ولا متغير `EXPO_TOKEN`. لذلك لم يُنتج APK/AAB ولم يُختبر التطبيق على هاتف Android. ملف `eas.json` يهيئ `apk` لإنتاج APK داخلي و`production` لإنتاج AAB؛ يتطلب تشغيلهما تسجيل الدخول إلى Expo وإعداد التوقيع عبر EAS. لا تضع رمزًا أو مفتاح توقيع في Git أو المحادثة.

تسجل [`docs/verification-matrix.md`](verification-matrix.md) خطوات التحقق الميداني المطلوبة: فتح البوابتين، دورة التشغيل والعودة من الخلفية، إذن إشعارات Android 13+، أصوات وخدمة التعرف المتاحة، رفض الميكروفون، فيديو HTML5 والمضمن، ملء الشاشة والرجوع والتدوير، وانقطاع الاتصال وإمكانية الوصول. لم توصف أي من هذه التجارب بأنها ناجحة على جهاز.

## References

[1]: https://docs.expo.dev/versions/v58.0.0/config/app/ "Expo app config and blockedPermissions"
[2]: https://docs.expo.dev/versions/v58.0.0/sdk/notifications/ "Expo Notifications SDK 58"
[3]: https://docs.expo.dev/versions/v58.0.0/sdk/speech/ "Expo Speech SDK 58"
[4]: https://github.com/jamsch/expo-speech-recognition "expo-speech-recognition documentation"
[5]: https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md "React Native WebView reference"
[6]: https://docs.expo.dev/versions/v58.0.0/router/installation/ "Expo Router installation for SDK 58"
[7]: https://reactnative.dev/docs/appstate.md "React Native AppState"
[8]: https://docs.expo.dev/versions/v58.0.0/router/basics/navigation/ "Expo Router navigation SDK 58"
