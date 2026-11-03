const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'tradezero-journal.js'),
  'utf8'
);

test('broker-confirmed attempts beyond five are preserved', () => {
  assert.match(source, /preferredIndex >= 0/);
  assert.doesNotMatch(source, /preferredIndex < MAX_ATTEMPTS/);
  assert.doesNotMatch(source, /existingDay\.trades\.slice\(0, MAX_ATTEMPTS\)/);
  assert.match(source, /attemptLimitBreach/);
});

test('breach trades render as audit-only journal entries', () => {
  assert.match(source, /BREACH ATTEMPT/);
  assert.match(source, /Recorded for audit\/review only/);
  assert.match(source, /does not create additional trading permission/);
  assert.match(source, /broker-breach-trade/);
});

test('manual journal save restores broker overflow evidence', () => {
  assert.match(source, /restoreOverflowAfterManualSave/);
  assert.match(source, /overflowCache/);
  assert.match(source, /feedNeedsMerge/);
});
