const {test}=require('node:test');
const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const root=path.resolve(__dirname,'..'); const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pages=['live-risk.html','journal.html','compliance.html','calendar-2026.html'];
test('all core pages load shared policy and UI layers',()=>{for(const f of pages){const s=read(f);assert.match(s,/session-rules\.js\?v=4/);assert.match(s,/workflow-nav\.js\?v=5/);}});
test('all risk limits have one shared definition',()=>{const s=read('session-rules.js');for(const r of [/const START = 390/,/const END = 660/,/const WARNING = -75/,/const HARD_STOP = -100/,/const OBJECTIVE = 50/,/const MAX_ATTEMPTS = 5/])assert.match(s,r);});
test('shared layer covers closure, attempts and broker timing provenance',()=>{const s=read('workflow-nav.js');assert.match(s,/live\.windowBreach/);assert.match(s,/maxKnownAttempt/);assert.match(s,/brokerTimingReconciled === true/);});
