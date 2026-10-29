from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]

# Shared session rules: replace split-window constants with one start boundary.
p = root / "session-rules.js"
s = p.read_text()
s = s.replace(
    "  const PRELIM_START = 390;\n  const MAIN_START = 420;\n",
    "  const START = 390;\n",
)
s = s.replace("PRELIM_START", "START")

clock_replacement = '''  function clock(now = new Date()){
    const ny = nyParts(now);

    if(["Saturday","Sunday"].includes(ny.weekday)){
      return {key:"weekend",canStart:false,title:"MARKET CLOSED — WEEKEND",detail:"No WASPN trading session today.",className:"closed"};
    }

    if(ny.minutes >= END){
      return {key:"closed",canStart:false,title:"SESSION CLOSED",detail:"11:00 AM ET reached • No reopening later.",className:"closed"};
    }

    if(ny.minutes < START){
      return {key:"before",canStart:false,title:"WAIT — SESSION NOT OPEN",detail:"Trading window begins at 06:30 ET.",className:"warn"};
    }

    return {key:"window",canStart:true,title:"WITHIN WASPN",detail:"Trading window • 06:30–11:00 ET.",className:"ok"};
  }

  function brokerPnlUsable'''

s, count = re.subn(
    r"  function clock\(now = new Date\(\)\)\{.*?\n  \}\n\n  function brokerPnlUsable",
    clock_replacement,
    s,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"Expected one clock() replacement, got {count}")

s = s.replace(
    "    START,MAIN_START,END,WARNING,HARD_STOP,MAX_ATTEMPTS,COOLDOWN_MS,",
    "    START,END,WARNING,HARD_STOP,MAX_ATTEMPTS,COOLDOWN_MS,",
)
if "MAIN_START" in s or "PRELIM_START" in s:
    raise SystemExit("Old split-window constants remain in session-rules.js")
p.write_text(s)

# Home: one visible window card/countdown and one active-window path.
p = root / "index.html"
s = p.read_text()
s = s.replace("      07:00–11:00 ET", "      06:30–11:00 ET", 1)
s = s.replace(
    "  grid-template-columns:\n    1fr 1fr;\n\n  gap:7px;\n\n  margin-top:10px;",
    "  grid-template-columns:\n    1fr;\n\n  gap:7px;\n\n  margin-top:10px;",
    1,
)

countdown_markup = '''  <div class="window-countdowns">

    <div
      id="windowCountdownBox"
      class="countdown-item"
    >

      <div
        id="windowCountdownLabel"
        class="countdown-label"
      >
        Trading Window
      </div>

      <div
        id="windowCountdown"
        class="countdown-time"
      >
        --:--:--
      </div>

      <div
        id="windowCountdownCaption"
        class="countdown-caption"
      >
        06:30–11:00 ET
      </div>

    </div>

  </div>
'''

s, count = re.subn(
    r'  <div class="window-countdowns">.*?\n  </div>\n\n</div>\n\n\n<!-- ======================================\n     PRIMARY ACTION',
    countdown_markup + "\n</div>\n\n\n<!-- ======================================\n     PRIMARY ACTION",
    s,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"Expected one Home countdown block replacement, got {count}")

render_fn = '''function renderMarketStatus(){

  const ny = getNyParts();
  const nowSeconds = secondsNow(ny);
  const weekend = isWeekend(ny.weekday);
  const start = WASPNSession.START * 60;
  const close = WASPNSession.END * 60;

  const box = document.getElementById("marketStatus");
  const main = document.getElementById("marketMain");
  const detail = document.getElementById("marketDetail");
  const windowBox = document.getElementById("windowCountdownBox");
  const windowLabel = document.getElementById("windowCountdownLabel");
  const windowTime = document.getElementById("windowCountdown");
  const windowCaption = document.getElementById("windowCountdownCaption");

  windowBox.className = "countdown-item";

  const daily = WASPNSession.sync();

  if(daily.sessionEnded && !weekend && nowSeconds < close){
    box.className = "market-status closed";
    main.textContent = daily.windowBreach ? "WINDOW BREACH — SESSION OVER" : "SESSION CLOSED";
    detail.textContent = "Daily stop latched • No reopening today";
    windowLabel.textContent = "Trading Window";
    windowTime.textContent = "CLOSED";
    windowCaption.textContent = "06:30–11:00 ET";
    return;
  }

  if(!daily.backendVerified && !weekend && nowSeconds >= start && nowSeconds < close){
    box.className = "market-status closed";
    main.textContent = "BACKEND VERIFICATION REQUIRED";
    detail.textContent = "Trading is blocked until fresh authenticated session state is available";
    windowLabel.textContent = "Trading Window";
    windowTime.textContent = "UNVERIFIED";
    windowCaption.textContent = "06:30–11:00 ET";
    return;
  }

  if(weekend){
    box.className = "market-status closed";
    main.textContent = "MARKET CLOSED — WEEKEND";
    detail.textContent = ny.weekday + " in New York • Next WASPN session below";
    windowLabel.textContent = "Next Window Opens In";
    windowTime.textContent = formatCountdown(nextSessionCountdown(ny,start));
    windowCaption.textContent = "Next session starts 06:30 ET";
    return;
  }

  if(nowSeconds < start){
    box.className = "market-status waiting";
    main.textContent = "WAIT — SESSION NOT OPEN";
    detail.textContent = "Trading window begins at 06:30 ET";
    windowLabel.textContent = "Window Opens In";
    windowTime.textContent = formatCountdown(start - nowSeconds);
    windowCaption.textContent = "06:30–11:00 ET";
    return;
  }

  if(nowSeconds < close){
    box.className = "market-status open";
    main.textContent = "WASPN WINDOW ACTIVE";
    detail.textContent = "06:30–11:00 ET";
    windowBox.classList.add("active");
    windowLabel.textContent = "Window Remaining";
    windowTime.textContent = formatCountdown(close - nowSeconds);
    windowCaption.textContent = "Hard close at 11:00 AM ET";
    return;
  }

  box.className = "market-status closed";
  main.textContent = "SESSION CLOSED";
  detail.textContent = "11:00 AM ET reached • No reopening later";
  windowLabel.textContent = "Next Window Opens In";
  windowTime.textContent = formatCountdown(nextSessionCountdown(ny,start));
  windowCaption.textContent = "Next session starts 06:30 ET";
}
'''

