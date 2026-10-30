from pathlib import Path

p=Path('live-risk.html'); s=p.read_text()
s=s.replace('''.guardrail{\n  padding:9px 3px;\n  text-align:center;\n  background:#0a1015;\n  border:1px solid var(--border);\n  border-radius:11px;\n}\n\n.guardrail-value{\n  margin-top:3px;\n  font-size:13px;\n  font-weight:950;\n}''','''.guardrail{\n  min-width:0;\n  min-height:64px;\n  display:flex;\n  flex-direction:column;\n  align-items:center;\n  justify-content:center;\n  padding:9px 4px;\n  text-align:center;\n  background:#0a1015;\n  border:1px solid var(--border);\n  border-radius:11px;\n}\n\n.guardrail .label{\n  width:100%;\n  text-align:center;\n  line-height:1.1;\n}\n\n.guardrail-value{\n  width:100%;\n  min-height:18px;\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  margin-top:4px;\n  text-align:center;\n  font-size:clamp(10px,2.7vw,13px);\n  font-weight:950;\n  line-height:1.15;\n  white-space:nowrap;\n  font-variant-numeric:tabular-nums;\n}''')
p.write_text(s)

p=Path('workflow-nav.js'); s=p.read_text()
s=s.replace('prompt.type = "button";\n    prompt.textContent', 'prompt.type = "button";\n    prompt.setAttribute("aria-live", "polite");\n    prompt.textContent')
s=s.replace('badge.id = "waspnBrokerState";\n    badge.className = "waspn-broker-state degraded";', 'badge.id = "waspnBrokerState";\n    badge.setAttribute("role", "status");\n    badge.setAttribute("aria-live", "polite");\n    badge.className = "waspn-broker-state degraded";')
p.write_text(s)

p=Path('service-worker.js'); s=p.read_text().replace('"waspn-pwa-v14"','"waspn-pwa-v15"'); p.write_text(s)

p=Path('tests/source-regressions.test.cjs'); s=p.read_text().replace('waspn-pwa-v14','waspn-pwa-v15')
s += '''

test('Live Risk guardrail values are genuinely centered and non-wrapping on mobile', () => {
  const source = read('live-risk.html');
  assert.match(source,/\\.guardrail\\{[\\s\\S]*display:flex;[\\s\\S]*align-items:center;[\\s\\S]*justify-content:center;/);
  assert.match(source,/\\.guardrail-value\\{[\\s\\S]*display:flex;[\\s\\S]*justify-content:center;[\\s\\S]*text-align:center;[\\s\\S]*white-space:nowrap/);
  assert.match(source,/font-size:clamp\\(10px,2\\.7vw,13px\\)/);
});

test('shared broker and update statuses are accessible live regions', () => {
  const source = read('workflow-nav.js');
  assert.match(source,/waspnBrokerState[\\s\\S]*aria-live/);
  assert.match(source,/waspnUpdatePrompt[\\s\\S]*aria-live/);
});
'''
p.write_text(s)
