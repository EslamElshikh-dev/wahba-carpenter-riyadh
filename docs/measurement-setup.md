# إعداد قياس وهبة النجار

هذه نسخة تجهيز. لا تعمل أدوات القياس حتى اعتماد إعداد Google الفعلي وضبط المعرفات ونشر حاوية GTM المطابقة.

## GA4

- خاصية مستقلة باسم «وهبة النجار — الرياض»، بتوقيت Asia/Riyadh وعملة SAR.
- تدفق ويب للموقع https://wahba-carpenter-riyadh.vercel.app/.
- تعطيل القياس المحسن التلقائي للضغطات الخارجية وتفاعل النماذج والبحث الداخلي والفيديو والتنزيلات. روابط واتساب قد تحتوي رسالة الطلب، لذلك لا نرسل رابطها إلى GA4.
- تفعيل حجب البريد الإلكتروني ومعاملات URL في إعدادات حجب البيانات. لا تُرسل أسماء أو هواتف أو أحياء أو مقاسات أو نصوص الطلبات.
- إبقاء Google signals وتخصيص الإعلانات معطلين. لا تُربط خاصية الموقع الشخصي بهذا النشاط.
- ضغط الهاتف والواتساب تفاعل. تجهيز رسالة الطلب ليس إرسالًا للطلب أو محادثة مكتملة أو عميلًا مؤهلًا.

## GTM

1. حاوية Web مستقلة للموقع ضمن حساب الإدارة الحالي.
2. قالب موافقة من الكود `gtm-consent-template.js`. صلاحياته قراءة `event` و`wahba_analytics_consent`، وكتابة analytics_storage وad_storage وad_user_data وad_personalization. يُشغّل في Consent Initialization - All Pages وعلى الحدث wahba_consent_update.
3. Google tag واحدة بمعرف تدفق GA4، تعمل في Initialization - All Pages. إعداداتها: allow_google_signals=false وallow_ad_personalization_signals=false. page_location وpage_referrer من متغيري Data Layer بالاسم نفسه، الإصدار 2.
4. GA4 Event tag للحدث {{Event}}. المحفز Custom Event بالتعبير ^(phone_click|whatsapp_click|quote_prepared|map_click)$ فقط. يرسل page_path وpage_location وpage_referrer وsource وservice من متغيرات Data Layer المطابقة، دون link_url أو نص النموذج.
5. فحص موافقة ورفض وسحب الموافقة في Tag Assistant قبل نشر نسخة الحاوية. التحقق من أن صفحة واحدة تنتج page_view واحدة وأن ضغطة واحدة تنتج حدثًا واحدًا.

## تركيب الموقع

بعد التحقق من المعرفات، اضبط GTM_CONTAINER_ID وGA4_MEASUREMENT_ID في بيئة Production ثم أعد البناء. المعرفان عامّان وليسا أسرار API. القيم الفارغة تُبقي القياس غير مفعّل، والقيم الناقصة أو غير الصحيحة توقف البناء.

لا تحمل معاينات النشر أو صفحات admin وapi وسوم القياس. يبدأ تحميل GTM بعد موافقة الزائر. يُحفظ اختيار الزائر محليًا لمدة 180 يومًا، ويمكن تغييره من الفوتر. عند سحب الموافقة تتوقف أحداث الموقع، ويُفعّل مفتاح تعطيل GA4 وتُمسح ملفات _ga المقروءة على نطاق الموقع.

## المراجعة النهائية

- أحداث الاختبار تظهر في DebugView بعد السماح، ثم تُستبعد من التقارير التشغيلية.
- لا يصنف quote_prepared على أنه generate_lead.
- لا يحمل رابط واتساب الذي يحتوي نص الطلب إلى منصة القياس.
- يظل نموذج واتساب وروابط الاتصال يعملان عند رفض القياس أو حجب Google.
- يجب فحص إرسال الأحداث فعليًا بعد إعداد الحساب. الاختبارات المحلية لا تثبت وصول الأحداث إلى Google.

## مصادر Google

- https://support.google.com/tagmanager/answer/13034206
- https://developers.google.com/tag-platform/security/guides/consent
- https://developers.google.com/tag-platform/tag-manager/templates/consent-apis
- https://developers.google.com/tag-platform/security/guides/privacy
- https://developers.google.com/tag-platform/security/guides/csp
