import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createDecipheriv,generateKeyPairSync,sign} from 'node:crypto';
import {createHandler} from '../src/gbp-api.mjs';
import {DAILY_METRICS,performanceRange} from '../src/gbp-performance.mjs';

// Explicitly synthetic security fixtures. No Google accounts or live credentials.
const origin='https://wahba-carpenter-riyadh.vercel.app';
const scope='https://www.googleapis.com/auth/business.manage';
const instant=Date.parse('2026-10-12T04:30:00Z');
const env={GBP_GOOGLE_CLIENT_ID:'synthetic-client.apps.googleusercontent.com',GBP_GOOGLE_CLIENT_SECRET:'synthetic-client-secret',GBP_SESSION_SECRET:'synthetic-session-secret-for-unit-testing-only-123456',GBP_ADMIN_EMAILS:'admin@example.test',GBP_OAUTH_ENABLED:'true',GBP_APP_ORIGIN:origin};
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...pair.publicKey.export({format:'jwk'}),kid:'synthetic-key',alg:'RS256',use:'sig'};
const jarFrom=res=>res.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>x.split('=')[1]).join('; ');
function flowFrom(jar){
  const value=jar.split('; ').find(x=>x.startsWith('__Host-wahba_gbp_flow=')).split('=')[1];
  const [iv,data,tag]=value.split('.').map(x=>Buffer.from(x,'base64url'));
  const c=createDecipheriv('aes-256-gcm',createHash('sha256').update(env.GBP_SESSION_SECRET).digest(),iv);c.setAAD(Buffer.from(`${origin}:flow`));c.setAuthTag(tag);return JSON.parse(Buffer.concat([c.update(data),c.final()]));
}
function jwt(nonce,overrides={}){
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'synthetic-key'})).toString('base64url');
  const claims=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:env.GBP_GOOGLE_CLIENT_ID,iat:instant/1000,exp:instant/1000+3600,nonce,email:'admin@example.test',email_verified:true,sub:'synthetic-subject',...overrides})).toString('base64url');
  return `${header}.${claims}.${sign('RSA-SHA256',Buffer.from(`${header}.${claims}`),pair.privateKey).toString('base64url')}`;
}
function mockProvider(nonce,overrides={},failVoice=false,corruptSignature=false,behavior={}){
  const calls=[];
  const fetcher=async(url,init={})=>{
    calls.push({url,method:init.method||'GET',body:init.body?.toString()});
    if(url==='https://oauth2.googleapis.com/token'){
      let signed=jwt(nonce,overrides);if(corruptSignature){const p=signed.split('.');p[2]=(p[2][0]==='a'?'b':'a')+p[2].slice(1);signed=p.join('.');}
      return Response.json({access_token:'SYNTHETIC_ACCESS_TOKEN',token_type:'Bearer',expires_in:3600,scope,id_token:signed});
    }
    if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]});
    if(new URL(url).hostname==='businessprofileperformance.googleapis.com'){
      if(behavior.performanceError)return Response.json({error:{message:'Never echo SYNTHETIC_ACCESS_TOKEN',details:[{reason:'SERVICE_DISABLED'}]}},{status:behavior.performanceError});
      if(url.includes(':fetchMultiDailyMetricsTimeSeries'))return Response.json(behavior.dailyResponse??dailyFixture());
      return Response.json(behavior.keywordResponse??{searchKeywordsCounts:[{searchKeyword:'synthetic exact zero',insightsValue:{value:'0'}},{searchKeyword:'synthetic bound',insightsValue:{threshold:'15'}}],nextPageToken:'synthetic-next'});
    }
    if(url.includes('/accounts')&&!url.includes('/locations'))return Response.json({accounts:[{name:'accounts/test-account',accountName:'Synthetic test account'}]});
    if(url.startsWith('https://mybusinessbusinessinformation.googleapis.com/v1/locations/'))return Response.json({name:'locations/test-location',serviceArea:{businessType:behavior.businessType??'CUSTOMER_LOCATION_ONLY',regionCode:behavior.regionCode??'SA'}});
    if(url.startsWith('https://mybusinessbusinessinformation.googleapis.com/v1/accounts/'))return Response.json({locations:[{name:'locations/test-location',title:'Synthetic service business',serviceArea:{businessType:'CUSTOMER_LOCATION_ONLY',regionCode:'SA'}}]});
    if(url.endsWith('/VoiceOfMerchantState'))return failVoice?Response.json({error:{message:'Never echo SYNTHETIC_ACCESS_TOKEN',details:[{reason:'SERVICE_DISABLED'}]}},{status:403}):Response.json({hasBusinessAuthority:true,hasVoiceOfMerchant:false,waitForVoiceOfMerchant:{}});
    if(url.endsWith('/verifications'))return Response.json({verifications:[{name:'locations/test-location/verifications/test-attempt',method:'SMS',state:'COMPLETED',createTime:'2026-10-11T04:00:00Z'}]});
    if(url.endsWith(':fetchVerificationOptions')){
      const payload=JSON.parse(init.body);
      if(behavior.failEnglish&&payload.languageCode==='en')return Response.json({error:{message:'Never echo private request data',details:[{reason:'SERVICE_DISABLED'}]}},{status:403});
      return Response.json({options:[{verificationMethod:payload.languageCode==='en'?'EMAIL':'SMS',...(payload.languageCode==='en'?{emailData:{user:'synthetic',domain:'example.test'}}:{phoneNumber:'synthetic-mask'})}]});
    }
    throw new Error('Unexpected synthetic provider route');
  };
  return {fetcher,calls};
}
async function signedSession(overrides={},failVoice=false,corruptSignature=false,behavior={}){
  let provider;const handler=createHandler(env,(...a)=>provider.fetcher(...a),()=>instant);
  const login=await handler(new Request(`${origin}/api/gbp?action=login`));const jar=jarFrom(login),flow=flowFrom(jar);provider=mockProvider(flow.nonce,overrides,failVoice,corruptSignature,behavior);
  const callback=await handler(new Request(`${origin}/api/gbp?action=callback&state=${flow.state}&code=synthetic-code`,{headers:{cookie:jar}}));
  return {handler,provider,login,callback,jar:jarFrom(callback)};
}

