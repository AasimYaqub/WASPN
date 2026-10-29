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
  assert.match(source,/brokerDailyNet\s*=\s*Number\(evaluatedBroker\.dayRealized\)/);
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

test('Performance Review is year-aware at runtime', () => {
  const source = read('tradezero-live.js');
  assert.match(source,/installReviewYearAwareness/);
  assert.match(source,/let reviewYear = Number\(ny\.year\)/);
  assert.match(source,/reviewYear--/);
  assert.match(source,/reviewYear\+\+/);
  assert.match(source,/Year-to-Date/);
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

test('Journal risk guard does not construct a self-observing MutationObserver', () => {
  const source = read('workflow-nav.js');
  const start = source.indexOf('function applyJournalRiskGuard');
  const end = source.indexOf('function applyAttemptBreachDisplay');
  const body = source.slice(start,end);
  assert.doesNotMatch(body,/new\s+MutationObserver\s*\(/);
});

test('compliance auto-pass requires complete fresh broker history and timing provenance', () => {
  const source = read('workflow-nav.js');
  assert.match(source,/completeFresh/);
  assert.match(source,/brokerJournal\.complete === true/);
  assert.match(source,/brokerJournal\.dataFresh === true/);
  assert.match(source,/brokerTimingReconciled === true/);
});

test('Review strips broker timing claims and aggregate count without provenance', () => {
  const source = read('workflow-nav.js');
  assert.match(source,/Timing not broker-proven/);
  assert.match(source,/brokerTimingReconciled === true/);
  assert.match(source,/provenTimingCount/);
  assert.match(source,/label === ["']Broker Timing["']/);
});

test('Review actively syncs broker journal timing and refreshes the open day', () => {
  const source = read('workflow-nav.js');
  assert.match(source,/function applyReviewJournalSync/);
  assert.match(source,/tradezero-journal\.js\?v=4/);
  assert.match(source,/waspn:tradezero-journal-update/);
  assert.match(source,/activeReviewDate = date/);
  assert.match(source,/window\.showDetail\(activeReviewDate\)/);
});

test('Backup hardening is installed through session-rules, which Data Backup actually loads', () => {
  const rules = read('session-rules.js');
  const backup = read('data-backup.html');
  assert.match(backup,/session-rules\.js\?v=3/);
  assert.match(rules,/function validateBackupJournal/);
  assert.match(rules,/function isRealDateKey/);
  assert.match(rules,/Date\.UTC/);
  assert.match(rules,/Compliance score out of range/);
  assert.match(rules,/Process score out of range/);
  assert.match(rules,/root\.validateJournalObject = validateBackupJournal/);
});

test('hardening release bumps PWA cache', () => {
  const source = read('service-worker.js');
  assert.match(source,/waspn-pwa-v11/);
});


test('single-window release has no old split-window copy', () => {
  const files = ['index.html','live-risk.html','compliance.html','session-rules.js'];
  for(const file of files){
    const source = read(file);
    assert.doesNotMatch(source,/06:30–07:00 ET/);
    assert.doesNotMatch(source,/07:00–11:00 ET/);
    assert.doesNotMatch(source,/PRELIMINARY WINDOW|Preliminary 06:30/);
  }
  const rules = read('session-rules.js');
  assert.match(rules,/const START = 390/);
  assert.doesNotMatch(rules,/MAIN_START|PRELIM_START/);
});
