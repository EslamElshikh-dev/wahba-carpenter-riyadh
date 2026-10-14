import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { measurementConfig, measurementMarkup } from '../src/measurement.mjs';

const code=fs.readFileSync(new URL('../public/assets/analytics.js',import.meta.url),'utf8');
const template=fs.readFileSync(new URL('../docs/gtm-consent-template.js',import.meta.url),'utf8');
const origin='https://wahba-carpenter-riyadh.vercel.app';
const key='wahba_analytics_choice_v1';
const now=1800000000000;
function fixture({saved,storageBlocked=false,host=origin,path='/contact',gtmId='GTM-TEST123',measurementId='G-TEST1234'}={}){
 const store=new Map(saved===undefined?[]:[[key,typeof saved==='string'?saved:JSON.stringify(saved)]]);
 const listeners=new Map(), scripts=[], cookieWrites=[];
 const button=value=>({dataset:{measurementChoice:value},addEventListener(type,fn){this[type]=fn;},focus(){this.focused=true;}});
 const grant=button('granted'),deny=button('denied'),preferences=button('');
 const banner={hidden:true,querySelector(){return grant;}};
 const status={textContent:''};
 const loader={dataset:{gtmId,measurementId,siteOrigin:origin,services:JSON.stringify(['خزائن ودواليب','غرف ملابس'])}};
 const document={referrer:'https://www.google.com/search?q=private@example.com',head:{appendChild(script){scripts.push(script);}},createElement(){return {};},querySelector(selector){return ({'#wahba-analytics-loader':loader,'[data-measurement-banner]':banner,'[data-measurement-status]':status,'link[rel="canonical"]':{href:origin+path+'?email=private@example.com#private'}})[selector]||null;},querySelectorAll(selector){return selector==='[data-measurement-choice]'?[grant,deny]:selector==='[data-measurement-preferences]'?[preferences]:[];}};
 Object.defineProperty(document,'cookie',{get(){return '_ga=old; _ga_TEST=old; app_session=keep';},set(value){cookieWrites.push(value);}});
 const window={addEventListener(type,fn){listeners.set(type,fn);}};
 const location={origin:host,pathname:path,hostname:new URL(host).hostname,href:host+path+'?email=private@example.com#private'};
 const localStorage={getItem(k){if(storageBlocked)throw new Error('Storage denied');return store.get(k)||null;},setItem(k,v){if(storageBlocked)throw new Error('Storage denied');store.set(k,v);}};
 class Clock extends Date {static now(){return now;}}
 vm.runInNewContext(code,{window,document,location,localStorage,URL,Date:Clock,Set,Object,JSON,encodeURIComponent});
 return {window,store,listeners,scripts,cookieWrites,banner,status,grant,deny,preferences};
}

