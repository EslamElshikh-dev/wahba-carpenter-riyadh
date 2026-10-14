// Paste into a GTM Custom Template's sandboxed code editor, not into Custom HTML.
// Triggers: Consent Initialization - All Pages, and wahba_consent_update.
// Permissions: read event and wahba_analytics_consent from the data layer;
// write the four consent types used below.
const copyFromDataLayer = require('copyFromDataLayer');
const setDefaultConsentState = require('setDefaultConsentState');
const updateConsentState = require('updateConsentState');
const denied = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
};
if (copyFromDataLayer('event') !== 'wahba_consent_update') {
  setDefaultConsentState(denied);
}
updateConsentState({
  analytics_storage: copyFromDataLayer('wahba_analytics_consent') === 'granted' ? 'granted' : 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
});
data.gtmOnSuccess();
