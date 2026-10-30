from pathlib import Path
import re

# Shared version source usable by both window and service worker contexts.
Path('app-meta.js').write_text('''(function(root){\n  "use strict";\n  root.WASPN_APP_VERSION = "16";\n})(typeof self !== "undefined" ? self : window);\n''')

# Service worker derives its cache name from the shared version.
p = Path('service-worker.js')
s = p.read_text()
s = re.sub(r'^const CACHE_PREFIX =', 'importScripts("./app-meta.js");\n\nconst CACHE_PREFIX =', s, count=1, flags=re.M)
s = re.sub(r'const CACHE_NAME =\n  "waspn-pwa-v\d+";', 'const CACHE_NAME =\n  "waspn-pwa-v" + self.WASPN_APP_VERSION;', s, count=1)
# Cache the shared version source and bump query strings for changed shared JS.
s = s.replace('  "./index.html",\n', '  "./index.html",\n  "./app-meta.js",\n', 1)
s = re.sub(r'"\./session-rules\.js\?v=\d+"', '"./session-rules.js?v=5"', s)
s = re.sub(r'"\./workflow-nav\.js\?v=\d+"', '"./workflow-nav.js?v=6"', s)
# Remove duplicate activate-update message handler if present.
dup = '''  if(data.type === "WASPN_ACTIVATE_UPDATE"){\n    event.waitUntil(self.skipWaiting());\n    return;\n  }\n\n  if(data.type === "WASPN_ACTIVATE_UPDATE"){\n    event.waitUntil(self.skipWaiting());\n    return;\n  }'''
s = s.replace(dup, '''  if(data.type === "WASPN_ACTIVATE_UPDATE"){\n    event.waitUntil(self.skipWaiting());\n    return;\n  }''')
p.write_text(s)

# Session rules expose the same shared version rather than carrying a separate literal.
p = Path('session-rules.js')
s = p.read_text()
s = re.sub(r'const APP_VERSION = "\d+";', 'const APP_VERSION = String(root.WASPN_APP_VERSION || "16");', s, count=1)
p.write_text(s)

# Ensure all pages load app-meta before session-rules and bump shared script queries.
for name in ['index.html','live-risk.html','journal.html','compliance.html','calendar-2026.html','data-backup.html']:
    p = Path(name)
    s = p.read_text()
    if 'app-meta.js' not in s:
        s = re.sub(r'(<script[^>]+src="session-rules\.js[^>]*></script>)', '<script src="app-meta.js?v=16"></script>\\n\\1', s, count=1)
    s = re.sub(r'session-rules\.js\?v=\d+', 'session-rules.js?v=5', s)
    s = re.sub(r'workflow-nav\.js\?v=\d+', 'workflow-nav.js?v=6', s)
    p.write_text(s)

