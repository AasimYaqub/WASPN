const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'review-broker-indicators.js'),
  'utf8'
);

test('Journal Net includes broker-confirmed attempts beyond five', () => {
  assert.match(source, /function brokerOverflowNet\(date\)/);
  assert.match(source, /index >= 5/);
  assert.match(source, /brokerSourceId/);
  assert.match(source, /function journalDisplayTotal\(date\)/);
});

test('saving the Journal persists the all-trades total after overflow restoration', () => {
  assert.match(source, /function persistJournalTotal\(date,total\)/);
  assert.match(source, /day\.totalNet = total/);
  assert.match(source, /saveBtn/);
  assert.match(source, /setTimeout\(\(\) => syncJournalTotal\(true\),25\)/);
});
