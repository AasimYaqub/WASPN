"""WASPN frontend browser regressions.

Run a local server first, for example:
  python3 -m http.server 8000 --bind 127.0.0.1 --directory .

Then:
  python3 -u tests/frontend-smoke.py

Set CHROMIUM_PATH for a system Chromium binary when desired. Otherwise the
Playwright-managed Chromium installation is used.
"""

import datetime
import json
import os
import sys
from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=10000)
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/'
DATE = '2026-10-29'

with sync_playwright() as p:
    launch = dict(headless=True, args=['--no-sandbox'])
    chromium_path = os.environ.get('CHROMIUM_PATH')
    if chromium_path:
        launch['executable_path'] = chromium_path

    browser = p.chromium.launch(**launch)

    context = browser.new_context(service_workers='block', accept_downloads=True)
    payload = dict(
        tradeDate=DATE,
        tradeZeroConnected=True,
        dataFresh=True,
        attempts=0,
        dayRealized=0,
        sessionClosed=False,
        hardStopReached=False,
        maxAttemptReached=False,
        outOfWindowEntryDetected=False,
        warningReached=False,
        objectiveReached=False,
    )
    journal_feed = dict(
        tradeDate=DATE,
        currency='USD',
        entries=[],
        complete=True,
        dataFresh=True,
        diagnostics=[],
    )

    def api(route):
        body = dict(payload) if 'live-status' in route.request.url else dict(journal_feed)
        route.fulfill(json=body, headers={'Access-Control-Allow-Origin':'*'})

    context.route('https://wasp-backend-api.replit.app/**', api)
    page = context.new_page()
    page.clock.install(time=datetime.datetime.fromisoformat(DATE + 'T12:00:00+00:00'))
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())

    def go(name, target=None):
        target_page = target or page
        response = target_page.goto(
            BASE + name,
            wait_until='domcontentloaded',
            timeout=15000,
        )
        assert response is not None and response.status == 200, (name, response.status if response else None)
        return response

    for name in [
        'index.html',
        'live-risk.html',
        'journal.html',
        'compliance.html',
        'calendar-2026.html',
        'data-backup.html',
    ]:
        go(name)

    assert not errors, errors
    print('PASS: six pages reach DOM readiness without JavaScript exceptions')

    # Main window and informational objective.
    go('live-risk.html')
    page.evaluate('WASPNTradeZero.refresh()')
    assert page.locator('#statusTitle').inner_text() == 'WITHIN WASPN'

    payload.update(dayRealized=50, objectiveReached=True)
    page.evaluate('WASPNTradeZero.refresh()')
    assert page.locator('#statusTitle').inner_text() == 'WITHIN WASPN'
    print('PASS: 08:00 main window active; +$50 objective alone does not close session')

    # Trustworthy daily broker P&L is persisted for Review after rollover.
    payload.update(dayRealized=29.01, objectiveReached=False)
    page.evaluate('WASPNTradeZero.refresh()')
    persisted = page.evaluate('''() => {
      const day = JSON.parse(localStorage.getItem('waspnJournalV2'))['2026-10-29'];
      return [day.brokerDailyNet, day.brokerDailyNetSource, Boolean(day.brokerDailyObservedAt)];
    }''')
    assert persisted == [29.01, 'TRADEZERO_LIVE', True], persisted
    print('PASS: trustworthy TradeZero daily P&L persists with provenance')

    # Attempt high-water cannot regress and >5 is displayed explicitly.
    payload.update(attempts=3)
    page.evaluate('WASPNTradeZero.refresh()')
    assert page.locator('#attempt').inner_text().strip() == '3'
    payload.update(attempts=1)
    page.evaluate('WASPNTradeZero.refresh()')
    assert page.locator('#attempt').inner_text().strip() == '3'

    payload.update(attempts=6, maxAttemptReached=True)
    page.evaluate('WASPNTradeZero.refresh()')
    page.wait_for_timeout(50)
    assert page.locator('#attempt').inner_text().strip() == '6'
    assert 'ATTEMPT LIMIT BREACH' in page.locator('#statusTitle').inner_text()
    print('PASS: attempt high-water survives lower responses and sixth attempt is explicit')

    # Fresh context for warning cooldown tests.
    context.close()
    context = browser.new_context(service_workers='block')
    context.route('https://wasp-backend-api.replit.app/**', api)
    page = context.new_page()
    page.clock.install(time=datetime.datetime.fromisoformat(DATE + 'T12:00:00+00:00'))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    payload.update(attempts=0, maxAttemptReached=False, dayRealized=-75)

    go('live-risk.html')
    page.evaluate('WASPNTradeZero.refresh()')
    page.wait_for_function('getLiveState().lossWarning?.active === true')
    expect(page.locator('#statusTitle')).to_contain_text('COOLDOWN')
    assert page.evaluate('getLiveState().lossWarning.until - getLiveState().lossWarning.startedAt') == 300000
    assert page.evaluate('getLiveState().lossWarning.source') == 'TRADEZERO'
    page.clock.fast_forward(300001)
    expect(page.locator('#statusTitle')).to_have_text('RESET GATE REQUIRED')
    for name in ['gate1','gate2','gate3','gate4','gate5']:
        page.locator(f'input[name="{name}"][value="safe"] + span').click()
    page.locator('#clearBehaviourLockBtn').click()
    expect(page.locator('#statusTitle')).to_have_text('-$75 WARNING ACTIVE')
    print('PASS: broker -$75 warning uses five-minute cooldown and reset gate')

    # Window breach remains sticky.
    payload.update(dayRealized=0, outOfWindowEntryDetected=True)
    page.evaluate('WASPNTradeZero.refresh()')
    assert 'WINDOW BREACH' in page.locator('#statusTitle').inner_text()
    payload['outOfWindowEntryDetected'] = False
    page.reload(wait_until='domcontentloaded')
    page.evaluate('WASPNTradeZero.refresh()')
    assert 'WINDOW BREACH' in page.locator('#statusTitle').inner_text()
    go('index.html')
    assert 'WINDOW BREACH' in page.locator('#marketMain').inner_text()
    print('PASS: confirmed window breach survives false later poll, reload and navigation')

    # Repeated ticker mapping follows broker attempt number before ticker fallback.
    payload.update(outOfWindowEntryDetected=False)
    go('journal.html')
    repeated_index = page.evaluate('''() => WASPNTradeZeroJournal.findTradeIndex(
      [{ticker:'CHSN'},{ticker:'CHSN'}],
      {sourceId:'cycle-2',symbol:'CHSN',attemptNumber:2}
    )''')
    assert repeated_index == 1, repeated_index
    print('PASS: repeated ticker reconciliation follows broker attempt slot')

    # Compliance Q1 cannot auto-pass partial history, and later objective evidence invalidates saved answers.
    page.evaluate('''() => {
      const store = JSON.parse(localStorage.getItem('waspnJournalV2') || '{}');
      store['2026-10-29'] = {
        date:'2026-10-29',
        trades:[{ticker:'TEST',brokerSourceId:'x',brokerTimingReconciled:true,entryTime:'07:15',exitTime:'07:16'}],
        brokerJournal:{source:'TRADEZERO',complete:false,dataFresh:true,entryCount:1,provenAttemptCount:1},
        liveRisk:{attempt:1,maxAttemptReached:1},
        compliance:{window:true,attempts:true,stop:true,score:3},
        sessionScore:{score:5,answers:{insideWindow:true,stoppedByFive:true,respectedHardStop:true,noRevengeContinuation:true,noTiltTrade:true}}
      };
      localStorage.setItem('waspnJournalV2',JSON.stringify(store));
    }''')
    go('compliance.html')
    page.wait_for_timeout(50)
    assert not page.locator('#auto1').evaluate('(el) => el.classList.contains("show")')
    print('PASS: partial broker history does not auto-certify trading-window compliance')

    page.evaluate('''() => {
      const store = JSON.parse(localStorage.getItem('waspnJournalV2'));
      store['2026-10-29'].liveRisk = {attempt:6,maxAttemptReached:6,windowBreach:true,sessionEnded:true};
      localStorage.setItem('waspnJournalV2',JSON.stringify(store));
      WASPNSession.sync();
    }''')
    page.reload(wait_until='domcontentloaded')
    assert not page.locator('#q1').is_checked()
    assert not page.locator('#q2').is_checked()
    saved_scores = page.evaluate('''() => {
      const day = JSON.parse(localStorage.getItem('waspnJournalV2'))['2026-10-29'];
      return [day.compliance.score,day.sessionScore.score,day.sessionScore.answers.insideWindow,day.sessionScore.answers.stoppedByFive];
    }''')
    assert saved_scores == [1,3,False,False], saved_scores
    print('PASS: later broker evidence invalidates conflicting saved structural compliance')

    # Review timing claims and aggregate counts require broker provenance.
    page.evaluate('''() => {
      const store = JSON.parse(localStorage.getItem('waspnJournalV2'));
      store['2026-10-29'].trades = [{ticker:'LEGACY',entryTime:'07:15',exitTime:'07:16',netPnl:1}];
      localStorage.setItem('waspnJournalV2',JSON.stringify(store));
    }''')
    go('calendar-2026.html')
    page.evaluate("showDetail('2026-10-29')")
    page.wait_for_timeout(50)
    detail_text = page.locator('#detail').inner_text()
    assert 'Broker timing reconciled' not in detail_text
    assert 'Timing not broker-proven' in detail_text
    broker_timing_value = page.locator('.detail-item').filter(has_text='Broker Timing').locator('.detail-value').inner_text()
    assert broker_timing_value == '0/1', broker_timing_value
    print('PASS: Review timing labels and aggregate count require broker provenance')

    # Hardened backup validator rejects impossible dates and malformed nested data.
    go('data-backup.html')
    bad_date = page.evaluate('''() => {
      try { validateJournalObject({'2026-02-31':{date:'2026-02-31'}}); return false; }
      catch { return true; }
    }''')
    bad_score = page.evaluate('''() => {
      try { validateJournalObject({'2026-10-29':{date:'2026-10-29',compliance:{score:9}}}); return false; }
      catch { return true; }
    }''')
    assert bad_date and bad_score
    print('PASS: backup validation rejects impossible dates and invalid nested scores')

    assert not errors, errors
    context.close()

    # Unauthenticated backend never shows open trading permission.
    c = browser.new_context(service_workers='block')
    q = c.new_page()
    q.clock.install(time=datetime.datetime.fromisoformat(DATE + 'T12:00:00+00:00'))
    c.route('https://wasp-backend-api.replit.app/**', lambda route: route.fulfill(status=401, body='Unauthorized'))
    q.on('dialog', lambda d: d.dismiss())
    go('live-risk.html', q)
    q.evaluate('void WASPNTradeZero.refresh()')
    assert q.locator('#statusTitle').inner_text() == 'BACKEND VERIFICATION REQUIRED'
    go('index.html', q)
    assert q.locator('#marketMain').inner_text() == 'BACKEND VERIFICATION REQUIRED'
    c.close()
    print('PASS: missing auth never shows an open session')

    # Real service worker token protocol and offline shell.
    context = browser.new_context()
    page = context.new_page()
    go('index.html')
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller?.state === "activated"')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('navigator.serviceWorker.controller !== null')

    result = page.evaluate('''async () => {
      const send = (data, expected) => new Promise(resolve => {
        const listener = e => {
          if(e.data?.type === expected){
            navigator.serviceWorker.removeEventListener('message',listener);
            resolve(e.data);
          }
        };
        navigator.serviceWorker.addEventListener('message',listener);
        navigator.serviceWorker.controller.postMessage(data);
      });
      await send({type:'WASPN_SET_API_TOKEN',token:'synthetic-smoke-placeholder'},'WASPN_API_TOKEN_SAVED');
      const status = await send({type:'WASPN_CHECK_API_TOKEN'},'WASPN_API_TOKEN_STATUS');
      await send({type:'WASPN_CLEAR_API_TOKEN'},'WASPN_API_TOKEN_CLEARED');
      return status;
    }''')
    assert result.get('configured') is True, result
    print('PASS: real service-worker token save/check/clear protocol')

    context.set_offline(True)
    for name in ['index.html','live-risk.html','journal.html','compliance.html','calendar-2026.html','data-backup.html']:
        response = page.goto(BASE + name, wait_until='domcontentloaded', timeout=15000)
        assert response is not None and response.status == 200
    assert page.evaluate('typeof WASPNSession.clock') == 'function'
    print('PASS: all six pages and shared rules available offline through PWA cache')

    browser.close()