# Replace the duplicated update-registration block with one robust implementation.
p = Path('workflow-nav.js')
s = p.read_text()
start = s.index('  function showUpdatePrompt(registration){')
end = s.index('  function formatBrokerTime(value){')
replacement = '''  function showUpdatePrompt(registration){\n    if(document.getElementById("waspnUpdatePrompt")) return;\n    const prompt = document.createElement("button");\n    prompt.id = "waspnUpdatePrompt";\n    prompt.className = "waspn-update-prompt";\n    prompt.type = "button";\n    prompt.setAttribute("aria-live", "polite");\n    prompt.textContent = "WASPN update ready • Refresh";\n    prompt.addEventListener("click", async () => {\n      const waiting = registration.waiting;\n      if(waiting){\n        waiting.postMessage({type:"WASPN_ACTIVATE_UPDATE"});\n      }\n      else{\n        await registration.update();\n        if(registration.waiting) registration.waiting.postMessage({type:"WASPN_ACTIVATE_UPDATE"});\n        else window.location.reload();\n      }\n    });\n    document.body.appendChild(prompt);\n  }\n\n  function registerServiceWorker(){\n    if(!("serviceWorker" in navigator)) return;\n    let reloading = false;\n    let registrationRef = null;\n\n    navigator.serviceWorker.addEventListener("controllerchange", () => {\n      if(reloading) return;\n      reloading = true;\n      window.location.reload();\n    });\n\n    const checkForUpdate = () => registrationRef?.update().catch(() => {});\n\n    const register = () => navigator.serviceWorker.register("./service-worker.js", {scope:"./", updateViaCache:"none"})\n      .then(registration => {\n        registrationRef = registration;\n        if(registration.waiting) showUpdatePrompt(registration);\n        registration.addEventListener("updatefound", () => {\n          const worker = registration.installing;\n          worker?.addEventListener("statechange", () => {\n            if(worker.state === "installed" && navigator.serviceWorker.controller) showUpdatePrompt(registration);\n          });\n        });\n        return registration.update();\n      })\n      .catch(error => console.warn("WASPN service worker registration failed:", error));\n\n    window.addEventListener("focus", checkForUpdate);\n    window.addEventListener("pageshow", checkForUpdate);\n    document.addEventListener("visibilitychange", () => {\n      if(document.visibilityState === "visible") checkForUpdate();\n    });\n\n    if(document.readyState === "complete") register();\n    else window.addEventListener("load", register, {once:true});\n  }\n\n'''
s = s[:start] + replacement + s[end:]
# Build badge uses the shared version directly.
s = re.sub(r'badge\.textContent = `WASPN v\$\{window\.WASPNSession\?\.APP_VERSION \|\| "14"\}`;', 'badge.textContent = `WASPN v${window.WASPN_APP_VERSION || window.WASPNSession?.APP_VERSION || "16"}`;', s)
# Remove duplicated shared policy/version/broker-state block if the earlier accidental duplicate remains.
marker = '  function sharedPolicyLabels(){'
first = s.find(marker)
second = s.find(marker, first + 1) if first != -1 else -1
if second != -1:
    inject = s.find('  function injectStyles(){', second)
    s = s[:second] + s[inject:]
# Remove duplicated style declarations that were accidentally repeated.
for css in [
    '      .waspn-build-version{position:fixed;right:10px;bottom:calc(82px + env(safe-area-inset-bottom));z-index:9998;padding:3px 7px;border:1px solid #273442;border-radius:999px;background:rgba(7,11,16,.9);color:#657687;font-size:8px;font-weight:850}\n',
    '      .waspn-update-prompt{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:10001;border:1px solid #22c7ff;border-radius:999px;background:#0e2633;color:#75dbe7;padding:8px 12px;font-size:10px;font-weight:900}\n',
    '      .waspn-broker-state{width:max-content;max-width:calc(100% - 20px);margin:0 auto 8px;padding:5px 9px;border-radius:999px;font-size:8px;font-weight:950;letter-spacing:.8px;text-align:center}\n',
    '      .waspn-broker-state.verified{border:1px solid rgba(53,208,127,.35);background:#0e1c15;color:#35d07f}\n',
    '      .waspn-broker-state.degraded{border:1px solid rgba(243,184,75,.42);background:#1d170d;color:#f3b84b}\n'
]:
    if s.count(css) > 1:
        s = s.replace(css, '', 1)
p.write_text(s)

# Regression tests for the exact failure mode.
p = Path('tests/source-regressions.test.cjs')
s = p.read_text()
s = re.sub(r'waspn-pwa-v15', 'waspn-pwa-v16', s)
s += '''\n\ntest('PWA version has one shared source across UI and service worker', () => {\n  const meta = read('app-meta.js');\n  const sw = read('service-worker.js');\n  const rules = read('session-rules.js');\n  const nav = read('workflow-nav.js');\n  assert.match(meta,/WASPN_APP_VERSION = "16"/);\n  assert.match(sw,/importScripts\("\.\/app-meta\.js"\)/);\n  assert.match(sw,/"waspn-pwa-v" \+ self\.WASPN_APP_VERSION/);\n  assert.match(rules,/root\.WASPN_APP_VERSION/);\n  assert.match(nav,/window\.WASPN_APP_VERSION/);\n});\n\ntest('PWA checks for updates on launch and resume and can activate waiting worker', () => {\n  const nav = read('workflow-nav.js');\n  const sw = read('service-worker.js');\n  assert.match(nav,/updateViaCache:"none"/);\n  assert.match(nav,/window\.addEventListener\("focus", checkForUpdate\)/);\n  assert.match(nav,/window\.addEventListener\("pageshow", checkForUpdate\)/);\n  assert.match(nav,/visibilitychange/);\n  assert.match(nav,/WASPN_ACTIVATE_UPDATE/);\n  assert.match(sw,/self\.skipWaiting\(\)/);\n});\n'''
p.write_text(s)