test('unconfigured endpoint fails closed and sends no provider request',async()=>{
  let calls=0;const handler=createHandler({},async()=>{calls++;throw 0;});
  const session=await handler(new Request(`${origin}/api/gbp`));assert.equal(session.status,200);const data=await session.json();assert.equal(data.configured,false);assert.equal(data.connected,false);assert.equal(data.csrf,null);
  const privateData=await handler(new Request(`${origin}/api/gbp?action=accounts`));assert.equal(privateData.status,503);assert.equal(calls,0);
});
test('anonymous requests cannot read business accounts or locations',async()=>{
  let calls=0;const handler=createHandler(env,async()=>{calls++;throw 0;},()=>instant);
  for(const action of ['accounts','locations','status','options','performance','keywords']){const r=await handler(new Request(`${origin}/api/gbp?action=${action}`));assert.equal(r.status,401);assert.equal((await r.json()).error,'SIGN_IN_REQUIRED');}
  assert.equal(calls,0);
});
test('login binds OAuth to an encrypted browser cookie and PKCE',async()=>{
  const handler=createHandler(env,()=>{throw 0;},()=>instant);const r=await handler(new Request(`${origin}/api/gbp?action=login`));assert.equal(r.status,302);
  const u=new URL(r.headers.get('location'));assert.equal(u.origin,'https://accounts.google.com');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('access_type'),'online');assert(u.searchParams.get('scope').includes(scope));assert(!u.href.includes(env.GBP_GOOGLE_CLIENT_SECRET));
  const jar=jarFrom(r),flow=flowFrom(jar);assert.equal(u.searchParams.get('state'),flow.state);assert.equal(u.searchParams.get('code_challenge'),createHash('sha256').update(flow.verifier).digest('base64url'));
  assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);assert(!jar.includes(flow.state));
});
test('cross-site login and missing/tampered state are rejected before exchange',async()=>{
  let calls=0;const handler=createHandler(env,async()=>{calls++;throw 0;},()=>instant);
  assert.equal((await handler(new Request(`${origin}/api/gbp?action=login`,{headers:{'sec-fetch-site':'cross-site'}}))).status,403);
  assert.equal((await handler(new Request(`${origin}/api/gbp?action=callback&state=bad&code=synthetic-code`))).status,403);assert.equal(calls,0);
});
test('a correctly signed allowed administrator receives a private session',async()=>{
  const x=await signedSession();assert.equal(x.callback.status,303);assert.equal(x.callback.headers.get('location'),'/admin/verification');assert(!x.jar.includes('SYNTHETIC_ACCESS_TOKEN'));
  const s=await x.handler(new Request(`${origin}/api/gbp?action=session`,{headers:{cookie:x.jar}}));const data=await s.json();assert.equal(data.connected,true);assert.equal(data.email,'admin@example.test');assert(data.csrf);assert(!JSON.stringify(data).includes('SYNTHETIC_ACCESS_TOKEN'));
  assert.equal(s.headers.get('cache-control'),'private, no-store');assert.equal(s.headers.get('vercel-cdn-cache-control'),'no-store');
});
test('signed JWTs with wrong audience, issuer, nonce, expiry or unverified email fail',async()=>{
  for(const claims of [{aud:'wrong-client'},{iss:'https://wrong.example'},{nonce:'wrong-nonce'},{exp:instant/1000-1},{email_verified:false},{email:'stranger@example.test'}]){
    const x=await signedSession(claims);assert.equal(x.callback.status,403);assert(!x.jar);const body=await x.callback.text();assert(!body.includes('SYNTHETIC_ACCESS_TOKEN'));
  }
});
test('cookies cannot be replayed on another origin or accepted after tampering',async()=>{
  const x=await signedSession();const r=await x.handler(new Request(`https://wrong.example/api/gbp?action=accounts`,{headers:{cookie:x.jar}}));assert.equal(r.status,403);
  const key=x.jar.indexOf('=')+1;const jar=x.jar.slice(0,key)+(x.jar[key]==='a'?'b':'a')+x.jar.slice(key+1);const denied=await x.handler(new Request(`${origin}/api/gbp?action=accounts`,{headers:{cookie:jar}}));assert.equal(denied.status,401);
});
test('forged identity signatures and expired authenticated sessions are rejected',async()=>{
  const forged=await signedSession({},false,true);assert.equal(forged.callback.status,403);assert.equal((await forged.callback.json()).error,'IDENTITY_REJECTED');
  const valid=await signedSession();let calls=0;const expired=createHandler(env,async()=>{calls++;throw 0;},()=>instant+3600001);
  const r=await expired(new Request(`${origin}/api/gbp?action=accounts`,{headers:{cookie:valid.jar}}));assert.equal(r.status,401);assert.equal(calls,0);
});
test('state and completed verification history remain distinct; partial errors survive',async()=>{
  for(const failVoice of [false,true]){
    const x=await signedSession({},failVoice);const r=await x.handler(new Request(`${origin}/api/gbp?action=status&location=locations/test-location`,{headers:{cookie:x.jar}}));assert.equal(r.status,200);const data=await r.json();assert.equal(data.history.data.verifications[0].state,'COMPLETED');
    if(failVoice){assert.equal(data.voice.providerStatus,403);assert.equal(data.voice.reason,'SERVICE_DISABLED');assert(!JSON.stringify(data).includes('SYNTHETIC_ACCESS_TOKEN'));}else{assert.equal(data.voice.data.hasVoiceOfMerchant,false);assert(data.voice.data.waitForVoiceOfMerchant);}
  }
});
test('option retrieval requires same-origin CSRF and calls only the fetch-options endpoint',async()=>{
  const x=await signedSession();const session=await(await x.handler(new Request(`${origin}/api/gbp?action=session`,{headers:{cookie:x.jar}}))).json();const url=`${origin}/api/gbp?action=options&location=locations/test-location`;
  const before=x.provider.calls.length;for(const headers of [{cookie:x.jar},{cookie:x.jar,origin:'https://wrong.example','x-gbp-csrf':session.csrf}])assert.equal((await x.handler(new Request(url,{method:'POST',headers}))).status,403);
  assert.equal(x.provider.calls.length,before);
  const r=await x.handler(new Request(url,{method:'POST',headers:{cookie:x.jar,origin,'x-gbp-csrf':session.csrf}}));assert.equal(r.status,200);const last=x.provider.calls.at(-1);assert.equal(last.method,'POST');assert(last.url.endsWith(':fetchVerificationOptions'));assert.deepEqual(JSON.parse(last.body),{languageCode:'ar'});
});
test('path injection and unsupported verification mutations are never forwarded',async()=>{
  const x=await signedSession();const before=x.provider.calls.length;
  const bad=await x.handler(new Request(`${origin}/api/gbp?action=status&location=locations%2Ftest-location%2F..%2Fother`,{headers:{cookie:x.jar}}));assert.equal(bad.status,400);
  for(const action of ['verify','complete','delete','transfer'])assert.equal((await x.handler(new Request(`${origin}/api/gbp?action=${action}`,{method:'POST',headers:{cookie:x.jar}}))).status,405);
  assert.equal(x.provider.calls.length,before);
});
test('logout requires CSRF and clears the local session without a Google mutation',async()=>{
  const x=await signedSession();const session=await(await x.handler(new Request(`${origin}/api/gbp?action=session`,{headers:{cookie:x.jar}}))).json();const before=x.provider.calls.length;
  const r=await x.handler(new Request(`${origin}/api/gbp?action=logout`,{method:'POST',headers:{cookie:x.jar,origin,'x-gbp-csrf':session.csrf}}));assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal(x.provider.calls.length,before);
});

