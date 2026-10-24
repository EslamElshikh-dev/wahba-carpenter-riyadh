import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Synthetic DOM and data only; no browser sessions or Google credentials.
function ui(){
  const nodes=new Map();
  const element=()=>({value:'',disabled:false,checked:false,hidden:false,dataset:{},selectedOptions:[{dataset:{}}],children:[],classList:{add(){}},addEventListener(){},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},remove(){},click(){}});
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element,body:element()};
  const context=vm.createContext({document,Intl,Date,URL,Blob,setTimeout:fn=>fn()});
  vm.runInContext(fs.readFileSync(new URL('../public/assets/verification.js',import.meta.url),'utf8').replace(/\nboot\(\);\s*$/,''),context);
  vm.runInContext("session={connected:true};$('location').value='locations/synthetic-a';",context);
  return {context,nodes,run:code=>vm.runInContext(code,context)};
}
function daily(){return {locationId:'locations/synthetic-a',rangeStart:'2026-07-26',rangeEnd:'2026-10-23',syncedAt:'2026-10-24T17:00:00Z',coverage:{reportingDays:1,lastReportDate:'2026-10-20',summary:{BUSINESS_IMPRESSIONS_DESKTOP_SEARCH:1,BUSINESS_IMPRESSIONS_MOBILE_SEARCH:2,BUSINESS_IMPRESSIONS_DESKTOP_MAPS:3,BUSINESS_IMPRESSIONS_MOBILE_MAPS:4,CALL_CLICKS:5,WEBSITE_CLICKS:6,BUSINESS_DIRECTION_REQUESTS:7,BUSINESS_BOOKINGS:0}},dailyResponse:{}};}
test('switching profiles removes the previous export and disables download',()=>{
  const x=ui();x.run("performancePacket={daily:{locationId:'locations/synthetic-a'}};performanceBusy=true;$('download-performance').disabled=false;$('location').value='locations/synthetic-b';resetResult();");
  assert.equal(x.run('performancePacket'),null);assert.equal(x.run('performanceBusy'),false);assert.equal(x.nodes.get('download-performance').disabled,true);
});
test('late responses from a previous profile cannot render or enable export',async()=>{
  const x=ui();let finish,entered,reads=0;const reached=new Promise(resolve=>{entered=resolve;});
  x.context.api=async action=>{reads++;if(action==='performance')return daily();return new Promise(resolve=>{finish=resolve;entered();});};
  const pending=x.run('readPerformance()');await reached;
  assert.equal(typeof finish,'function');x.run("$('location').value='locations/synthetic-b';resetResult();");finish({rows:0,keywordResponse:{}});await pending;
  assert.equal(x.run('performancePacket'),null);assert.equal(x.nodes.get('download-performance').disabled,true);assert.equal(reads,2);
});
test('one deliberate read keeps separate monthly requests and original source timestamps',async()=>{
  const x=ui(),calls=[];
  x.context.api=async(action,params,method)=>{calls.push({action,params,method});return action==='performance'?daily():{reportMonth:params.reportMonth,rows:0,syncedAt:'2026-10-24T17:00:01Z',keywordResponse:{}};};
  await x.run('readPerformance()');const packet=x.run('performancePacket');
  assert.equal(packet.keywordComplete,true);assert.equal(packet.daily.syncedAt,'2026-10-24T17:00:00Z');assert.equal(packet.keywordPages.length,4);
  assert.deepEqual(calls.slice(1).map(c=>c.params.reportMonth),['2026-07-01','2026-08-01','2026-09-01','2026-10-01']);assert(calls.every(c=>c.method===undefined));assert.equal(x.nodes.get('download-performance').disabled,false);
});
test('a provider quota failure preserves daily data and marks monthly coverage partial',async()=>{
  const x=ui();let reads=0;
  x.context.api=async action=>{reads++;if(action==='performance')return daily();const error=new Error('Synthetic quota failure');error.providerStatus=429;throw error;};
  await x.run('readPerformance()');const packet=x.run('performancePacket');assert.equal(packet.daily.locationId,'locations/synthetic-a');assert.equal(packet.keywordComplete,false);assert.equal(packet.keywordPages.length,0);assert.equal(packet.keywordErrors.length,1);assert.equal(reads,2);
});
test('repeated cursors stop pagination and never claim complete monthly coverage',async()=>{
  const x=ui();let reads=0;
  x.context.api=async action=>{reads++;return action==='performance'?daily():{rows:1,keywordResponse:{nextPageToken:'repeated-synthetic-cursor'}};};
  await x.run('readPerformance()');const packet=x.run('performancePacket');assert.equal(packet.keywordComplete,false);assert.equal(packet.keywordErrors.length,4);assert.equal(reads,9);
});
