const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../session-rules.js');
const key='waspnJournalV2';
function withStorage(initial,fn){
 const prev=globalThis.localStorage;
 let saved=JSON.stringify(initial);
 globalThis.localStorage={
  getItem:k=>k===key?saved:null,
  setItem:(k,v)=>{if(k===key)saved=String(v);}
 };
 try{fn(()=>JSON.parse(saved));}finally{globalThis.localStorage=prev;}
}
test('Friday Nov 6 stale live gross is replaced by broker execution net, preserving window breach',()=>{
 const risk={attempt:2,windowBreach:true,sessionEnded:true,closedReason:'OUT_OF_WINDOW_ENTRY'};
 const trades=[{symbol:'DBGI',shares:2000},{symbol:'RAYA',shares:500}];
 const original={'2026-11-06':{
  brokerDailyNet:110.10,brokerDailyNetSource:'TRADEZERO_LIVE',
  trades,notes:'Friday defensive session',totalNet:111.2,
  compliance:{status:'BREACH'},liveRisk:risk,other:'do-not-overwrite'
 }};
 withStorage(original,read=>{
  R.sync();
  const day=read()['2026-11-06'];
  assert.equal(day.brokerDailyNet,94.01);
  assert.equal(day.brokerDailyGross,110.10);
  assert.equal(day.brokerDailyDeductions,16.09);
  assert.equal(day.brokerReportedFees,16.09);
  assert.equal(day.brokerDailyFees,16.09);
  assert.equal(day.brokerDailyCsvExecutions,4);
  assert.equal(day.brokerUnitemizedDeductions,0);
  assert.equal(day.brokerDailySettlementDate,'2026-11-09');
  assert.equal(day.brokerDailySettlementConfirmed,false);
  assert.match(day.brokerDailyNetSource,/TRADEZERO_USER_EXECUTION_CSV_2026-11-07_PENDING_SETTLEMENT/);
  for(const field of ['trades','notes','totalNet','compliance','liveRisk','other'])
   assert.deepEqual(day[field],original['2026-11-06'][field],field);
  R.sync();
  assert.deepEqual(read()['2026-11-06'],day);
 });
});
test('Friday migration runs on normal journal writes and does not change other dates',()=>{
 withStorage({},read=>{
  R.writeJournal({
   '2026-11-05':{brokerDailyNet:48.44,brokerDailyNetSource:'TRADEZERO_EXECUTION_REPORT_2026-11-06'},
   '2026-11-06':{brokerDailyNet:110.1,notes:'save test'},
   '2026-11-09':{brokerDailyNet:23,notes:'later'}
  });
  assert.equal(read()['2026-11-06'].brokerDailyNet,94.01);
  assert.equal(read()['2026-11-06'].notes,'save test');
  assert.equal(read()['2026-11-09'].brokerDailyNet,23);
 });
});
test('future explicitly settled broker number is preserved rather than overwritten',()=>{
 withStorage({'2026-11-06':{
  brokerDailyNet:93.55,brokerDailyNetSource:'TRADEZERO_FINAL_SETTLED',notes:'final'
 }},read=>{
  R.sync();
  assert.equal(read()['2026-11-06'].brokerDailyNet,93.55);
  assert.equal(read()['2026-11-06'].brokerDailyNetSource,'TRADEZERO_FINAL_SETTLED');
 });
});
test('Review displays Friday +94.01 with clear unsettled provenance, ahead of stale gross',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','calendar-2026.html'),'utf8');
 assert.match(s,/"2026-11-06":94\.01/);
 assert.match(s,/TradeZero CSV net · settlement pending 9 Nov/);
 const fn=s.match(/function getDailyResult\([\s\S]*?\n\}/)?.[0]||'';
 assert.ok(fn.indexOf('if(date === "2026-11-06")')<fn.indexOf('typeof record.brokerDailyNet ==='));
 assert.match(fn,/SETTLED_CONFIRMED\|FINAL_SETTLED/);
 const worker=fs.readFileSync(path.join(__dirname,'..','service-worker.js'),'utf8');
 assert.match(worker,/waspn-pwa-v18/);
 assert.match(worker,/session-rules\.js\?v=6/);
});
