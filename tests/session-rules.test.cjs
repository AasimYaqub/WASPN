const {test} = require('node:test');
const assert = require('node:assert/strict');
const R = require('../session-rules.js');

const date = '2026-10-29';
const now = new Date(date + 'T12:00:00Z'); // 08:00 EDT
const broker = extra => ({
  tradeDate:date,
  usable:true,
  tradeZeroConnected:true,
  dataFresh:true,
  attempts:0,
  dayRealized:0,
  sessionClosed:false,
  hardStopReached:false,
  maxAttemptReached:false,
  outOfWindowEntryDetected:false,
  warningReached:false,
  ...extra
});
const evaluate = (live, extra={}) => R.evaluate(live, {date, now, ...extra});


test('single trading window constants are 06:30–11:00 ET', () => {
  assert.equal(R.START, 390);
  assert.equal(R.END, 660);
  assert.equal(Object.prototype.hasOwnProperty.call(R, 'PRELIM_START'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(R, 'MAIN_START'), false);
});

for(const [time,expected] of [
  ['06:29:59',false],
  ['06:30',true],
  ['06:59:59',true],
  ['07:00',true],
  ['08:59',true],
  ['09:00',true],
  ['10:59:59',true],
  ['11:00',false],
  ['23:59',false],
  ['24:00',null],
  ['07:99',null],
  ['bad',null],
  ['',null]
]){
  test('entry time ' + time, () => assert.equal(R.timeInsideWindow(time), expected));
}

for(const [utc,key] of [
  ['10:29:59','before'],
  ['10:30:00','window'],
  ['11:00:00','window'],
  ['14:59:59','window'],
  ['15:00:00','closed']
]){
  test('clock boundary ' + utc, () => assert.equal(R.clock(new Date(date + 'T' + utc + 'Z')).key, key));
}

test('winter and summer ET timestamps', () => {
  assert.equal(R.timeInsideWindow('2026-12-01T12:00:00Z'), true);
  assert.equal(R.timeInsideWindow('2026-07-01T10:30:00Z'), true);
  assert.equal(R.timeInsideWindow('2026-12-01T11:29:59Z'), false);
  assert.equal(R.clock(new Date('2026-12-01T12:00:00Z')).key, 'window');
});

test('objective alone does not close a session; backend sessionClosed is authoritative', () => {
  const live = evaluate({}, {broker:broker({dayRealized:50, objectiveReached:true})});
  assert.ok(!live.sessionEnded);
  evaluate(live, {broker:broker({sessionClosed:true})});
  assert.equal(live.sessionEnded, true);
});

for(const [label,evidence] of [
  ['backend closed',{sessionClosed:true}],
  ['checkpoint hard stop',{hardStopReached:true,dayRealized:0}],
  ['checkpoint attempts',{maxAttemptReached:true,attempts:0}],
  ['attempt five',{attempts:5}],
  ['hard stop',{dayRealized:-100}],
  ['window breach',{outOfWindowEntryDetected:true}]
]){
  test(label + ' persists through broker recovery and reset controls', () => {
    const live = evaluate({}, {broker:broker(evidence)});
    assert.equal(live.sessionEnded, true);
    evaluate(live, {broker:broker()});
    live.behaviouralLock = {active:false};
    live.lossWarning = null;
    evaluate(live);
    assert.equal(live.sessionEnded, true);
  });
}

test('11:00 closure stays latched if clock moves backwards', () => {
  const live = evaluate({}, {now:new Date(date + 'T15:00:00Z')});
  evaluate(live);
  assert.equal(live.sessionEnded, true);
});

test('warning cooldown triggers once from broker evidence and preserves reset gate behavior', () => {
  const live = evaluate({}, {broker:broker({dayRealized:-75})});
  assert.equal(live.lossWarning.until, now.getTime() + 300000);
  assert.equal(live.lossWarning.source, 'TRADEZERO');
  assert.ok(!live.sessionEnded);
  const until = live.lossWarning.until;
  evaluate(live, {now:new Date(now.getTime()+1000), broker:broker({dayRealized:-80})});
  assert.equal(live.lossWarning.until, until);
  live.lossWarning.active = false;
  live.lossWarning.resetGateRequired = false;
  evaluate(live, {broker:broker({dayRealized:-75})});
  assert.equal(live.lossWarning.active, false);
});

test('journal/manual P&L never originates broker risk thresholds', () => {
  const warning = evaluate({realisedPnl:-75});
  assert.equal(warning.warningReached, undefined);
  assert.equal(warning.lossWarning, undefined);
  assert.equal(warning.sessionEnded, undefined);

  const hard = evaluate({realisedPnl:-100});
  assert.equal(hard.hardStopReached, undefined);
  assert.equal(hard.sessionEnded, undefined);
});

test('same-day broker P&L originates warning and hard stop', () => {
  const warning = evaluate({}, {broker:broker({dayRealized:-75})});
  assert.equal(warning.warningReached, true);
  assert.equal(warning.lossWarning.source, 'TRADEZERO');

  const hard = evaluate({}, {broker:broker({dayRealized:-100})});
  assert.equal(hard.hardStopReached, true);
  assert.equal(hard.sessionEnded, true);
});

test('stale or another-day broker P&L cannot create a new threshold stop, but positive checkpoints can', () => {
  assert.ok(!evaluate({}, {broker:broker({usable:false,dataFresh:false,tradeZeroConnected:false,dayRealized:-100})}).sessionEnded);
  assert.ok(!evaluate({}, {broker:broker({tradeDate:'2026-10-28',hardStopReached:true,dayRealized:-100})}).sessionEnded);
  assert.equal(evaluate({}, {broker:broker({usable:false,dataFresh:false,tradeZeroConnected:false,hardStopReached:true})}).sessionEnded, true);
});

test('attempt count can close locally without using local P&L', () => {
  assert.equal(evaluate({attempt:5}).sessionEnded, true);
});

test('next-day state is independent and old records are not closed by today clock', () => {
  assert.ok(!R.evaluate({}, {date:'2026-10-28',now:new Date(date + 'T20:00:00Z')}).sessionEnded);
  assert.ok(!R.evaluate({}, {date:'2026-10-30',now:new Date('2026-10-30T12:00:00Z')}).sessionEnded);
});

test('daily stop survives journal replacement', () => {
  delete require.cache[require.resolve('../session-rules.js')];
  const Rules = require('../session-rules.js');
  const today = Rules.nyParts().date;
  const map = new Map();
  globalThis.localStorage = {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
  const write = data => globalThis.localStorage.setItem('waspnJournalV2', JSON.stringify(data));

  write({[today]:{liveRisk:{sessionEnded:true,windowBreach:true,maxAttemptReached:5}}});
  Rules.writeJournal({'2020-01-01':{notes:'restored'}});
  const saved = JSON.parse(map.get('waspnJournalV2'));
  assert.equal(saved[today].liveRisk.sessionEnded, true);
  assert.equal(saved[today].liveRisk.windowBreach, true);
  assert.equal(saved['2020-01-01'].notes, 'restored');
});

test('raw broker timings confirm breaches; manual/unknown timings do not', () => {
  assert.ok(!R.confirmBrokerEntries({}, [{entryTime:'05:00'}]).windowBreach);
  assert.ok(!R.confirmBrokerEntries({}, [{sourceId:'synthetic',entryTime:'unknown'}]).windowBreach);
  assert.equal(R.confirmBrokerEntries({}, [{sourceId:'synthetic',entryTime:'05:00'}]).windowBreach, true);
});

test('same-day checkpoint stops remain authoritative with disconnected/stale broker data', () => {
  for(const flag of ['sessionClosed','hardStopReached','maxAttemptReached','outOfWindowEntryDetected']){
    const live = evaluate({}, {broker:broker({usable:false,dataFresh:false,tradeZeroConnected:false,[flag]:true})});
    assert.equal(live.sessionEnded, true, flag);
  }
});

test('attempt count cannot regress on lower or stale responses', () => {
  const live = evaluate({}, {broker:broker({attempts:4})});
  evaluate(live, {broker:broker({attempts:1})});
  assert.equal(live.maxAttemptReached, 4);
  evaluate(live, {broker:broker({usable:false,dataFresh:false,attempts:0})});
  assert.equal(live.maxAttemptReached, 4);
});

test('attempts above five remain visible as the actual proven count', () => {
  const live = evaluate({}, {broker:broker({attempts:6,maxAttemptReached:true})});
  assert.equal(live.maxAttemptReached, 6);
  assert.equal(live.sessionEnded, true);
});

test('dated stale attempt checkpoints are a lower bound, never permission to reopen', () => {
  const live = evaluate({}, {broker:broker({usable:false,dataFresh:false,attempts:3})});
  assert.equal(live.maxAttemptReached, 3);
  evaluate(live, {broker:broker({usable:false,dataFresh:false,attempts:1})});
  assert.equal(live.maxAttemptReached, 3);
  evaluate(live, {broker:broker({usable:false,dataFresh:false,attempts:5})});
  assert.equal(live.sessionEnded, true);
});

test('later broker evidence invalidates conflicting saved structural compliance', () => {
  const day = {
    compliance:{window:true,attempts:true,stop:true,score:3},
    sessionScore:{
      score:5,
      answers:{
        insideWindow:true,
        stoppedByFive:true,
        respectedHardStop:true,
        noRevengeContinuation:true,
        noTiltTrade:true
      }
    }
  };

  const changed = R.invalidateConflictingReviews(
    day,
    {windowBreach:true,attempt:6,maxAttemptReached:6}
  );

  assert.equal(changed, true);
  assert.equal(day.compliance.window, false);
  assert.equal(day.compliance.attempts, false);
  assert.equal(day.compliance.score, 1);
  assert.equal(day.sessionScore.answers.insideWindow, false);
  assert.equal(day.sessionScore.answers.stoppedByFive, false);
  assert.equal(day.sessionScore.score, 3);
  assert.match(day.reviewInvalidatedReason, /WINDOW_BREACH/);
  assert.match(day.reviewInvalidatedReason, /ATTEMPT_LIMIT_BREACH/);
});
