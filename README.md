# هنذاكروا | Hanzakro

تطبيق Android عربي مبني بـ Expo وReact Native وTypeScript مع Expo Router ومسارات شاشة داخل `src/app/`. يفتح منصة تعليمية يحددها المستخدم داخل WebView، ويحفظ الرابط والهوية والإعدادات محليًا. رابط المنصة الذي زوده المستخدم مُعبأ افتراضيًا. أيقونة التطبيق الأصلية من صورته مضمنة محليًا في `assets/icon.png`، لذلك لا يحتاج التطبيق إلى تنزيلها وقت التشغيل.

## المتطلبات والتشغيل

استخدم Node.js 22 وpnpm 11. ثبّت الحزم من ملف القفل ثم شغّل خادم التطوير:

```bash
pnpm install --frozen-lockfile
pnpm start
```

يحتاج المشروع إلى Android development build بسبب وحدات التعرف على الكلام الأصلية؛ Expo Go وحده لا يثبت دعمها. بعد إعداد Android SDK محليًا:

```bash
pnpm android
```

## الفحوص

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm run check:expo
pnpm exec expo install --check
```

## بناء APK عبر EAS

المستودع مربوط بمشروع EAS عبر `extra.eas.projectId` في `app.json`. يضبط `eas.json` ملفات `development` و`preview` و`apk` لإنتاج APK داخلي، و`production` لإنتاج AAB. بعد تسجيل الدخول إلى Expo وضبط بيانات التوقيع في EAS:

```bash
pnpm eas:whoami
pnpm eas:build:apk
```

لإنشاء AAB إنتاجي:

```bash
pnpm dlx eas-cli@latest build --platform android --profile production
```

فحص EAS في بيئة التنفيذ الحالية أعاد `Not logged in`، كما لا يوجد Android SDK محلي؛ لذلك لم يُنشأ APK/AAB ولم يُختبر على هاتف. لا تضع رمز Expo أو مفتاح توقيع في Git أو المحادثة. لا يحتوي المستودع على أسرار أو مفاتيح توقيع.

## الوظائف والحدود

يدعم الإصدار الحالي إعداد رابط HTTPS، واختيار «سيف» أو «حنون»، وعرض الدعاء قبل المنصة، وحفظ التفضيلات، وشاشة إعدادات، وإشعار ترحيب محلي بعد اكتمال الإعداد وموافقة النظام، وWebView مع حالات تحميل وأخطاء وتنقل وأدوات تحكم. جسر Web Speech مقصور على أصل المنصة الموثوق. يحتاج تشغيل الصوت والتعرف عليه والفيديو وملء الشاشة إلى تجربة على development build وجهاز Android حقيقي؛ فهي تعتمد على الجهاز وخدماته والموقع.

لا يتجاوز التطبيق تسجيل الدخول أو حماية المحتوى ولا ينزّل الفيديوهات المحمية. وضع Kiosk الحقيقي وإشعارات Web Push غير مفعلين. راجع [TODO.md](TODO.md) و[مصفوفة التحقق على Android](docs/verification-matrix.md) و[الملاحظات التقنية](docs/technical-notes.md) لمعرفة ما نجح آليًا وما ينتظر تجربة الهاتف.
