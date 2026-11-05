const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../session-rules.js');

const storageKey = 'waspnJournalV2';
function withStorage(data, run){
  const old = globalThis.localStorage;
  let saved = JSON.stringify(data);
  globalThis.localStorage = {
    getItem:key => key===storageKey ? saved : null,
    setItem:(key,v)=>{if(key===storageKey)saved=v;}
  };
  try { run(()=>JSON.parse(saved)); } finally { globalThis.localStorage=old; }
}

test('Nov 4 stale +109 gross saved as broker net is reconciled without losing evidence',()=>{
  const original = {
    '2026-11-04':{
      brokerDailyNet:109,
      brokerDailyNetSource:'TRADEZERO_LIVE',
      trades:[{symbol:'NVTS',shares:100},{symbol:'CRIS',shares:239},{symbol:'CRIS',shares:500},{symbol:'VCIG',shares:100}],
      notes:'Four clean trades',
      totalNet:104.8,
      compliance:{score:3},sessionScore:{score:5},
      liveRisk:{attempt:4,maxAttemptReached:4,windowBreach:false}
    }
  };
  withStorage(original, read=>{
    R.sync();
    const day=read()['2026-11-04'];
    assert.equal(day.brokerDailyNet,104.21);
    assert.equal(day.brokerDailyGross,109);
    assert.equal(day.brokerDailyFees,4.79);
    assert.equal(day.brokerDailyNetSource,'TRADEZERO_EXECUTION_REPORT_2026-11-05');
    for(const field of ['trades','notes','totalNet','compliance','sessionScore','liveRisk']){
      assert.deepEqual(day[field],original['2026-11-04'][field],field);
    }
    R.sync();
    assert.equal(read()['2026-11-04'].brokerDailyNet,104.21);
  });
});

test('simultaneous Nov 3 and Nov 4 stale values both reconcile',()=>{
  withStorage({'2026-11-03':{brokerDailyNet:137.67},'2026-11-04':{brokerDailyNet:109}},read=>{
    R.sync();
    assert.equal(read()['2026-11-03'].brokerDailyNet,129.49);
    assert.equal(read()['2026-11-04'].brokerDailyNet,104.21);
  });
});

test('other or already-reconciled amounts are left unchanged on journal writes',()=>{
  withStorage({},read=>{
    R.writeJournal({
      '2026-11-03':{brokerDailyNet:129.49},
      '2026-11-04':{brokerDailyNet:104.21,notes:'preserve'},
      '2026-11-05':{brokerDailyNet:0}
    });
    assert.equal(read()['2026-11-04'].brokerDailyNet,104.21);
    assert.equal(read()['2026-11-04'].notes,'preserve');
    assert.equal(read()['2026-11-05'].brokerDailyNet,0);
  });
});

test('Review has verified Nov 4 daily net fallback',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','calendar-2026.html'),'utf8');
 assert.match(source,/"2026-11-04":104\.21/);
 const fn=source.match(/function getDailyResult\([\s\S]*?\n\}/)?.[0]||'';
 assert.ok(fn.indexOf('record.brokerDailyNet') < fn.indexOf('tradingData[date]'));
});
