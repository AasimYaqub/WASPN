const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'calendar-2026.html'), 'utf8');
const block = source.match(/const tradingData = \{([\s\S]*?)\n\};/);
assert.ok(block, 'Review historical P&L source must exist');
const values = Object.fromEntries([...block[1].matchAll(/"(2026-\d\d-\d\d)":(-?\d+(?:\.\d+)?)/g)].map(match => [match[1], Number(match[2])]));

test('confirmed October 26–30 executions restore daily net proceeds', () => {
  const expected = {'2026-10-26':-17.86,'2026-10-27':64.33,'2026-10-28':-179.18,'2026-10-29':24.22,'2026-10-30':-31.87};
  for(const [date, pnl] of Object.entries(expected)) assert.equal(values[date], pnl, date);
  assert.equal(Math.round(Object.values(expected).reduce((a,b)=>a+b,0)*100)/100, -140.36);
});

test('no executions are invented for September 28–29 or October 16', () => {
  for(const date of ['2026-09-28','2026-09-29','2026-10-16']) assert.equal(Object.hasOwn(values,date), false, date);
});

test('saved broker and journal records retain priority over fallback history', () => {
  assert.match(source, /record\.brokerDailyNet/);
  assert.match(source, /tradingData\[date\]/);
  assert.match(source, /record\.totalNet/);
  const fn = source.match(/function getDailyResult\([\s\S]*?\n\}/)?.[0] || '';
  assert.ok(fn.indexOf('record.brokerDailyNet') < fn.indexOf('tradingData[date]'));
  assert.ok(fn.indexOf('tradingData[date]') < fn.indexOf('record.totalNet'));
});
