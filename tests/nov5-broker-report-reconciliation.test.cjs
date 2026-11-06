const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../session-rules.js');

const key = 'waspnJournalV2';
function withStorage(initial,run){
  const original=globalThis.localStorage;
  let saved=JSON.stringify(initial);
  globalThis.localStorage={
    getItem:k=>k===key?saved:null,
    setItem:(k,v)=>{if(k===key)saved=String(v);}
  };
  try{run(()=>JSON.parse(saved));}
  finally{globalThis.localStorage=original;}
}

test('November 5 gross-as-net is corrected to broker net, preserving all trades and audit',()=>{
  const trades=[
    {symbol:'ELPW',shares:500,actualNet:4.73},
    {symbol:'ELPW',shares:200,actualNet:4.90},
    {symbol:'OMH',shares:100,actualNet:38.81}
  ];
  const initial={
    '2026-11-05':{
      brokerDailyNet:55,brokerDailyNetSource:'TRADEZERO_LIVE',
      trades,notes:'Stopped voluntarily',totalNet:50.5,
      compliance:{score:3},sessionScore:{score:5},
      liveRisk:{attempt:3,windowBreach:false,sessionEnded:true},
      journalSavedAt:'2026-11-05T16:00:00Z'
    }
  };
  withStorage(initial,read=>{
    R.sync();
    const day=read()['2026-11-05'];
    assert.equal(day.brokerDailyNet,48.44);
    assert.equal(day.brokerDailyGross,55);
    assert.equal(day.brokerDailyFees,6.56);
    assert.equal(day.brokerDailyNetSource,'TRADEZERO_EXECUTION_REPORT_2026-11-06');
    for(const field of ['trades','notes','totalNet','compliance','sessionScore','journalSavedAt'])
      assert.deepEqual(day[field],initial['2026-11-05'][field],field);
    // The normal daily sync enriches risk metadata; existing latch/evidence must survive.
    assert.equal(day.liveRisk.attempt,3);
    assert.equal(day.liveRisk.windowBreach,false);
    assert.equal(day.liveRisk.sessionEnded,true);
    assert.ok(day.liveRisk.maxAttemptReached <= 5);
    R.sync();
    assert.deepEqual(read()['2026-11-05'],day);
  });
});

test('all three November migrations apply independently',()=>{
  withStorage({
    '2026-11-03':{brokerDailyNet:137.67},
    '2026-11-04':{brokerDailyNet:109},
    '2026-11-05':{brokerDailyNet:55}
  },read=>{
    R.sync();
    assert.equal(read()['2026-11-03'].brokerDailyNet,129.49);
    assert.equal(read()['2026-11-04'].brokerDailyNet,104.21);
    assert.equal(read()['2026-11-05'].brokerDailyNet,48.44);
  });
});

test('reconciliation survives journal save, does not change unrelated or valid broker values',()=>{
  withStorage({},read=>{
    R.writeJournal({
      '2026-11-05':{brokerDailyNet:55,trades:[{symbol:'OMH'}]},
      '2026-11-06':{brokerDailyNet:75,notes:'no changes'},
      '2026-11-02':{brokerDailyNet:59.95}
    });
    assert.equal(read()['2026-11-05'].brokerDailyNet,48.44);
    assert.equal(read()['2026-11-06'].brokerDailyNet,75);
    assert.equal(read()['2026-11-06'].notes,'no changes');
    assert.equal(read()['2026-11-02'].brokerDailyNet,59.95);
  });
  withStorage({'2026-11-05':{brokerDailyNet:48.44,notes:'already reconciled'}},read=>{
    R.sync();
    assert.equal(read()['2026-11-05'].notes,'already reconciled');
    assert.equal(read()['2026-11-05'].brokerDailyNet,48.44);
  });
});

test('Review always selects finalized Nov 5 CSV net over stale saved live gross',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','calendar-2026.html'),'utf8');
  assert.match(src,/"2026-11-05":48\.44/);
  const fn=src.match(/function getDailyResult\([\s\S]*?\n\}/)?.[0]||'';
  assert.ok(fn.includes('if(date === "2026-11-05")'));
  assert.ok(fn.indexOf('if(date === "2026-11-05")') < fn.indexOf('record.brokerDailyNet'));
  assert.ok(fn.indexOf('record.brokerDailyNet') < fn.indexOf('tradingData[date]'));
});

test('Nov 5 repair fixes rounded, typed and alternate stored broker results',()=>{
  for(const stale of [55.0000000001,"55",50.5,48.44]){
    withStorage({'2026-11-05':{brokerDailyNet:stale,notes:'untouched',trades:[{symbol:'OMH'}]}},read=>{
      R.sync();
      const day=read()['2026-11-05'];
      assert.equal(day.brokerDailyNet,48.44);
      assert.equal(day.notes,'untouched');
      assert.deepEqual(day.trades,[{symbol:'OMH'}]);
      assert.equal(day.brokerDailyNetSource,'TRADEZERO_EXECUTION_REPORT_2026-11-06');
    });
  }
});
