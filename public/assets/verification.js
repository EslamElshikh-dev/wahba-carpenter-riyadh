const $=id=>document.getElementById(id);
let session=null,accountPage=null,locationPage=null,epoch=0;
const methods={ADDRESS:'بطاقة بريدية',EMAIL:'بريد إلكتروني',PHONE_CALL:'مكالمة هاتفية',SMS:'رسالة نصية',AUTO:'تحقق تلقائي',VETTED_PARTNER:'شريك معتمد',VIDEO:'فيديو',LIVE_VIDEO:'مكالمة فيديو'};
const states={PENDING:'المحاولة قيد المعالجة',COMPLETED:'اكتملت محاولة التحقق',FAILED:'لم تنجح المحاولة',VERIFICATION_STATE_UNSPECIFIED:'الحالة غير محددة'};
const errors={SETUP_REQUIRED:'إعداد Google Cloud وOAuth لم يكتمل بعد.',SIGN_IN_REQUIRED:'سجّل الدخول بحساب الإدارة لقراءة بيانات Google.',ADMIN_ACCOUNT_REQUIRED:'هذا الحساب غير مصرح له باستخدام واجهة الإدارة.',CSRF_REJECTED:'تعذر تأكيد الطلب. حدّث الصفحة وسجّل الدخول من جديد.',ORIGIN_REJECTED:'الربط متاح من عنوان الموقع المعتمد فقط.',GOOGLE_UNREACHABLE:'تعذر الاتصال بخدمة Google الآن. أعد المحاولة لاحقًا.',GOOGLE_INVALID_RESPONSE:'وصل رد غير قابل للقراءة من Google.',IDENTITY_REJECTED:'تعذر تأكيد هوية حساب Google.',OAUTH_STATE_REJECTED:'انتهت جلسة تسجيل الدخول أو تعذر تأكيدها.',BUSINESS_SCOPE_REQUIRED:'لم تُمنح صلاحية الملفات التجارية المطلوبة.',INVALID_RESOURCE:'معرّف الملف غير صالح. اختر الملف من القائمة.',METHOD_OR_ACTION_NOT_ALLOWED:'هذه العملية غير متاحة في واجهة المتابعة.'};
const time=value=>{try{return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(value));}catch{return 'غير متاح';}};
function notify(text,kind=''){ $('notice').textContent=text;$('notice').className=`notice ${kind}`; }
function errorText(data){if(data.error==='GOOGLE_API_ERROR'){const detail=data.reason?` (${data.reason})`:'';return `أعادت Google خطأ ${data.providerStatus||''}${detail}. راجع صلاحيات الحساب وتفعيل الخدمة وحصة المشروع؛ الخطأ وحده لا يثبت رفض التحقق.`;}return errors[data.error]||'تعذر إكمال القراءة. أعد المحاولة لاحقًا.';}
async function api(action,params={},method='GET') {
  const url=new URL('/api/gbp',location.origin);url.searchParams.set('action',action);for(const [key,value]of Object.entries(params))if(value)url.searchParams.set(key,value);
  const headers=method==='POST'?{'X-Gbp-Csrf':session?.csrf||''}:{};
  const res=await fetch(url,{method,headers,credentials:'same-origin',cache:'no-store'});let data;try{data=await res.json();}catch{throw new Error('تعذر قراءة خدمة المتابعة.');}
  if(!res.ok){const e=new Error(errorText(data));e.status=res.status;throw e;}return data;
}
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;if(tag==='option')n.value='';return n;}
function empty(id,text,error=false){$(id).replaceChildren();$(id).textContent=text;$(id).className=`empty${error?' error':''}`;}
function selected(){return $('location').value;}
function resetResult(){epoch++;$('status-title').textContent='لم تُقرأ الحالة بعد';$('status-copy').textContent='اختر ملفًا واقرأ حالته من Google.';$('status-dot').className='status-dot';for(const id of ['authority','voice','checked'])$(id).textContent='—';$('history-count').textContent='لم يُقرأ بعد';empty('history','تظهر هنا محاولات التحقق بعد القراءة.');empty('options','اضغط «قراءة الخيارات» لعرض ما أتاحته Google لهذا الملف.');for(const id of ['refresh-status','fetch-options'])$(id).disabled=!selected();}
async function accounts(append=false){
  if(!append){$('account').replaceChildren(node('option','اختر الحساب'));$('location').replaceChildren(node('option','اختر الملف'));accountPage=null;locationPage=null;$('more-locations').hidden=true;resetResult();}
  try{const data=await api('accounts',append?{pageToken:accountPage}:{});for(const a of data.accounts){const n=node('option',a.accountName||a.name);n.value=a.name;$('account').append(n);}accountPage=data.nextPageToken;$('more-accounts').hidden=!accountPage;if(!data.accounts.length&&!append)notify('Google لم ترجع حسابات ملفات تجارية لهذا الدخول.');else notify('تمت قراءة الحسابات. اختر حساب الملفات التجارية.','success');}catch(e){notify(e.message,'error');}
}
async function locations(append=false){
  const account=$('account').value;if(!append){$('location').replaceChildren(node('option','اختر الملف'));locationPage=null;resetResult();}if(!account)return;
  try{const data=await api('locations',{account,pageToken:append?locationPage:null});for(const l of data.locations){const phone=l.phoneNumbers?.primaryPhone||'';const n=node('option',`${l.title||l.name}${phone?` · ${phone}`:''}`);n.value=l.name;$('location').append(n);}locationPage=data.nextPageToken;$('more-locations').hidden=!locationPage;notify(data.locations.length?'تمت قراءة الملفات. اختر الملف المطابق للنشاط.':'Google لم ترجع ملفات ضمن هذا الحساب.',data.locations.length?'success':'');}catch(e){notify(e.message,'error');}
}
function renderVoice(part){
  if(part.error){$('status-title').textContent='تعذرت قراءة الحالة';$('status-copy').textContent=errorText(part);$('status-dot').className='status-dot issue';$('authority').textContent='غير متاحة';$('voice').textContent='غير متاحة';return;}
  const v=part.data;let title='لم ترجع Google إجراءً واضحًا',copy='راجع حالة الملف من لوحة Google الرسمية.',kind='';
  if(v.hasVoiceOfMerchant===true){title='الملف بحالة إدارة سليمة';copy='يمكن إدارة الملف، وتظهر التعديلات بعد اجتياز مراجعتها لدى Google.';kind='good';}
  else if(v.waitForVoiceOfMerchant){title='قيد مراجعة جودة الملف';copy='توصي Google بالانتظار لاكتساب حالة الإدارة والنشر.';kind='review';}
  else if(v.verify){title='يحتاج إلى إكمال التحقق';copy='تعرض Google بدء أو متابعة التحقق. اقرأ الخيارات المتاحة قبل اختيار الخطوة.';kind='review';}
  else if(v.resolveOwnershipConflict){title='تعارض ملكية أو ملف مكرر';copy='توصي Google بحل التعارض مع الملف الآخر قبل متابعة الإجراءات.';kind='issue';}
  else if(v.complyWithGuidelines){title='مطلوب مراجعة الالتزام بالإرشادات';copy='ترجع Google إجراءً متعلقًا بالإرشادات. راجع السبب ومسار المعالجة في لوحة الملف.';kind='issue';}
  $('status-title').textContent=title;$('status-copy').textContent=copy;$('status-dot').className=`status-dot ${kind}`;
  $('authority').textContent=typeof v.hasBusinessAuthority==='boolean'?(v.hasBusinessAuthority?'مكتسبة':'لم تُكتسب بعد'):'غير متاحة في الرد';$('voice').textContent=typeof v.hasVoiceOfMerchant==='boolean'?(v.hasVoiceOfMerchant?'مكتسبة':'لم تُكتسب بعد'):'غير متاحة في الرد';
}
function renderHistory(part){
  if(part.error){empty('history',errorText(part),true);$('history-count').textContent='تعذرت القراءة';return;}
  const list=part.data.verifications??[];$('history-count').textContent=`${list.length} محاولات في الرد`;
  if(!list.length){empty('history','Google لم ترجع محاولات تحقق لهذا الملف.');return;}
  $('history').className='';$('history').replaceChildren();for(const h of list){const row=node('div',undefined,'history-item');const info=node('div');info.append(node('strong',methods[h.method]||h.method||'طريقة غير محددة'),node('small',h.createTime?time(h.createTime):'لم تُرجع Google تاريخًا'));row.append(info,node('span',states[h.state]||h.state||'غير محددة','badge neutral'));$('history').append(row);}
  if(part.data.nextPageToken)$('history').append(node('p','توجد محاولات إضافية خارج الدفعة الحالية.','fine'));
}
async function status(){
  const location=selected();if(!location)return;const mark=epoch;$('refresh-status').disabled=true;
  try{const data=await api('status',{location});if(mark!==epoch)return;renderVoice(data.voice);renderHistory(data.history);$('checked').textContent=time(data.checkedAt);$('live-step').classList.add('done');$('live-readiness').textContent='تمت قراءة بيانات فعلية من Google.';notify('تم تحديث الرد من Google. يعرض السجل نتائج المحاولات بصورة مستقلة عن حالة الملف.','success');}catch(e){if(mark===epoch)notify(e.message,'error');}finally{if(mark===epoch)$('refresh-status').disabled=!selected();}
}
async function options(){
  const location=selected();if(!location)return;const mark=epoch;$('fetch-options').disabled=true;
  try{const data=await api('options',{location},'POST');if(mark!==epoch)return;
    if(!data.options.length){empty('options','Google لم ترجع طرق تحقق في هذه القراءة. راجع حالة الملف والخيارات التي تظهر في لوحته.');return;}
    $('options').className='';$('options').replaceChildren();for(const o of data.options){const row=node('div',undefined,'option');const info=node('div');info.append(node('strong',methods[o.verificationMethod]||o.verificationMethod||'طريقة غير محددة'));const hint=o.emailData?.user?`${o.emailData.user}@${o.emailData.domain||''}`:o.phoneData?.phoneNumber||'';if(hint)info.append(node('small',hint));row.append(info,node('span','متاحة في الرد','badge'));$('options').append(row);}notify('تمت قراءة الطرق المتاحة. قراءة الخيارات لا تبدأ محاولة تحقق.','success');
  }catch(e){if(mark===epoch){empty('options',e.message,true);notify(e.message,'error');}}finally{if(mark===epoch)$('fetch-options').disabled=!selected();}
}
async function boot(){
  try{session=await api('session');$('login').disabled=!session.configured;$('login').hidden=session.connected;$('logout').hidden=!session.connected;$('selector').hidden=!session.connected;
    $('connection-badge').textContent=session.connected?'الحساب متصل':session.configured?'جاهز لتسجيل الدخول':'بانتظار الإعداد';$('connection-badge').className=`badge${session.connected?' success':''}`;
    $('connection-copy').textContent=session.connected?`حساب الإدارة: ${session.email} · تنتهي الجلسة ${time(session.expiresAt)}`:session.configured?'إعداد الخادم جاهز. سجّل الدخول بالحساب المصرّح له بالمتابعة.':'واجهة المتابعة جاهزة. يلزم إعداد مشروع Google Cloud وOAuth قبل بدء الاتصال بالملفات.';
    if(session.configured){$('oauth-step').classList.add('done');$('oauth-readiness').textContent='إعداد الخادم جاهز؛ يلزم نجاح اختبار API لإثبات الوصول.';}
    const result=new URL(location.href).searchParams.get('auth');if(result==='cancelled')notify('تم إلغاء موافقة Google. يمكنك تسجيل الدخول لاحقًا.');else notify(session.connected?'تم تأكيد حساب الإدارة. اختر الملف لقراءة حالته.':session.configured?'جاهز لتسجيل الدخول ومراجعة صلاحيات Google.':'لم يبدأ الاتصال الحي بـGoogle؛ حالة الملف غير مقروءة في هذه الواجهة.',session.connected?'success':'');
    if(session.connected)await accounts();
  }catch(e){$('connection-badge').textContent='تعذرت قراءة الإعداد';notify(e.message,'error');}
}
$('login').addEventListener('click',()=>{if(session?.configured)location.assign('/api/gbp?action=login');});
$('logout').addEventListener('click',async()=>{try{await api('logout',{},'POST');location.reload();}catch(e){notify(e.message,'error');}});
$('account').addEventListener('change',()=>locations());$('location').addEventListener('change',resetResult);
$('reload-accounts').addEventListener('click',()=>accounts());$('more-accounts').addEventListener('click',()=>accounts(true));$('more-locations').addEventListener('click',()=>locations(true));$('refresh-status').addEventListener('click',status);$('fetch-options').addEventListener('click',options);
boot();

