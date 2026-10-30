const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

test('Review Today outline remains visible through premium theme overrides', () => {
  const css = read('review-indicators.css');
  assert.match(css,/\.day\.today/);
  assert.match(css,/border:2px solid var\(--blue,#22c7ff\)!important/);
  assert.match(css,/box-shadow:[\s\S]*!important/);
});

test('Review indicator rules are date-generic and keep the active WASPN record dot', () => {
  const source = read('review-broker-indicators.js');
  assert.match(source,/function getNewYorkDateKey\(\)/);
  assert.match(source,/timeZone:"America\/New_York"/);
  assert.match(source,/function shouldShowWaspnDot\(date,day,today\)/);
  assert.match(source,/if\(date === today\) return true/);
  assert.match(source,/return !isBrokerReconciled\(day\)/);
  assert.match(source,/cell\.classList\.toggle\("today",date === today\)/);
  assert.match(source,/cell\.classList\.toggle\([\s\S]*"saved-day"[\s\S]*shouldShowWaspnDot\(date,journal\[date\],today\)/);
});

test('historical broker-reconciled dates are the only WASPN dots cleared', () => {
  const source = read('review-broker-indicators.js');
  assert.match(source,/brokerDailyNet/);
  assert.match(source,/brokerJournal\?\.source === "TRADEZERO"/);
  assert.match(source,/trade\?\.brokerSource === "TRADEZERO"/);
  assert.match(source,/Boolean\(trade\?\.brokerSourceId\)/);
});

test('Review indicator assets are versioned and injected by the service worker', () => {
  const source = read('service-worker.js');
  assert.match(source,/review-indicators\.css\?v=1/);
  assert.match(source,/review-broker-indicators\.js\?v=2/);
  assert.match(source,/hasReviewIndicatorStyles/);
  assert.match(source,/oldIndicator/);
});
