const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

test('Home and Live Risk redundant blue CTAs stay hidden in favour of bottom navigation', () => {
  const theme = read('premium-theme.css');
  assert.match(theme,/\.primary-action,\.journal-action\{display:none!important\}/);
});