const syntheticAddress={regionCode:'SA',administrativeArea:'Synthetic region',locality:'Synthetic city',postalCode:'12345',addressLines:['SYNTHETIC_VERIFICATION_ADDRESS']};
async function optionRequest(x,payload,extraHeaders={}) {
  const s=await(await x.handler(new Request(`${origin}/api/gbp?action=session`,{headers:{cookie:x.jar}}))).json();
  return x.handler(new Request(`${origin}/api/gbp?action=options&location=locations/test-location`,{method:'POST',headers:{cookie:x.jar,origin,'x-gbp-csrf':s.csrf,'content-type':'application/json',...extraHeaders},body:typeof payload==='string'?payload:JSON.stringify(payload)}));
}
test('language comparison preserves separate provider results and does not initiate verification',async()=>{
  const x=await signedSession();const before=x.provider.calls.length;
  const r=await optionRequest(x,{languages:['ar','en']});assert.equal(r.status,200);const data=await r.json();
  assert.equal(data.contextUsed,false);assert.equal(data.results.length,2);assert.equal(data.results[0].options[0].verificationMethod,'SMS');assert.equal(data.results[1].options[0].verificationMethod,'EMAIL');
  assert(x.provider.calls.slice(before).every(call=>call.url.endsWith(':fetchVerificationOptions')));
  assert.deepEqual(x.provider.calls.slice(before).map(call=>JSON.parse(call.body)),[{languageCode:'ar'},{languageCode:'en'}]);
});
test('one failed language does not hide the successful language or provider error category',async()=>{
  const x=await signedSession({},false,false,{failEnglish:true});const r=await optionRequest(x,{languages:['ar','en']});assert.equal(r.status,200);const d=await r.json();
  assert.equal(d.results[0].options.length,1);assert.equal(d.results[1].providerStatus,403);assert.equal(d.results[1].reason,'SERVICE_DISABLED');
  assert(!JSON.stringify(d).includes('SYNTHETIC_ACCESS_TOKEN'));
});
test('private address requires explicit confirmation and reaches only eligible Saudi service businesses',async()=>{
  const x=await signedSession();const before=x.provider.calls.length;
  const denied=await optionRequest(x,{languages:['ar'],verificationAddress:syntheticAddress});assert.equal(denied.status,400);assert.equal((await denied.json()).error,'ADDRESS_CONFIRMATION_REQUIRED');assert.equal(x.provider.calls.length,before);
  const r=await optionRequest(x,{languages:['ar','en'],verificationAddress:syntheticAddress,addressConfirmed:true});assert.equal(r.status,200);const text=await r.text();assert(!text.includes('SYNTHETIC_VERIFICATION_ADDRESS'));
  const calls=x.provider.calls.slice(before);assert.equal(calls[0].method,'GET');assert(calls[0].url.endsWith('?readMask=serviceArea'));
  assert(calls.every(call=>!call.url.includes('SYNTHETIC_VERIFICATION_ADDRESS')));
  for(const call of calls.slice(1)){assert(call.url.endsWith(':fetchVerificationOptions'));assert.deepEqual(JSON.parse(call.body).context,{address:syntheticAddress});}
  assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('ineligible, unknown and foreign business types do not receive any verification address',async()=>{
  for(const behavior of [{businessType:'CUSTOMER_AND_BUSINESS_LOCATION'},{businessType:'BUSINESS_TYPE_UNSPECIFIED'},{regionCode:'EG'},{regionCode:''}]) {
    const x=await signedSession({},false,false,behavior);const before=x.provider.calls.length;
    const r=await optionRequest(x,{languages:['ar'],verificationAddress:syntheticAddress,addressConfirmed:true});assert.equal(r.status,400);
    assert.equal(x.provider.calls.length,before+1);assert.equal(x.provider.calls.at(-1).method,'GET');
    assert(!x.provider.calls.at(-1).body);
  }
});
test('invalid languages, malformed addresses, wrong MIME and oversized POST bodies fail before provider requests',async()=>{
  const x=await signedSession();const before=x.provider.calls.length;
  const bad=[{languages:['fr']},{languages:[]},{languages:['ar','en','ar']},{languages:['ar'],unexpected:'value'},'{bad JSON}',{languages:['ar'],verificationAddress:{...syntheticAddress,addressLines:['bad\nline']},addressConfirmed:true},{languages:['ar'],verificationAddress:{...syntheticAddress,regionCode:'EG'},addressConfirmed:true},{languages:['ar'],verificationAddress:{...syntheticAddress,postalCode:'invalid'},addressConfirmed:true}];
  for(const payload of bad)assert.equal((await optionRequest(x,payload)).status,400);
  assert.equal((await optionRequest(x,{languages:['ar']},{'content-type':'text/plain'})).status,400);
  assert.equal((await optionRequest(x,' '.repeat(8193))).status,413);assert.equal(x.provider.calls.length,before);
});
test('location lists expose eligibility without private addresses or extra service-area details',async()=>{
  const x=await signedSession();const r=await x.handler(new Request(`${origin}/api/gbp?action=locations&account=accounts/test-account`,{headers:{cookie:x.jar}}));assert.equal(r.status,200);const d=await r.json();
  assert.equal(d.locations[0].businessType,'CUSTOMER_LOCATION_ONLY');assert.equal(d.locations[0].businessRegion,'SA');assert.equal(d.locations[0].serviceArea,undefined);assert.equal(d.locations[0].storefrontAddress,undefined);
});

function dailyFixture(){
  return {multiDailyMetricTimeSeries:[{dailyMetricTimeSeries:DAILY_METRICS.map((dailyMetric,i)=>({dailyMetric,timeSeries:{datedValues:[{date:{year:2026,month:10,day:11},...(i===7?{}:{value:String(i+1)})}]}}))}]};
}
const performanceRequest=(x,action='performance',params='')=>x.handler(new Request(`${origin}/api/gbp?action=${action}&location=locations/test-location${params}`,{headers:{cookie:x.jar}}));
test('Performance uses exactly eight GET metrics and a server-owned 90-day Riyadh range',async()=>{
  const x=await signedSession(),before=x.provider.calls.length,r=await performanceRequest(x),data=await r.json();
  assert.equal(r.status,200);assert.equal(x.provider.calls.length,before+1);
  const call=x.provider.calls.at(-1),url=new URL(call.url);assert.equal(call.method,'GET');assert.equal(call.body,undefined);
  assert.equal(url.hostname,'businessprofileperformance.googleapis.com');assert(url.pathname.endsWith(':fetchMultiDailyMetricsTimeSeries'));
  assert.deepEqual(url.searchParams.getAll('dailyMetrics'),DAILY_METRICS);
  assert.equal(data.rangeStart,'2026-07-14');assert.equal(data.rangeEnd,'2026-10-11');
  assert.equal(url.searchParams.get('dailyRange.start_date.year'),'2026');assert.equal(url.searchParams.get('dailyRange.start_date.month'),'7');assert.equal(url.searchParams.get('dailyRange.start_date.day'),'14');
  assert.equal(url.searchParams.get('dailyRange.end_date.day'),'11');assert.equal(data.syncedAt,new Date(instant).toISOString());
  assert.equal(data.coverage.reportingDays,1,'absent days are not manufactured');assert.equal(data.coverage.summary.BUSINESS_BOOKINGS,0,'only an existing point with no value means zero');
  assert.deepEqual(data.dailyResponse,dailyFixture());assert(!JSON.stringify(data).includes('SYNTHETIC_ACCESS_TOKEN'));assert(!JSON.stringify(data).includes(env.GBP_GOOGLE_CLIENT_SECRET));
  assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('vercel-cdn-cache-control'),'no-store');
});
test('Riyadh range handles midnight, year transitions and leap days',()=>{
  assert.deepEqual(performanceRange(Date.parse('2025-12-31T21:30:00Z')),{rangeStart:'2025-10-03',rangeEnd:'2025-12-31'});
  assert.equal(performanceRange(Date.parse('2024-03-01T00:00:00Z')).rangeEnd,'2024-02-29');
});
test('monthly export preserves exact zero, threshold and page cursor without summing them',async()=>{
  const x=await signedSession(),r=await performanceRequest(x,'keywords','&reportMonth=2026-09-01&pageToken='+encodeURIComponent('cursor/+=? &'));
  assert.equal(r.status,200);const data=await r.json(),call=x.provider.calls.at(-1),url=new URL(call.url);
  assert.equal(call.method,'GET');assert.equal(url.searchParams.get('monthlyRange.start_month.year'),'2026');assert.equal(url.searchParams.get('monthlyRange.end_month.month'),'9');
  assert.equal(url.searchParams.get('pageSize'),'100');assert.equal(url.searchParams.get('pageToken'),'cursor/+=? &');
  assert.equal(data.reportMonth,'2026-09-01');assert.equal(data.rows,2);assert.equal(data.keywordResponse.searchKeywordsCounts[0].insightsValue.value,'0');
  assert.equal(data.keywordResponse.searchKeywordsCounts[1].insightsValue.threshold,'15');assert.equal(data.keywordResponse.nextPageToken,'synthetic-next');
  assert.equal(data.locationId,'locations/test-location');assert(!JSON.stringify(data).includes('SYNTHETIC_ACCESS_TOKEN'));
});
test('invalid months, path injection, huge cursors and mutation methods never reach Google',async()=>{
  const x=await signedSession(),before=x.provider.calls.length;
  for(const month of ['', '2026-13-01','2026-06-01','2026-11-01','2026-09-02','https://evil.test'])assert.equal((await performanceRequest(x,'keywords','&reportMonth='+encodeURIComponent(month))).status,400);
  assert.equal((await performanceRequest(x,'keywords','&reportMonth=2026-09-01&pageToken='+'x'.repeat(2049))).status,400);
  const bad=new Request(`${origin}/api/gbp?action=performance&location=locations%2F123%2F..%2Fother`,{headers:{cookie:x.jar}});assert.equal((await x.handler(bad)).status,400);
  for(const action of ['performance','keywords'])assert.equal((await x.handler(new Request(`${origin}/api/gbp?action=${action}&location=locations/test-location`,{method:'POST',headers:{cookie:x.jar}}))).status,405);
  assert.equal(x.provider.calls.length,before);
});
test('partial, duplicate, null and invalid daily observations fail instead of becoming zeros',async()=>{
  const edits=[s=>s.pop(),s=>s.push(s[0]),s=>s[0].timeSeries.datedValues=[],s=>s[0].timeSeries.datedValues[0].value=null,s=>s[0].timeSeries.datedValues[0].value='-1',s=>s[0].timeSeries.datedValues[0].value='9007199254740992',s=>s[0].timeSeries.datedValues[0].date.day=99,s=>s[0].timeSeries.datedValues.push(s[0].timeSeries.datedValues[0]),s=>s[0].dailySubEntityType={dayOfWeek:'MONDAY'}];
  for(const edit of edits){const dailyResponse=dailyFixture();edit(dailyResponse.multiDailyMetricTimeSeries[0].dailyMetricTimeSeries);const x=await signedSession({},false,false,{dailyResponse});const r=await performanceRequest(x);assert.equal(r.status,502);assert.equal((await r.json()).error,'GOOGLE_INCOMPLETE_PERFORMANCE');}
});
test('provider failures retain status categories without leaking payloads or exporting zeros',async()=>{
  for(const status of [401,403,429,503]){const x=await signedSession({},false,false,{performanceError:status}),r=await performanceRequest(x),data=await r.json();assert.equal(r.status,502);assert.equal(data.providerStatus,status);assert.equal(data.reason,'SERVICE_DISABLED');assert.equal(data.dailyResponse,undefined);assert(!JSON.stringify(data).includes('SYNTHETIC_ACCESS_TOKEN'));}
});
test('empty keyword pages remain empty; ambiguous counts and error-shaped bodies are rejected',async()=>{
  const x=await signedSession({},false,false,{keywordResponse:{}}),r=await performanceRequest(x,'keywords','&reportMonth=2026-09-01');assert.equal(r.status,200);assert.equal((await r.json()).rows,0);
  for(const keywordResponse of [{searchKeywordsCounts:null},{error:{code:403}},{searchKeywordsCounts:[{searchKeyword:'bad',insightsValue:{value:'0',threshold:'15'}}]},{searchKeywordsCounts:[{searchKeyword:'bad',insightsValue:{threshold:'0'}}]},{searchKeywordsCounts:[{searchKeyword:'bad',insightsValue:{value:null}}]}]){
    const y=await signedSession({},false,false,{keywordResponse}),bad=await performanceRequest(y,'keywords','&reportMonth=2026-09-01');assert.equal(bad.status,502);assert.equal((await bad.json()).error,'GOOGLE_INCOMPLETE_PERFORMANCE');
  }
});
