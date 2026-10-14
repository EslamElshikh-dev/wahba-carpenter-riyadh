export function measurementConfig(env, siteUrl, serviceNames = []) {
  const containerId = String(env.GTM_CONTAINER_ID || '').trim();
  const measurementId = String(env.GA4_MEASUREMENT_ID || '').trim();
  if (!containerId && !measurementId) return { enabled: false };
  if (!/^GTM-[A-Z0-9]{4,20}$/.test(containerId)) throw new Error('A valid GTM_CONTAINER_ID is required');
  if (!/^G-[A-Z0-9]{6,20}$/.test(measurementId)) throw new Error('A valid GA4_MEASUREMENT_ID is required');
  const siteOrigin = new URL(siteUrl).origin;
  return { enabled: true, containerId, measurementId, siteOrigin, serviceNames };
}

export function measurementMarkup(config, escape, revision) {
  if (!config.enabled) return { head: '', preferences: '', banner: '' };
  return {
    head: `<link rel="stylesheet" href="/assets/measurement.css?v=${revision}"><script id="wahba-analytics-loader" defer src="/assets/analytics.js?v=${revision}" data-gtm-id="${escape(config.containerId)}" data-measurement-id="${escape(config.measurementId)}" data-site-origin="${escape(config.siteOrigin)}" data-services="${escape(JSON.stringify(config.serviceNames))}"></script>`,
    preferences: '<button class="measurement-preferences" type="button" data-measurement-preferences>إعدادات القياس</button>',
    banner: '<section class="measurement-choice" data-measurement-banner aria-labelledby="measurement-title" hidden><div><h2 id="measurement-title">اختيارك في قياس الزيارات</h2><p>تساعدنا بيانات الزيارات والضغطات على تحسين الموقع. القياس اختياري، ولا نرسل تفاصيل طلبك ضمنه. <a href="/privacy">سياسة الخصوصية</a></p></div><div class="measurement-actions"><button type="button" data-measurement-choice="granted">السماح بالقياس</button><button type="button" data-measurement-choice="denied">المتابعة بدون قياس</button></div></section><p class="measurement-status" data-measurement-status role="status" aria-live="polite"></p>'
  };
}