s, count = re.subn(
    r"function renderMarketStatus\(\)\{.*?\n\}\n\n\n/\* ========================================\n   START",
    render_fn + "\n\n/* ========================================\n   START",
    s,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"Expected one renderMarketStatus() replacement, got {count}")
p.write_text(s)

# Cross-page wording and release cache-bust.
for path in list(root.glob("*.html")) + list(root.glob("*.js")) + list((root / "tests").glob("*.cjs")) + list((root / "tests").glob("*.py")):
    text = path.read_text()
    text = text.replace(
        "Preliminary 06:30–07:00 ET only for exceptional setups. Primary session 07:00–11:00 ET.",
        "Allowed trading window: 06:30–11:00 ET.",
    )
    text = text.replace(
        "Confirmed broker entry outside 06:30–07:00 / 07:00–11:00 ET.",
        "Confirmed broker entry outside 06:30–11:00 ET.",
    )
    text = text.replace("06:30–07:00 ET", "06:30–11:00 ET")
    text = text.replace("07:00–11:00 ET", "06:30–11:00 ET")
    text = text.replace("Preliminary window begins at 06:30 ET.", "Trading window begins at 06:30 ET.")
    text = text.replace("Preliminary monitoring begins at 6:30 AM ET", "Trading window begins at 6:30 AM ET")
    text = text.replace("PRELIMINARY WINDOW ACTIVE", "WASPN WINDOW ACTIVE")
    text = text.replace("MAIN WASPN WINDOW ACTIVE", "WASPN WINDOW ACTIVE")
    text = text.replace("Main trading window", "Trading window")
    text = text.replace("session-rules.js?v=2", "session-rules.js?v=3")
    path.write_text(text)

# Session policy tests: one active clock key from 06:30 through 10:59:59 ET.
p = root / "tests" / "session-rules.test.cjs"
s = p.read_text()
s = s.replace("['10:30:00','preliminary']", "['10:30:00','window']")
s = s.replace("['11:00:00','main']", "['11:00:00','window']")
s = s.replace("['14:59:59','main']", "['14:59:59','window']")
s = s.replace(".key, 'main')", ".key, 'window')")
marker = "const evaluate = (live, extra={}) => R.evaluate(live, {date, now, ...extra});\n"
addition = '''\n\ntest('single trading window constants are 06:30–11:00 ET', () => {\n  assert.equal(R.START, 390);\n  assert.equal(R.END, 660);\n  assert.equal(Object.prototype.hasOwnProperty.call(R, 'PRELIM_START'), false);\n  assert.equal(Object.prototype.hasOwnProperty.call(R, 'MAIN_START'), false);\n});\n'''
if "single trading window constants are 06:30–11:00 ET" not in s:
    s = s.replace(marker, marker + addition)
p.write_text(s)

# Source regressions: cache/rules versions and explicit removal of split-window copy.
p = root / "tests" / "source-regressions.test.cjs"
s = p.read_text()
s = s.replace(r"session-rules\.js\?v=2", r"session-rules\.js\?v=3")
s = s.replace("waspn-pwa-v9", "waspn-pwa-v10")
if "single-window release has no old split-window copy" not in s:
    s += '''\n\ntest('single-window release has no old split-window copy', () => {\n  const files = ['index.html','live-risk.html','compliance.html','session-rules.js'];\n  for(const file of files){\n    const source = read(file);\n    assert.doesNotMatch(source,/06:30–07:00 ET/);\n    assert.doesNotMatch(source,/07:00–11:00 ET/);\n    assert.doesNotMatch(source,/PRELIMINARY WINDOW|Preliminary 06:30/);\n  }\n  const rules = read('session-rules.js');\n  assert.match(rules,/const START = 390/);\n  assert.doesNotMatch(rules,/MAIN_START|PRELIM_START/);\n});\n'''
p.write_text(s)

# PWA cache bump so installed iPhone PWAs refresh the rule change.
p = root / "service-worker.js"
s = p.read_text().replace("waspn-pwa-v9", "waspn-pwa-v10")
s = s.replace("session-rules.js?v=2", "session-rules.js?v=3")
p.write_text(s)

# Final production-source assertions.
required = {
    "index.html": ["06:30–11:00 ET", "WASPNSession.START"],
    "session-rules.js": ["const START = 390", 'key:"window"'],
    "compliance.html": ["Allowed trading window: 06:30–11:00 ET."],
    "live-risk.html": ["outside 06:30–11:00 ET"],
}
for file, needles in required.items():
    source = (root / file).read_text()
    for needle in needles:
        if needle not in source:
            raise SystemExit(f"{file} missing required single-window text: {needle}")

for file in ["index.html", "live-risk.html", "compliance.html", "session-rules.js"]:
    source = (root / file).read_text()
    for needle in ["06:30–07:00 ET", "07:00–11:00 ET", "MAIN_START", "PRELIM_START"]:
        if needle in source:
            raise SystemExit(f"{file} still contains old split-window token: {needle}")

print("Single-window frontend migration complete")
