import {randomBytes, createHash, createCipheriv, createDecipheriv, createPublicKey, verify, timingSafeEqual} from 'node:crypto';

const SESSION='__Host-wahba_gbp';
const FLOW='__Host-wahba_gbp_flow';
const SCOPE='https://www.googleapis.com/auth/business.manage';
const ORIGIN='https://wahba-carpenter-riyadh.vercel.app';
const AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN='https://oauth2.googleapis.com/token';
const KEYS='https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_HOSTS=new Set(['oauth2.googleapis.com','www.googleapis.com','mybusinessaccountmanagement.googleapis.com','mybusinessbusinessinformation.googleapis.com','mybusinessverifications.googleapis.com']);
const required=['GBP_GOOGLE_CLIENT_ID','GBP_GOOGLE_CLIENT_SECRET','GBP_SESSION_SECRET','GBP_ADMIN_EMAILS','GBP_OAUTH_ENABLED'];

class AppError extends Error {
  constructor(code,status=400,providerStatus,reason) { super(code);Object.assign(this,{code,status,providerStatus,reason}); }
}
const equal=(a,b)=>{const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&timingSafeEqual(x,y);};
const random=()=>randomBytes(32).toString('base64url');
const cookie=(name,value,ttl)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttl}`;
const clear=name=>cookie(name,'',0);
function cookies(request) {
  return Object.fromEntries((request.headers.get('cookie')??'').split(';').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),x.slice(i+1).trim()];}));
}
function seal(value,key,aad) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(aad));
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  const result=[iv,data,cipher.getAuthTag()].map(x=>x.toString('base64url')).join('.');
  if(result.length>3500)throw new AppError('SESSION_TOO_LARGE',502);
  return result;
}
function unseal(value,key,aad,now) {
  try {
    if(typeof value!=='string'||value.length>3500) return null;
    const parts=value.split('.');if(parts.length!==3)return null;
    const [iv,data,tag]=parts.map(x=>Buffer.from(x,'base64url'));if(iv.length!==12||tag.length!==16)return null;
    const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(tag);
    const decoded=JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8'));
    return Number.isFinite(decoded.exp)&&decoded.exp>now?decoded:null;
  }catch{return null;}
}
function settings(env) {
  let origin;try{origin=new URL(env.GBP_APP_ORIGIN||ORIGIN).origin;}catch{origin=ORIGIN;}
  const emails=(env.GBP_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const missing=required.filter(x=>!env[x]?.trim());
  if(!['1','true'].includes(env.GBP_OAUTH_ENABLED??'')&&!missing.includes('GBP_OAUTH_ENABLED'))missing.push('GBP_OAUTH_ENABLED');
  if((env.GBP_SESSION_SECRET?.length??0)<43&&!missing.includes('GBP_SESSION_SECRET'))missing.push('GBP_SESSION_SECRET');
  if(!emails.length&&!missing.includes('GBP_ADMIN_EMAILS'))missing.push('GBP_ADMIN_EMAILS');
  if(!origin.startsWith('https://'))missing.push('GBP_APP_ORIGIN');
  return {origin,emails,missing,configured:!missing.length,client:env.GBP_GOOGLE_CLIENT_ID,secret:env.GBP_GOOGLE_CLIENT_SECRET,key:createHash('sha256').update(env.GBP_SESSION_SECRET||'disabled').digest()};
}
function response(body,status=200,extra={}) {
  const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  for(const [key,value]of Object.entries(extra)){for(const item of Array.isArray(value)?value:[value])headers.append(key,item);}
  return new Response(body===null?null:JSON.stringify(body),{status,headers});
}
function resource(value,prefix) {
  if(!new RegExp(`^${prefix}/[A-Za-z0-9_-]{1,150}$`).test(value??''))throw new AppError('INVALID_RESOURCE',400);
  return value;
}
function csrf(request,session,origin) {
  if(request.headers.get('origin')!==origin||!equal(request.headers.get('x-gbp-csrf'),session.csrf))throw new AppError('CSRF_REJECTED',403);
}
function pageToken(url) {const token=url.searchParams.get('pageToken');if(token&&token.length>2048)throw new AppError('INVALID_PAGE_TOKEN');return token;}

async function optionInput(request) {
  // Addresses stay in a bounded POST body, never in URLs, sessions or logs.
  const limit=8192;
  if(Number(request.headers.get('content-length'))>limit)throw new AppError('OPTION_REQUEST_TOO_LARGE',413);
  let body='';
  if(request.body) {
    const reader=request.body.getReader(),chunks=[];let size=0;
    try {
      while(true) {
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>limit){await reader.cancel();throw new AppError('OPTION_REQUEST_TOO_LARGE',413);}
        chunks.push(value);
      }
      body=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
    }catch(error){if(error instanceof AppError)throw error;throw new AppError('INVALID_OPTION_REQUEST');}
    finally{reader.releaseLock();}
  }
  if(!body)return {languages:['ar'],address:null};
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new AppError('INVALID_OPTION_REQUEST');
  let input;try{input=JSON.parse(body);}catch{throw new AppError('INVALID_OPTION_REQUEST');}
  if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(key=>!['languages','verificationAddress','addressConfirmed'].includes(key)))throw new AppError('INVALID_OPTION_REQUEST');
  const languages=input.languages??['ar'];
  if(!Array.isArray(languages)||!languages.length||languages.length>2||languages.some(code=>!['ar','en'].includes(code)))throw new AppError('UNSUPPORTED_LANGUAGE');
  let address=null;
  if(input.verificationAddress!==undefined) {
    if(input.addressConfirmed!==true)throw new AppError('ADDRESS_CONFIRMATION_REQUIRED');
    const a=input.verificationAddress;
    if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(key=>!['regionCode','administrativeArea','locality','postalCode','addressLines'].includes(key)))throw new AppError('INVALID_VERIFICATION_ADDRESS');
    const text=(value,max=120)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
    if(a.regionCode!=='SA'||!text(a.administrativeArea)||!text(a.locality)||!Array.isArray(a.addressLines)||!a.addressLines.length||a.addressLines.length>3||a.addressLines.some(line=>!text(line,200))||(a.postalCode!==undefined&&a.postalCode!==''&&!/^\d{5}$/.test(a.postalCode)))throw new AppError('INVALID_VERIFICATION_ADDRESS');
    address={regionCode:'SA',administrativeArea:a.administrativeArea.trim(),locality:a.locality.trim(),addressLines:a.addressLines.map(line=>line.trim())};
    if(a.postalCode)address.postalCode=a.postalCode;
  }
  return {languages:[...new Set(languages)],address};
}

export function createHandler(env,fetcher=fetch,clock=()=>Date.now()) {
  const cfg=settings(env);
  async function google(url,init={}) {
    const target=new URL(url);if(target.protocol!=='https:'||!GOOGLE_HOSTS.has(target.hostname))throw new AppError('INVALID_PROVIDER',500);
    let result;try{result=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw new AppError('GOOGLE_UNREACHABLE',502);}
    let data;try{data=await result.json();}catch{throw new AppError('GOOGLE_INVALID_RESPONSE',502);}
    if(!result.ok) {
      const reason=data.error?.details?.find(x=>typeof x.reason==='string')?.reason;
      // Do not echo provider messages, tokens, authorization codes, or request URLs.
      throw new AppError('GOOGLE_API_ERROR',502,result.status,/^[A-Z0-9_]{1,80}$/.test(reason??'')?reason:undefined);
    }
    return data;
  }
  async function identity(idToken,nonce,now) {
    try {
      if(typeof idToken!=='string'||idToken.length>16000)throw 0;
      const parts=idToken.split('.');if(parts.length!==3)throw 0;
      const header=JSON.parse(Buffer.from(parts[0],'base64url'));
      const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
      if(header.alg!=='RS256'||typeof header.kid!=='string')throw 0;
      const jwks=await google(KEYS);const jwk=jwks.keys?.find(x=>x.kid===header.kid&&x.kty==='RSA'&&(!x.alg||x.alg==='RS256')&&(!x.use||x.use==='sig'));
      if(!jwk||!verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw 0;
      const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];
      if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||!audience.includes(cfg.client))throw 0;
      if((claims.azp&&claims.azp!==cfg.client)||(audience.length>1&&claims.azp!==cfg.client))throw 0;
      if(!Number.isFinite(claims.exp)||claims.exp*1000<=now||!Number.isFinite(claims.iat)||claims.iat*1000>now+60000)throw 0;
      if(!equal(claims.nonce,nonce)||claims.email_verified!==true||typeof claims.sub!=='string')throw 0;
      const email=String(claims.email??'').toLowerCase();if(!cfg.emails.includes(email))throw new AppError('ADMIN_ACCOUNT_REQUIRED',403);
      return {email,sub:claims.sub};
    }catch(e){if(e instanceof AppError)throw e;throw new AppError('IDENTITY_REJECTED',403);}
  }
  return async function handle(request) {
    const now=clock(),url=new URL(request.url),action=url.searchParams.get('action')||'session';
    const jar=cookies(request);let session=cfg.configured?unseal(jar[SESSION],cfg.key,`${cfg.origin}:session`,now):null;
    if(session&&(!cfg.emails.includes(session.email)||session.client!==cfg.client||typeof session.access!=='string'||typeof session.csrf!=='string'))session=null;
    const finish=(data,status=200)=>response(data,status);
    try {
      if(action==='session'&&request.method==='GET')return finish({configured:cfg.configured,connected:!!session,missing:cfg.missing,scope:SCOPE,email:session?.email||null,csrf:session?.csrf||null,expiresAt:session?new Date(session.exp).toISOString():null});
      if(!cfg.configured)throw new AppError('SETUP_REQUIRED',503);
      if(url.origin!==cfg.origin)throw new AppError('ORIGIN_REJECTED',403);
      if(action==='login'&&request.method==='GET') {
        if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('CSRF_REJECTED',403);
        const flow={state:random(),nonce:random(),verifier:random(),exp:now+600000};
        const auth=new URL(AUTH);const params={client_id:cfg.client,redirect_uri:`${cfg.origin}/api/gbp?action=callback`,response_type:'code',scope:`openid email ${SCOPE}`,state:flow.state,nonce:flow.nonce,code_challenge:createHash('sha256').update(flow.verifier).digest('base64url'),code_challenge_method:'S256',access_type:'online',prompt:'select_account'};
        for(const [k,v]of Object.entries(params))auth.searchParams.set(k,v);
        return response(null,302,{Location:auth.href,'Set-Cookie':cookie(FLOW,seal(flow,cfg.key,`${cfg.origin}:flow`),600)});
      }
      if(action==='callback'&&request.method==='GET') {
        const flow=unseal(jar[FLOW],cfg.key,`${cfg.origin}:flow`,now);
        if(!flow||!equal(url.searchParams.get('state'),flow.state))throw new AppError('OAUTH_STATE_REJECTED',403);
        if(url.searchParams.has('error'))return response(null,303,{Location:'/admin/verification?auth=cancelled','Set-Cookie':clear(FLOW)});
        const code=url.searchParams.get('code');if(!code||code.length>4096)throw new AppError('OAUTH_CODE_MISSING',400);
        const tokens=await google(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cfg.client,client_secret:cfg.secret,code,code_verifier:flow.verifier,grant_type:'authorization_code',redirect_uri:`${cfg.origin}/api/gbp?action=callback`})});
        const who=await identity(tokens.id_token,flow.nonce,now);
        if(typeof tokens.access_token!=='string'||tokens.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(tokens.expires_in)||tokens.expires_in<60)throw new AppError('OAUTH_TOKEN_REJECTED',403);
        if(typeof tokens.scope!=='string'||!tokens.scope.split(' ').includes(SCOPE))throw new AppError('BUSINESS_SCOPE_REQUIRED',403);
        const ttl=Math.min(3600,Math.floor(tokens.expires_in)-30);
        const value={...who,client:cfg.client,access:tokens.access_token,csrf:random(),exp:now+ttl*1000};
        return response(null,303,{Location:'/admin/verification','Set-Cookie':[clear(FLOW),cookie(SESSION,seal(value,cfg.key,`${cfg.origin}:session`),ttl)]});
      }
      if(!session)throw new AppError('SIGN_IN_REQUIRED',401);
      const authorization={Authorization:`Bearer ${session.access}`};
      const get=(endpoint)=>google(endpoint,{headers:authorization});
      if(action==='logout'&&request.method==='POST'){csrf(request,session,cfg.origin);return response({connected:false},200,{'Set-Cookie':clear(SESSION)});}
      if(action==='accounts'&&request.method==='GET') {
        const endpoint=new URL('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');endpoint.searchParams.set('pageSize','20');const token=pageToken(url);if(token)endpoint.searchParams.set('pageToken',token);
        const data=await get(endpoint.href);return finish({accounts:(data.accounts??[]).map(x=>({name:x.name,accountName:x.accountName,type:x.type,role:x.role})),nextPageToken:data.nextPageToken||null});
      }
      if(action==='locations'&&request.method==='GET') {
        const account=resource(url.searchParams.get('account'),'accounts');const endpoint=new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations`);
        endpoint.searchParams.set('readMask','name,title,phoneNumbers,websiteUri,metadata,serviceArea');endpoint.searchParams.set('pageSize','100');const token=pageToken(url);if(token)endpoint.searchParams.set('pageToken',token);
        const data=await get(endpoint.href);return finish({locations:(data.locations??[]).map(x=>({name:x.name,title:x.title,phoneNumbers:x.phoneNumbers,websiteUri:x.websiteUri,metadata:x.metadata,businessType:x.serviceArea?.businessType||null,businessRegion:x.serviceArea?.regionCode||null})),nextPageToken:data.nextPageToken||null});
      }
      if(action==='status'&&request.method==='GET') {
        const location=resource(url.searchParams.get('location'),'locations');
        const settled=await Promise.allSettled([get(`https://mybusinessverifications.googleapis.com/v1/${location}/VoiceOfMerchantState`),get(`https://mybusinessverifications.googleapis.com/v1/${location}/verifications`)]);
        const unpack=r=>r.status==='fulfilled'?{data:r.value}:{error:r.reason.code||'GOOGLE_API_ERROR',providerStatus:r.reason.providerStatus,reason:r.reason.reason};
        if(settled.every(r=>r.status==='rejected'))throw settled[0].reason;
        return finish({location,checkedAt:new Date(clock()).toISOString(),voice:unpack(settled[0]),history:unpack(settled[1])});
      }
      if(action==='options'&&request.method==='POST') {
        csrf(request,session,cfg.origin);const location=resource(url.searchParams.get('location'),'locations');
        const input=await optionInput(request);
        if(input.address) {
          const detail=await get(`https://mybusinessbusinessinformation.googleapis.com/v1/${location}?readMask=serviceArea`);
          if(detail.serviceArea?.businessType!=='CUSTOMER_LOCATION_ONLY')throw new AppError('CONTEXT_NOT_APPLICABLE');
          if(detail.serviceArea.regionCode!=='SA')throw new AppError('CONTEXT_COUNTRY_NOT_SUPPORTED');
        }
        const settled=await Promise.allSettled(input.languages.map(languageCode=>google(`https://mybusinessverifications.googleapis.com/v1/${location}:fetchVerificationOptions`,{
          method:'POST',headers:{...authorization,'Content-Type':'application/json'},
          body:JSON.stringify({languageCode,...(input.address?{context:{address:input.address}}:{})})
        })));
        if(settled.every(result=>result.status==='rejected'))throw settled[0].reason;
        const results=settled.map((result,i)=>result.status==='fulfilled'?{languageCode:input.languages[i],options:result.value.options??[]}:{languageCode:input.languages[i],error:result.reason.code||'GOOGLE_API_ERROR',providerStatus:result.reason.providerStatus,reason:result.reason.reason});
        return finish({location,checkedAt:new Date(clock()).toISOString(),contextUsed:!!input.address,results,...(results.length===1?{options:results[0].options??[]}:{})});
      }
      throw new AppError('METHOD_OR_ACTION_NOT_ALLOWED',405);
    }catch(error) {
      const e=error instanceof AppError?error:new AppError('INTERNAL_ERROR',500);
      // Log only operational categories, never authentication or provider payloads.
      if(e.status>=500)console.error('GBP monitor:',e.code,e.providerStatus||'');
      return response({error:e.code,providerStatus:e.providerStatus,reason:e.reason},e.status,action==='callback'?{'Set-Cookie':[clear(FLOW),clear(SESSION)]}:{});
    }
  };
}

