const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const journalKey = 'waspnJournalV2';
const source = fs.readFileSync(path.join(__dirname, '..', 'calendar-2026.html'), 'utf8');
const R = require('../session-rules.js');

function fakeStorage(journal){
  const store = new Map([[journalKey,JSON.stringify(journal)]]);
  return {
    getItem:key => store.get(key) ?? null,
    setItem:(key,value) => store.set(key, String(value)),
    read:() => JSON.parse(store.get(journalKey))
  };
}

test('3 Nov TradeZero CSV correction updates stale gross-as-net, preserving all six trades and breaches', () => {
  const attempts = Array.from({length:6}, (_,i) => ({sourceId:'trade-'+(i+1),symbol:i===5?'PARA':'RDAC'}));
  const historical = {
    '2026-11-03':{
      date:'2026-11-03',brokerDailyNet:137.67,brokerDailyNetSource:'TRADEZERO_LIVE',
      trades:attempts,totalNet:16.13,notes:'Keep the setup comments',
      liveRisk:{sessionEnded:true,windowBreach:true,maxAttemptReached:6}
    }
  };
  const storage = fakeStorage(historical);
  const savedStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  try{
    R.sync();
    const day = storage.read()['2026-11-03'];
    assert.equal(day.brokerDailyNet,129.49);
    assert.equal(day.brokerDailyGross,137.67);
    assert.equal(day.brokerDailyFees,8.18);
    assert.equal(day.brokerDailyNetSource,'TRADEZERO_EXECUTION_CSV_2026-11-04');
    assert.deepEqual(day.trades,attempts);
    assert.equal(day.totalNet,16.13);
    assert.equal(day.notes,'Keep the setup comments');
    assert.deepEqual(day.liveRisk,historical['2026-11-03'].liveRisk);
  } finally {
    globalThis.localStorage = savedStorage;
  }
});

test('journal saves cannot reintroduce stale 3 Nov gross net, and other days are unchanged', () => {
  const storage = fakeStorage({});
  const savedStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  try{
    R.writeJournal({
      '2026-11-03':{date:'2026-11-03',brokerDailyNet:137.67,trades:[{symbol:'RDAC'}]},
      '2026-11-02':{date:'2026-11-02',brokerDailyNet:59.95,notes:'untouched'}
    });
    const all = storage.read();
    assert.equal(all['2026-11-03'].brokerDailyNet,129.49);
    assert.equal(all['2026-11-02'].brokerDailyNet,59.95);
    assert.equal(all['2026-11-02'].notes,'untouched');
  } finally {
    globalThis.localStorage = savedStorage;
  }
});

test('Review includes verified 3 Nov net as fallback when saved record is unavailable', () => {
  assert.match(source, /"2026-11-03":129\.49/);
  const fn = source.match(/function getDailyResult\([\s\S]*?\n\}/)?.[0] || '';
  assert.ok(fn.indexOf('record.brokerDailyNet') < fn.indexOf('tradingData[date]'));
});
