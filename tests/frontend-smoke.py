"""Run against python3 -m http.server 8000 --directory /workspace/WASPN.
Uses isolated browser profiles and synthetic read-only API responses.
"""
import json
import sys
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=10000)
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/'
DATE = '2026-10-29'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(service_workers='block', accept_downloads=True)
    payload = dict(tradeDate=DATE, tradeZeroConnected=True, dataFresh=True, attempts=0, dayRealized=0, sessionClosed=False, hardStopReached=False, maxAttemptReached=False, outOfWindowEntryDetected=False)
    def api(route):
        body = dict(payload) if 'live-status' in route.request.url else dict(tradeDate=DATE, entries=[], complete=False, dataFresh=True)
        route.fulfill(json=body, headers={'Access-Control-Allow-Origin':'*'})
    context.route('https://wasp-backend-api.replit.app/**', api)
    page = context.new_page()
    page.clock.install(time=__import__('datetime').datetime.fromisoformat(DATE+'T12:00:00+00:00'))
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    for name in ['index.html','live-risk.html','journal.html','compliance.html','calendar-2026.html','data-backup.html']:
        assert page.goto(BASE+name).status == 200
    assert not errors, errors
    print('PASS: six pages load without JavaScript exceptions')
    page.goto(BASE+'live-risk.html')
    page.evaluate('WASPNTradeZero.refresh()')
    assert page.locator('#statusTitle').inner_text() == 'WITHIN WASPN'
    payload.update(dayRealized=50, objectiveReached=True, sessionClosed=False)
    page.evaluate('WASPNTradeZero.refresh()')
    assert page.locator('#statusTitle').inner_text() == 'WITHIN WASPN'
    print('PASS: 08:00 main window active; +$50 objective alone does not close session')
    payload.update(attempts=3)
    page.evaluate('WASPNTradeZero.refresh()')
    assert page.locator('#attempt').inner_text().strip() == '3'
    page.evaluate('localStorage.clear(); render()')
    assert page.locator('#attempt').inner_text().strip() == '3'
    payload.update(attempts=1)
    page.evaluate('WASPNTradeZero.refresh()')
    assert page.locator('#attempt').inner_text().strip() == '3'
    page.reload()
    assert page.locator('#statusTitle').inner_text() in ['BACKEND VERIFICATION REQUIRED','WITHIN WASPN']
    page.evaluate('WASPNTradeZero.refresh()')
    assert page.locator('#attempt').inner_text().strip() == '3'
    print('PASS: attempt high-water survives clearing, lower responses and reload')
    payload.update(dayRealized=-75, objectiveReached=False, sessionClosed=False)
    page.evaluate('WASPNTradeZero.refresh()')
    page.wait_for_function('getLiveState().lossWarning?.active === true')
    expect(page.locator('#statusTitle')).to_contain_text('COOLDOWN')
    assert page.evaluate('getLiveState().lossWarning.until - getLiveState().lossWarning.startedAt') == 300000
    assert page.evaluate('''() => {
      const live = getLiveState(), until = live.lossWarning.until, original = Date.now;
      try {
        Date.now = () => until - 1; updateLossCooldown(live);
        const before = live.lossWarning.active;
        Date.now = () => until; updateLossCooldown(live);
        return [before,live.lossWarning.active,live.lossWarning.resetGateRequired];
      } finally { Date.now = original; }
    }''') == [True,False,True]
    page.clock.fast_forward(300001)
    expect(page.locator('#statusTitle')).to_have_text('RESET GATE REQUIRED')
    for name in ['gate1','gate2','gate3','gate4','gate5']:
        page.locator(f'input[name="{name}"][value="safe"] + span').click()
    page.locator('#clearBehaviourLockBtn').click()
    expect(page.locator('#statusTitle')).to_have_text('-$75 WARNING ACTIVE')
    print('PASS: five-minute loss cooldown and reset gate complete without retrigger')
    payload.update(dayRealized=0, outOfWindowEntryDetected=True)
    page.evaluate('WASPNTradeZero.refresh()')
    assert 'WINDOW BREACH' in page.locator('#statusTitle').inner_text()
    assert page.locator('#waspnWindowBreachNote').count() == 0
    assert page.get_by_text('WINDOW BREACH', exact=False).count() == 1
    payload['outOfWindowEntryDetected'] = False
    page.reload()
    page.evaluate('WASPNTradeZero.refresh()')
    assert 'WINDOW BREACH' in page.locator('#statusTitle').inner_text()
    assert page.locator('#waspnWindowBreachNote').count() == 0
    assert page.get_by_text('WINDOW BREACH', exact=False).count() == 1
    page.goto(BASE+'index.html')
    assert 'WINDOW BREACH' in page.locator('#marketMain').inner_text()
    print('PASS: confirmed breach survives false broker poll, reload and navigation')
    page.goto(BASE+'journal.html')
    for key,value in dict(tradeDate=DATE,startValue='10000',ticker1='TEST',entryPrice1='10',exitPrice1='11',shares1='100',fees1='1',setupReason1='Smoke test').items():
        page.locator('#'+key).fill(value)
    page.locator('#saveBtn').click()
    page.reload()
    assert page.locator('#ticker1').input_value() == 'TEST'
    page.goto(BASE+'data-backup.html')
    with page.expect_download() as event: page.locator('#exportBtn').click()
    data = json.load(open(event.value.path()))
    assert data['data'][DATE]['liveRisk']['windowBreach'] is True
    page.locator('#fileInput').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
    expect(page.locator('#mergeBtn')).to_be_enabled()
    page.locator('#mergeBtn').click()
    assert page.evaluate('WASPNSession.sync().windowBreach')
    assert page.evaluate('JSON.parse(localStorage.getItem("waspnEstimatedFeesV1"))')
    print('PASS: journal, estimated fees and backup round trip retain daily breach')
    page.goto(BASE+'journal.html')
    page.locator('#deleteBtn').click()
    assert page.evaluate('WASPNSession.sync().sessionEnded')
    print('PASS: deleting journal cannot reopen today')
    assert not errors, errors
    context.close()
    for flag in ['sessionClosed','hardStopReached','maxAttemptReached','outOfWindowEntryDetected']:
        c = browser.new_context(service_workers='block')
        q = c.new_page()
        q.clock.install(time=__import__('datetime').datetime.fromisoformat(DATE+'T12:00:00+00:00'))
        checkpoint = dict(tradeDate=DATE, tradeZeroConnected=False, dataFresh=False, attempts=0, dayRealized=50, **{flag:True})
        c.route('https://wasp-backend-api.replit.app/**', lambda route: route.fulfill(json=checkpoint, headers={'Access-Control-Allow-Origin':'*'}))
        q.goto(BASE+'live-risk.html')
        assert q.locator('#statusTitle').inner_text() != 'WITHIN WASPN'
        q.evaluate('WASPNTradeZero.refresh()')
        assert q.evaluate('WASPNSession.sync().sessionEnded') is True
        assert q.locator('#statusTitle').inner_text() != 'WITHIN WASPN'
        q.evaluate('localStorage.clear(); render()')
        assert q.evaluate('WASPNSession.sync().sessionEnded') is True
        q.evaluate('localStorage.clear()')
        q.reload()
        assert q.locator('#statusTitle').inner_text() != 'WITHIN WASPN'
        q.evaluate('WASPNTradeZero.refresh()')
        assert q.evaluate('WASPNSession.sync().sessionEnded') is True
        c.close()
    print('PASS: all four backend checkpoint stops restore after browser storage clearing, including cold reload with stale/disconnected live data')
    c = browser.new_context(service_workers='block')
    q = c.new_page()
    q.clock.install(time=__import__('datetime').datetime.fromisoformat(DATE+'T12:00:00+00:00'))
    c.route('https://wasp-backend-api.replit.app/**', lambda route: route.fulfill(status=401, body='Unauthorized'))
    q.on('dialog',lambda d:d.dismiss())
    q.goto(BASE+'live-risk.html')
    q.evaluate('void WASPNTradeZero.refresh()')
    assert q.locator('#statusTitle').inner_text() == 'BACKEND VERIFICATION REQUIRED'
    q.goto(BASE+'index.html')
    assert q.locator('#marketMain').inner_text() == 'BACKEND VERIFICATION REQUIRED'
    c.close()
    print('PASS: missing auth after full site-data loss never shows an open session')
    # Real service worker: no mocked authentication or token storage implementation.
    context = browser.new_context()
    page = context.new_page()
    page.goto(BASE)
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller?.state === "activated"')
    page.reload()
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    result = page.evaluate('''async () => {
      const send = (data, expected) => new Promise(resolve => { const listener = e => { if(e.data?.type === expected) { navigator.serviceWorker.removeEventListener('message',listener); resolve(e.data); } }; navigator.serviceWorker.addEventListener('message',listener); navigator.serviceWorker.controller.postMessage(data); });
      await send({type:'WASPN_SET_API_TOKEN',token:'synthetic-smoke-placeholder'},'WASPN_API_TOKEN_SAVED');
      const status = await send({type:'WASPN_CHECK_API_TOKEN'},'WASPN_API_TOKEN_STATUS');
      await send({type:'WASPN_CLEAR_API_TOKEN'},'WASPN_API_TOKEN_CLEARED');
      return status;
    }''')
    assert result.get('configured') is True, result
    print('PASS: real service-worker token save/check/clear protocol')
    context.set_offline(True)
    for name in ['index.html','live-risk.html','journal.html','compliance.html','calendar-2026.html','data-backup.html']:
        assert page.goto(BASE+name).status == 200
    assert page.evaluate('typeof WASPNSession.clock') == 'function'
    print('PASS: all six pages and shared rules available offline through PWA cache')
    browser.close()
