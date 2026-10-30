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

test('Review actively replaces stale pending timing for broker-proven trades', () => {
  const source = read('workflow-nav.js');
  assert.match(source,/card\.querySelectorAll\("\.timing-pending"\)\.forEach/);
  assert.match(source,/addTimingRow\("Entry Time", formatBrokerTime\(trade\.entryTime\)\)/);
  assert.match(source,/addTimingRow\("Exit Time", formatBrokerTime\(trade\.exitTime\)\)/);
  assert.match(source,/Broker timing reconciled/);
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
  assert.match(backup,/session-rules\.js\?v=4/);
  assert.match(rules,/function validateBackupJournal/);
  assert.match(rules,/function isRealDateKey/);
  assert.match(rules,/Date\.UTC/);
  assert.match(rules,/Compliance score out of range/);
  assert.match(rules,/Process score out of range/);
  assert.match(rules,/root\.validateJournalObject = validateBackupJournal/);
});

test('hardening release bumps PWA cache', () => {
  const source = read('service-worker.js');
  assert.match(source,/waspn-pwa-v15/);
});


test('Live Risk shows authoritative window and red active Risk nav theme', () => {
  const liveRisk = read('live-risk.html');
  const nav = read('workflow-nav.js');
  assert.match(liveRisk,/06:30–11:00 ET/);
  assert.doesNotMatch(liveRisk,/>\s*7–11 ET\s*</);
  assert.match(nav,/key:"risk",label:"Risk",icon:"1",href:"live-risk.html",color:"#ff5f6d"/);
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


test('policy display labels are shared and hydrated centrally', () => {
  assert.match(read('session-rules.js'),/function policyLabels\(\)/);
  assert.match(read('workflow-nav.js'),/function applyPolicyLabels/);
  assert.match(read('workflow-nav.js'),/WASPNSession\?\.policyLabels/);
});

test('PWA exposes build version and explicit update prompt', () => {
  const nav=read('workflow-nav.js'), sw=read('service-worker.js');
  assert.match(nav,/waspnBuildVersion/); assert.match(nav,/WASPN update ready • Refresh/);
  assert.match(sw,/WASPN_ACTIVATE_UPDATE/); assert.match(sw,/waspn-pwa-v15/);
});

test('broker authority state is visually explicit', () => {
  const nav=read('workflow-nav.js');
  assert.match(nav,/BROKER VERIFIED/); assert.match(nav,/BROKER DEGRADED \/ UNVERIFIED/);
});

test('legacy window and split terminology is absent from production frontend', () => {
  const files=fs.readdirSync(root).filter(name=>/\.(html|js)$/.test(name));
  const forbidden=[/7–11 ET/i,/06:30–07:00 ET/i,/07:00–11:00 ET/i,/PRELIMINARY WINDOW/i,/MAIN WINDOW/i];
  for(const file of files) for(const pattern of forbidden) assert.doesNotMatch(read(file),pattern,`${file} contains legacy rule copy`);
});

test('shared refresh plumbing is centralized', () => assert.match(read('workflow-nav.js'),/function onSharedRefresh/));


test('policy display labels are shared and hydrated centrally', () => {
  assert.match(read('session-rules.js'),/function policyLabels\(\)/);
  assert.match(read('workflow-nav.js'),/function applyPolicyLabels/);
  assert.match(read('workflow-nav.js'),/WASPNSession\?\.policyLabels/);
});

test('PWA exposes build version and explicit update prompt', () => {
  const nav=read('workflow-nav.js'), sw=read('service-worker.js');
  assert.match(nav,/waspnBuildVersion/); assert.match(nav,/WASPN update ready • Refresh/);
  assert.match(sw,/WASPN_ACTIVATE_UPDATE/); assert.match(sw,/waspn-pwa-v15/);
});

test('broker authority state is visually explicit', () => {
  const nav=read('workflow-nav.js');
  assert.match(nav,/BROKER VERIFIED/); assert.match(nav,/BROKER DEGRADED \/ UNVERIFIED/);
});

test('legacy window and split terminology is absent from production frontend', () => {
  const files=fs.readdirSync(root).filter(name=>/\.(html|js)$/.test(name));
  const forbidden=[/7–11 ET/i,/06:30–07:00 ET/i,/07:00–11:00 ET/i,/PRELIMINARY WINDOW/i,/MAIN WINDOW/i];
  for(const file of files) for(const pattern of forbidden) assert.doesNotMatch(read(file),pattern,`${file} contains legacy rule copy`);
});

test('shared refresh plumbing is centralized', () => assert.match(read('workflow-nav.js'),/function onSharedRefresh/));


test('Live Risk guardrail values are genuinely centered and non-wrapping on mobile', () => {
  const source = read('live-risk.html');
  assert.match(source,/\.guardrail\{[\s\S]*display:flex;[\s\S]*align-items:center;[\s\S]*justify-content:center;/);
  assert.match(source,/\.guardrail-value\{[\s\S]*display:flex;[\s\S]*justify-content:center;[\s\S]*text-align:center;[\s\S]*white-space:nowrap/);
  assert.match(source,/font-size:clamp\(10px,2\.7vw,13px\)/);
});

test('shared broker and update statuses are accessible live regions', () => {
  const source = read('workflow-nav.js');
  assert.match(source,/waspnBrokerState[\s\S]*aria-live/);
  assert.match(source,/waspnUpdatePrompt[\s\S]*aria-live/);
});
