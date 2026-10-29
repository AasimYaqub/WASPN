const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

test('shared policy does not use Journal P&L as a loss-threshold source', () => {
  const source = read('session-rules.js');
  assert.match(source,/P&L risk thresholds are broker-authoritative/);
  assert.doesNotMatch(source,/source\s*:\s*usable\s*\?\s*["']TRADEZERO["']\s*:\s*["']JOURNAL["']/);
  assert.match(source,/source:\s*["']TRADEZERO["']/);
});

test('daily broker P&L is persisted with provenance', () => {
  const source = read('session-rules.js');
  assert.match(source,/brokerDailyNet\s*=\s*value/);
  assert.match(source,/brokerDailyNetSource\s*=\s*["']TRADEZERO_LIVE["']/);
  assert.match(source,/brokerDailyObservedAt/);
});

test('stale saved structural compliance is invalidated by later evidence', () => {
  const source = read('session-rules.js');
  assert.match(source,/invalidateConflictingReviews/);
  assert.match(source,/ATTEMPT_LIMIT_BREACH/);
  assert.match(source,/WINDOW_BREACH/);
});

test('401 auth recovery clears rejected tokens and bounds retry', () => {
  const source = read('tradezero-live.js');
  assert.match(source,/replaceExisting/);
  assert.match(source,/clearApiToken/);
  assert.match(source,/Retry exactly once/);
  assert.match(source,/response\.status === 401/);
});

test('journal reconciliation prioritizes broker attempt slot before ticker fallback', () => {
  const source = read('tradezero-journal.js');
  const preferred = source.indexOf('const preferredIndex');
  const fallback = source.indexOf('const matchingManual');
  assert.ok(preferred >= 0 && fallback >= 0 && preferred < fallback);
  assert.match(source,/matchingManual\.length === 1/);
});

test('broker timing carries explicit provenance', () => {
  const source = read('tradezero-journal.js');
  assert.match(source,/brokerTimingReconciled/);
  assert.match(source,/brokerSourceId/);
});

test('cross-page hardening removes local P&L from Journal risk badge logic', () => {
  const source = read('workflow-nav.js');
  const start = source.indexOf('function correctJournalRiskDisplay');
  const end = source.indexOf('function applyJournalRiskGuard');
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start,end);
  assert.doesNotMatch(body,/realisedPnl\s*<=\s*-?100/);
  assert.doesNotMatch(body,/realisedPnl\s*<=\s*-?75/);
  assert.match(body,/live\.warningReached/);
});

test('compliance auto-pass requires complete fresh broker history', () => {
  const source = read('workflow-nav.js');
  assert.match(source,/completeFresh/);
  assert.match(source,/brokerJournal\.complete === true/);
  assert.match(source,/brokerJournal\.dataFresh === true/);
  assert.match(source,/brokerSourceId/);
});

test('Review strips broker timing claims without broker provenance', () => {
  const source = read('workflow-nav.js');
  assert.match(source,/Timing not broker-proven/);
  assert.match(source,/brokerTimingReconciled === true/);
});

test('backup validation checks real calendar dates and nested records', () => {
  const source = read('workflow-nav.js');
  assert.match(source,/validDateKey/);
  assert.match(source,/Date\.UTC/);
  assert.match(source,/validateTrade/);
  assert.match(source,/Compliance score out of range/);
  assert.match(source,/Process score out of range/);
});

test('hardening release bumps PWA cache', () => {
  const source = read('service-worker.js');
  assert.match(source,/waspn-pwa-v9/);
});