test('unconfigured builds stay disabled; incomplete or injected identifiers fail validation',()=>{
 assert.equal(measurementConfig({},origin).enabled,false);
 assert.deepEqual(measurementMarkup({enabled:false},x=>x,'v1'),{head:'',preferences:'',banner:''});
 assert.throws(()=>measurementConfig({GTM_CONTAINER_ID:'GTM-TEST123'},origin));
 assert.throws(()=>measurementConfig({GTM_CONTAINER_ID:'GTM-TEST123"><script>',GA4_MEASUREMENT_ID:'G-TEST1234'},origin));
});
test('first visit and rejection do not load GTM or queue interaction events',()=>{
 const f=fixture();
 assert.equal(f.banner.hidden,false);
 assert.equal(f.window.wahbaAnalytics.track('phone_click'),false);
 f.deny.click();
 assert.equal(f.scripts.length,0);
 assert.equal(f.window.dataLayer,undefined);
 assert.equal(f.window['ga-disable-G-TEST1234'],true);
 assert.equal(JSON.parse(f.store.get(key)).choice,'denied');
});
test('approval loads one container and sends only allowed, sanitized event fields',()=>{
 const f=fixture();f.grant.click();f.grant.click();
 assert.equal(f.scripts.length,1);
 assert.match(f.scripts[0].src,/^https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-TEST123$/);
 assert.equal(f.window['ga-disable-G-TEST1234'],false);
 assert.equal(f.window.wahbaAnalytics.track('quote_prepared',{service:'خزائن ودواليب',source:'brief_form',phone:'0555555555',district:'private',details:'secret',link_url:'https://wa.me/?text=secret',page_path:'/api/secret'}),true);
 const event=f.window.dataLayer.at(-1);
 assert.equal(event.event,'quote_prepared');
 assert.equal(event.page_path,'/contact');
 assert.equal(event.page_location,origin+'/contact');
 assert.equal(event.page_referrer,'https://www.google.com');
 assert.equal(event.service,'خزائن ودواليب');
 assert.equal(event.source,'brief_form');
 assert.equal(JSON.stringify(f.window.dataLayer).includes('private@example.com'),false);
 for(const field of ['phone','district','details','link_url'])assert.equal(field in event,false);
});
test('a restored current approval loads without a repeated prompt',()=>{
 const f=fixture({saved:{version:1,choice:'granted',savedAt:now-1000}});
 assert.equal(f.scripts.length,1);assert.equal(f.banner.hidden,true);
});
test('withdrawal disables GA4 and future interactions without deleting session cookies',()=>{
 const f=fixture();f.grant.click();f.preferences.click();assert.equal(f.banner.hidden,false);
 f.deny.click();
 assert.equal(f.window['ga-disable-G-TEST1234'],true);
 assert.equal(f.window.wahbaAnalytics.track('whatsapp_click'),false);
 assert.equal(f.window.dataLayer.at(-1).wahba_analytics_consent,'denied');
 assert(f.cookieWrites.some(value=>value.startsWith('_ga=')));
 assert(f.cookieWrites.every(value=>!value.startsWith('app_session=')));
});
test('malformed, future and expired stored choices need a new choice',()=>{
 for(const saved of ['not json',{version:1,choice:'granted',savedAt:now+1},{version:1,choice:'granted',savedAt:now-180*86400000}]){
  const f=fixture({saved});assert.equal(f.scripts.length,0);assert.equal(f.banner.hidden,false);
 }
});
test('blocked storage still supports an explicit choice for the current page',()=>{
 const f=fixture({storageBlocked:true});f.grant.click();
 assert.equal(f.scripts.length,1);assert.equal(f.window.wahbaAnalytics.track('phone_click'),true);
});
test('other tabs can withdraw consent and unsupported events are dropped',()=>{
 const f=fixture();f.grant.click();assert.equal(f.window.wahbaAnalytics.track('generate_lead'),false);
 f.store.set(key,JSON.stringify({version:1,choice:'denied',savedAt:now}));
 f.listeners.get('storage')({key});assert.equal(f.window.wahbaAnalytics.track('phone_click'),false);
});
test('preview domains and private routes never initialize the controller',()=>{
 for(const options of [{host:'https://preview.example.com'},{path:'/admin/verification'},{path:'/api/gbp'},{gtmId:'GTM-invalid'}]){
  const f=fixture(options);assert.equal(f.window.wahbaAnalytics,undefined);assert.equal(f.scripts.length,0);
 }
});
test('the GTM consent template grants analytics only and handles withdrawal with consent APIs',()=>{
 for(const [event,choice] of [['gtm.init_consent','granted'],['wahba_consent_update','denied']]){
  const calls=[];
  vm.runInNewContext(template,{require(name){if(name==='copyFromDataLayer')return key=>({event,wahba_analytics_consent:choice}[key]);return state=>calls.push({name,state});},data:{gtmOnSuccess(){calls.push({name:'success'});}}});
  const update=calls.find(x=>x.name==='updateConsentState');
  assert.equal(update.state.analytics_storage,choice);
  for(const type of ['ad_storage','ad_user_data','ad_personalization'])assert.equal(update.state[type],'denied');
  assert.equal(calls.some(x=>x.name==='setDefaultConsentState'),event==='gtm.init_consent');
 }
});
