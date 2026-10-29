const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const rules = read('session-rules.js');
const live = read('tradezero-live.js');
const journal = read('tradezero-journal.js');
const workflow = read('workflow-nav.js');
const worker = read('service-worker.js');

test('P&L threshold origins remain broker-authoritative', () => {
  assert.match(rules, /P&L risk thresholds are broker-authoritative/);
  assert.match(rules, /source:"TRADEZERO"/);
  assert.doesNotMatch(rules, /source:\s*usable\s*\?\s*["']TRADEZERO["']\s*:\s*["']JOURNAL["']/);
});

test('rejected stored tokens are replaced with a bounded retry', () => {
  assert.match(live, /ensureApiToken\(\{replaceExisting=false\}/);
  assert.match(live, /ensureApiToken\(\{replaceExisting:hadToken\}\)/);
  assert.match(live, /Retry exactly once/);
  assert.match(live, /await clearApiToken\(\)/);
});

test('trusted daily broker P&L is persisted with provenance', () => {
  assert.match(rules, /day\.brokerDailyNet\s*=\s*Number\(evaluatedBroker\.dayRealized\)/);
  assert.match(rules, /brokerDailyNetSource\s*=\s*"TRADEZERO_LIVE"/);
  assert.match(rules, /brokerDailyObservedAt/);
});

test('same-ticker broker reconciliation prefers attempt number before ticker fallback', () => {
  const attemptPos = journal.indexOf('const attemptNumber = Number(entry.attemptNumber)');
  const fallbackPos = journal.indexOf('// Ticker fallback is safe only when it identifies exactly one slot.');
  assert.ok(attemptPos >= 0 && fallbackPos > attemptPos);
});

test('compliance auto-pass requires complete fresh broker evidence and proven timing', () => {
  assert.match(workflow, /brokerJournal\.complete === true/);
  assert.match(workflow, /brokerJournal\.dataFresh === true/);
  assert.match(workflow, /brokerTimingReconciled === true/);
  assert.match(workflow, /attemptViolation:maxKnownAttempt > MAX_ATTEMPTS/);
});

test('review timing claims require broker provenance', () => {
  assert.match(workflow, /Timing not broker-proven/);
  assert.match(workflow, /trade\?\.brokerSourceId &&\s*trade\?\.brokerTimingReconciled === true/);
});

test('backup validator exposes readiness only after hardening is installed', () => {
  assert.match(workflow, /window\.validateJournalObject = hardenedValidateJournalObject/);
  assert.match(workflow, /window\.__WASPN_BACKUP_VALIDATION_HARDENED = true/);
});

test('PWA release cache is bumped for hardening release', () => {
  assert.match(worker, /"waspn-pwa-v9"/);
});

test('performance review includes year-aware runtime support', () => {
  assert.match(live, /YEAR-AWARE PERFORMANCE REVIEW/);
  assert.match(live, /reviewYear/);
});
