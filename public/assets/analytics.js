(() => {
  'use strict';
  const loader = document.querySelector('#wahba-analytics-loader');
  if (!loader) return;
  const { gtmId, measurementId, siteOrigin } = loader.dataset;
  if (!/^GTM-[A-Z0-9]{4,20}$/.test(gtmId || '') || !/^G-[A-Z0-9]{6,20}$/.test(measurementId || '')) return;
  if (location.origin !== siteOrigin || /^\/(?:admin|api)(?:\/|$)/.test(location.pathname)) return;
  const key = 'wahba_analytics_choice_v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const banner = document.querySelector('[data-measurement-banner]');
  const status = document.querySelector('[data-measurement-status]');
  const events = new Set(['phone_click', 'whatsapp_click', 'quote_prepared', 'map_click']);
  let services;
  try { services = new Set(JSON.parse(loader.dataset.services || '[]')); } catch { services = new Set(); }
  let choice = null;
  let loaded = false;
  window['ga-disable-' + measurementId] = true;

  const page = new URL(document.querySelector('link[rel="canonical"]')?.href || location.href);
  if (page.origin !== siteOrigin) return;
  page.search = '';
  page.hash = '';
  let referrer = '';
  try {
    const source = new URL(document.referrer);
    if (source.protocol === 'https:' || source.protocol === 'http:') referrer = source.origin;
  } catch { /* An empty or malformed referrer contributes no data. */ }
  const pageDetails = () => ({ page_path: page.pathname, page_location: page.href, page_referrer: referrer });
  const push = (value) => { window.dataLayer = window.dataLayer || []; window.dataLayer.push(value); };
  const read = () => {
    try {
      const entry = JSON.parse(localStorage.getItem(key));
      if (entry?.version !== 1 || !['granted', 'denied'].includes(entry.choice)) return null;
      if (!Number.isFinite(entry.savedAt) || entry.savedAt > Date.now() || Date.now() - entry.savedAt >= lifetime) return null;
      return entry.choice;
    } catch { return null; }
  };
  const clearAnalyticsCookies = () => {
    for (const part of document.cookie.split(';')) {
      const name = part.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) continue;
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${location.hostname}; SameSite=Lax`;
    }
  };
  const apply = (value) => {
    choice = value;
    const granted = choice === 'granted';
    window['ga-disable-' + measurementId] = !granted;
    if (granted && !loaded) {
      push({ wahba_analytics_consent: 'granted', ...pageDetails() });
      push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      const script = document.createElement('script');
      script.id = 'wahba-gtm';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
      document.head.appendChild(script);
      loaded = true;
    } else if (loaded) {
      push({ event: 'wahba_consent_update', wahba_analytics_consent: granted ? 'granted' : 'denied' });
    }
    if (!granted) clearAnalyticsCookies();
    if (banner) banner.hidden = choice !== null;
  };
  const choose = (value) => {
    if (!['granted', 'denied'].includes(value)) return;
    try { localStorage.setItem(key, JSON.stringify({ version: 1, choice: value, savedAt: Date.now() })); } catch { /* The choice still applies to this page. */ }
    apply(value);
    if (status) status.textContent = value === 'granted' ? 'تم السماح بقياس الزيارات والضغطات.' : 'تم إيقاف قياس الزيارات والضغطات.';
  };
  const openPreferences = () => {
    if (!banner) return;
    banner.hidden = false;
    banner.querySelector('[data-measurement-choice]')?.focus();
  };
  window.wahbaAnalytics = Object.freeze({
    track(name, detail = {}) {
      if (choice !== 'granted' || !events.has(name)) return false;
      const parameters = {
        event: name,
        ...pageDetails(),
        source: ['brief_form', 'link'].includes(detail.source) ? detail.source : 'link',
        service: services.has(detail.service) ? detail.service : undefined
      };
      push(parameters);
      return true;
    },
    openPreferences
  });
  document.querySelectorAll('[data-measurement-choice]').forEach(button => button.addEventListener('click', () => choose(button.dataset.measurementChoice)));
  document.querySelectorAll('[data-measurement-preferences]').forEach(button => button.addEventListener('click', openPreferences));
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(read()); });
  apply(read());
})();
