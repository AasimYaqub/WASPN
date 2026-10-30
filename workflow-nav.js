(() => {
  "use strict";

  const STEPS = [
    {key:"home",label:"Home",icon:"⌂",href:"index.html",color:"#22c7ff"},
    {key:"risk",label:"Risk",icon:"1",href:"live-risk.html",color:"#ff5f6d"},
    {key:"journal",label:"Journal",icon:"2",href:"journal.html",color:"#75dbe7"},
    {key:"end",label:"End",icon:"3",href:"compliance.html",color:"#35d07f"},
    {key:"review",label:"Review",icon:"4",href:"calendar-2026.html",color:"#aeb7ff"}
  ];

  const MAX_ATTEMPTS = 5;
  const STORAGE_KEY = "waspnJournalV2";
  let activeReviewDate = null;

  function currentFile(){
    return window.location.pathname.split("/").pop() || "";
  }

  function activeKey(){
    const file = currentFile();
    if(file === "" || file === "index.html") return "home";
    if(file === "live-risk.html") return "risk";
    if(file === "journal.html") return "journal";
    if(file === "compliance.html") return "end";
    if(file === "calendar-2026.html") return "review";
    return "";
  }

  function getJournalStore(){
    try{
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }
    catch{
      return {};
    }
  }

  function showUpdatePrompt(registration){
    if(document.getElementById("waspnUpdatePrompt")) return;
    const prompt = document.createElement("button");
    prompt.id = "waspnUpdatePrompt";
    prompt.className = "waspn-update-prompt";
    prompt.type = "button";
    prompt.setAttribute("aria-live", "polite");
    prompt.textContent = "WASPN update ready • Refresh";
    prompt.addEventListener("click", () => registration.waiting?.postMessage({type:"WASPN_ACTIVATE_UPDATE"}));
    document.body.appendChild(prompt);
  }

  function showUpdatePrompt(registration){
    if(document.getElementById("waspnUpdatePrompt")) return;
    const prompt = document.createElement("button");
    prompt.id = "waspnUpdatePrompt";
    prompt.className = "waspn-update-prompt";
    prompt.type = "button";
    prompt.setAttribute("aria-live", "polite");
    prompt.textContent = "WASPN update ready • Refresh";
    prompt.addEventListener("click", () => registration.waiting?.postMessage({type:"WASPN_ACTIVATE_UPDATE"}));
    document.body.appendChild(prompt);
  }

  function registerServiceWorker(){
    if(!("serviceWorker" in navigator)) return;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if(reloading) return;
      reloading = true;
      window.location.reload();
    });
    const register = () => navigator.serviceWorker.register("./service-worker.js", {scope:"./"})
      .then(registration => {
        if(registration.waiting) showUpdatePrompt(registration);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if(worker.state === "installed" && navigator.serviceWorker.controller) showUpdatePrompt(registration);
          });
        });
        return registration.update();
      })
      .catch(error => console.warn("WASPN service worker registration failed:", error));
    if(document.readyState === "complete") register();
    else window.addEventListener("load", register, {once:true});
  }

  function formatBrokerTime(value){
    if(!value) return "—";
    const text = String(value).trim();
    if(/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return text;

    const parsed = new Date(text);
    if(!Number.isNaN(parsed.getTime())){
      return new Intl.DateTimeFormat("en-GB", {
        timeZone:"America/New_York",
        hour:"2-digit",
        minute:"2-digit",
        second:"2-digit",
        hourCycle:"h23"
      }).format(parsed);
    }

    return text;
  }

  function ensureJournalTimingFields(){
    if(currentFile() !== "journal.html") return;

    for(let i = 1; i <= MAX_ATTEMPTS; i++){
      const entryPrice = document.getElementById("entryPrice" + i);
      const grid = entryPrice?.closest(".grid");
      if(!grid || document.getElementById("waspnEntryTime" + i)) continue;

      const entryWrap = document.createElement("div");
      entryWrap.className = "field waspn-broker-time-field";
      entryWrap.innerHTML = `
        <label>Entry Time • Broker</label>
        <input id="waspnEntryTime${i}" type="text" readonly value="—" aria-label="Broker entry time">
      `;

      const exitWrap = document.createElement("div");
      exitWrap.className = "field waspn-broker-time-field";
      exitWrap.innerHTML = `
        <label>Exit Time • Broker</label>
        <input id="waspnExitTime${i}" type="text" readonly value="—" aria-label="Broker exit time">
      `;

      grid.appendChild(entryWrap);
      grid.appendChild(exitWrap);
    }
  }

  function renderJournalTiming(){
    if(currentFile() !== "journal.html") return;
    ensureJournalTimingFields();

    const date = document.getElementById("tradeDate")?.value;
    const day = date ? getJournalStore()[date] || {} : {};
    const trades = Array.isArray(day.trades) ? day.trades : [];

    for(let i = 1; i <= MAX_ATTEMPTS; i++){
      const trade = trades[i - 1] || {};
      const entry = document.getElementById("waspnEntryTime" + i);
      const exit = document.getElementById("waspnExitTime" + i);
      if(entry) entry.value = trade.brokerSourceId ? formatBrokerTime(trade.entryTime) : "—";
      if(exit) exit.value = trade.brokerSourceId ? formatBrokerTime(trade.exitTime) : "—";
    }
  }

  function applyJournalTiming(){
    if(currentFile() !== "journal.html") return;
    ensureJournalTimingFields();

    if(typeof window.loadDay === "function" && !window.loadDay.__waspnTimingWrapped){
      const originalLoadDay = window.loadDay;
      const wrapped = function(...args){
        const result = originalLoadDay.apply(this, args);
        setTimeout(renderJournalTiming, 0);
        return result;
      };
      wrapped.__waspnTimingWrapped = true;
      window.loadDay = wrapped;
    }

    document.getElementById("tradeDate")?.addEventListener("change", () => setTimeout(renderJournalTiming, 0));
    window.addEventListener("storage", renderJournalTiming);
    window.addEventListener("focus", renderJournalTiming);
    window.addEventListener("pageshow", renderJournalTiming);
    window.addEventListener("waspn:tradezero-journal-update", renderJournalTiming);
    renderJournalTiming();
  }

  function correctJournalRiskDisplay(){
    if(currentFile() !== "journal.html") return;

    const date = document.getElementById("tradeDate")?.value;
    const liveAttempt = document.getElementById("liveAttempt");
    const riskState = document.getElementById("riskState");
    if(!date || !liveAttempt || !riskState) return;

    const day = getJournalStore()[date] || {};
    const live = day.liveRisk;
    if(!live) return;

    const maxKnownAttempt = Math.max(
      Number(live.attempt) || 0,
      Number(live.maxAttemptReached) || 0
    );

    const today = window.WASPNSession?.nyParts().date;
    const verified = window.WASPNSession?.backendStatus().verified === true;

    liveAttempt.textContent =
      date === today && !verified && !maxKnownAttempt
        ? "—"
        : maxKnownAttempt + "/5";

    const behaviouralRisk = !!(
      live.tilt ||
      live.behaviouralLock?.active ||
      live.behaviouralLock?.resetGateRequired
    );

    const warning = !!(
      live.warningReached ||
      live.lossWarning?.active ||
      live.lossWarning?.resetGateRequired ||
      behaviouralRisk
    );

    let text;
    let className;

    if(
      live.windowBreach ||
      live.sessionEnded ||
      live.hardStopReached ||
      maxKnownAttempt >= MAX_ATTEMPTS
    ){
      text = maxKnownAttempt > MAX_ATTEMPTS ? "BREACH" : "LOCKED";
      className = "summary-value red";
    }
    else if(date === today && !verified){
      text = "UNVERIFIED";
      className = "summary-value amber";
    }
    else if(warning){
      text = "WARNING";
      className = "summary-value amber";
    }
    else{
      text = "ACTIVE";
      className = "summary-value green";
    }

    if(riskState.textContent !== text) riskState.textContent = text;
    if(riskState.className !== className) riskState.className = className;
  }

  function applyJournalRiskGuard(){
    if(currentFile() !== "journal.html") return;

    // Do not observe the badge itself: changing its class/text from inside a
    // MutationObserver can create a self-triggering render loop.
    setInterval(correctJournalRiskDisplay, 750);
    window.addEventListener("storage", correctJournalRiskDisplay);
    window.addEventListener("focus", correctJournalRiskDisplay);
    window.addEventListener("pageshow", correctJournalRiskDisplay);
    window.addEventListener("waspn:tradezero-update", correctJournalRiskDisplay);
    window.addEventListener("waspn:tradezero-journal-update", correctJournalRiskDisplay);
    document.getElementById("tradeDate")?.addEventListener("change", correctJournalRiskDisplay);
    correctJournalRiskDisplay();
  }

  function applyAttemptBreachDisplay(){
    if(currentFile() !== "live-risk.html") return;

    if(typeof window.buildDisplayLive === "function" && !window.buildDisplayLive.__waspnAttemptWrapped){
      const original = window.buildDisplayLive;
      const wrapped = function(localLive, broker){
        const result = original(localLive, broker);
        const actual = Math.max(
          Number(localLive?.attempt) || 0,
          Number(localLive?.maxAttemptReached) || 0,
          Number(broker?.attempts) || 0
        );

        if(actual > MAX_ATTEMPTS){
          result.attempt = actual;
          result.maxAttemptReached = actual;
        }

        return result;
      };
      wrapped.__waspnAttemptWrapped = true;
      window.buildDisplayLive = wrapped;
    }

    if(typeof window.getOperationalStatus === "function" && !window.getOperationalStatus.__waspnAttemptWrapped){
      const original = window.getOperationalStatus;
      const wrapped = function(live, clock){
        const result = original(live, clock);
        const actual = Math.max(
          Number(live?.attempt) || 0,
          Number(live?.maxAttemptReached) || 0
        );

        if(actual > MAX_ATTEMPTS && !live?.windowBreach && !live?.hardStopReached){
          return {
            title:"ATTEMPT LIMIT BREACH — SESSION OVER",
            detail:`${actual} completed attempts confirmed • WASPN limit is 5 • no further trading today.`,
            className:"stop"
          };
        }

        return result;
      };
      wrapped.__waspnAttemptWrapped = true;
      window.getOperationalStatus = wrapped;
    }
  }

  function getTradeZeroState(){
    try{
      if(!window.WASPNTradeZero || typeof window.WASPNTradeZero.getState !== "function") return null;
      return window.WASPNTradeZero.getState();
    }
    catch{
      return null;
    }
  }

  function ensureObjectiveNote(){
    if(currentFile() !== "live-risk.html") return null;

    let note = document.getElementById("waspnObjectiveNote");
    if(note) return note;

    note = document.createElement("div");
    note.id = "waspnObjectiveNote";
    note.className = "waspn-objective-note";
    note.innerHTML = `
      <strong>+$50 OBJECTIVE REACHED</strong>
      <span>Informational only • WASPN does not close the session here. Continue only for a genuinely valid setup within all remaining risk rules.</span>
    `;

    document.querySelector(".cockpit")?.insertAdjacentElement("afterend", note);
    return note;
  }

  function renderObjectiveNote(){
    if(currentFile() !== "live-risk.html") return;
    const note = ensureObjectiveNote();
    const state = getTradeZeroState();
    note?.classList.toggle("active", !!(state?.usable === true && state.objectiveReached === true));
  }

  function applyObjectiveDisplay(){
    if(currentFile() !== "live-risk.html") return;
    ensureObjectiveNote();
    renderObjectiveNote();
    window.addEventListener("waspn:tradezero-update", renderObjectiveNote);
    window.addEventListener("focus", renderObjectiveNote);
    window.addEventListener("pageshow", renderObjectiveNote);
    setInterval(renderObjectiveNote, 5000);
  }

  function complianceEvidence(date){
    const day = getJournalStore()[date] || {};
    const trades = Array.isArray(day.trades) ? day.trades : [];
    const brokerJournal = day.brokerJournal || {};
    const live = day.liveRisk || {};

    const maxKnownAttempt = Math.max(
      Number(live.attempt) || 0,
      Number(live.maxAttemptReached) || 0,
      Number(brokerJournal.provenAttemptCount) || 0,
      Number(brokerJournal.entryCount) || 0
    );

    const completeFresh =
      brokerJournal.source === "TRADEZERO" &&
      brokerJournal.complete === true &&
      brokerJournal.dataFresh === true;

    const brokerTimedTrades = trades.filter(
      trade => trade?.brokerSourceId && trade?.brokerTimingReconciled === true
    );

    const timingCoverageComplete =
      completeFresh &&
      Number(brokerJournal.entryCount || 0) === trades.length &&
      brokerTimedTrades.length === trades.length;

    const allInside =
      trades.length > 0 &&
      timingCoverageComplete &&
      trades.every(trade => window.WASPNSession?.timeInsideWindow(trade.entryTime) === true);

    return {
      day,
      live,
      trades,
      brokerJournal,
      maxKnownAttempt,
      completeFresh,
      allInside,
      windowViolation:live.windowBreach === true,
      attemptViolation:maxKnownAttempt > MAX_ATTEMPTS
    };
  }

  function hardenComplianceUI(){
    if(currentFile() !== "compliance.html") return;

    const date = document.getElementById("date")?.value;
    const q1 = document.getElementById("q1");
    const q2 = document.getElementById("q2");
    const auto1 = document.getElementById("auto1");
    const auto2 = document.getElementById("auto2");
    if(!date || !q1 || !q2 || !auto1 || !auto2) return;

    const evidence = complianceEvidence(date);

    if(evidence.windowViolation){
      q1.checked = false;
      q1.disabled = true;
      auto1.classList.remove("show");
    }
    else{
      q1.disabled = false;
      if(evidence.allInside){
        q1.checked = true;
        auto1.classList.add("show");
      }
      else if(auto1.classList.contains("show")){
        q1.checked = false;
        auto1.classList.remove("show");
      }
    }

    if(evidence.attemptViolation){
      q2.checked = false;
      q2.disabled = true;
      auto2.classList.remove("show");
    }
    else{
      q2.disabled = false;
      if(evidence.completeFresh && evidence.maxKnownAttempt <= MAX_ATTEMPTS){
        q2.checked = true;
        auto2.classList.add("show");
      }
      else if(auto2.classList.contains("show")){
        q2.checked = false;
        auto2.classList.remove("show");
      }
    }

    if(typeof window.updateScores === "function") window.updateScores();
  }

  function applyComplianceSafety(){
    if(currentFile() !== "compliance.html") return;

    const schedule = () => setTimeout(hardenComplianceUI, 0);
    document.getElementById("date")?.addEventListener("change", schedule);
    document.getElementById("saveBtn")?.addEventListener("click", hardenComplianceUI, true);
    window.addEventListener("storage", schedule);
    window.addEventListener("focus", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("waspn:tradezero-update", schedule);
    window.addEventListener("waspn:tradezero-journal-update", schedule);
    schedule();
  }

  function correctReviewTiming(date){
    if(currentFile() !== "calendar-2026.html") return;

    const detail = document.getElementById("detail");
    const day = getJournalStore()[date] || {};
    const trades = Array.isArray(day.trades) ? day.trades : [];
    if(!detail) return;

    const provenTimingCount = trades.filter(
      trade => trade?.brokerSourceId && trade?.brokerTimingReconciled === true
    ).length;

    // Correct the aggregate timing metric as well as per-trade labels.
    detail.querySelectorAll(".detail-item").forEach(item => {
      const label = item.querySelector(".label")?.textContent?.trim();
      if(label === "Broker Timing"){
        const value = item.querySelector(".detail-value");
        if(value){
          value.textContent = trades.length ? `${provenTimingCount}/${trades.length}` : "—";
        }
      }
    });

    const cards = Array.from(detail.querySelectorAll(".trade"));

    trades.forEach((trade, index) => {
      const card = cards[index];
      if(!card) return;

      const brokerProven = !!(
        trade?.brokerSourceId &&
        trade?.brokerTimingReconciled === true
      );

      card.querySelectorAll(".reconciled").forEach(node => {
        if(node.textContent.includes("Broker timing reconciled")) node.remove();
      });

      card.querySelectorAll(".trade-row").forEach(row => {
        const label = row.querySelector("span")?.textContent?.trim();
        if(["Entry Time","Exit Time","Duration"].includes(label)) row.remove();
      });

      card.querySelectorAll(".timing-pending").forEach(node => node.remove());

      if(brokerProven){
        const reconciled = document.createElement("div");
        reconciled.className = "reconciled";
        reconciled.textContent = "Broker timing reconciled";
        card.appendChild(reconciled);

        const addTimingRow = (label, value) => {
          const row = document.createElement("div");
          row.className = "trade-row";
          const name = document.createElement("span");
          name.textContent = label;
          const strong = document.createElement("strong");
          strong.textContent = value;
          row.append(name, strong);
          card.appendChild(row);
        };

        addTimingRow("Entry Time", formatBrokerTime(trade.entryTime));
        addTimingRow("Exit Time", formatBrokerTime(trade.exitTime));

        const duration = typeof window.durationLabel === "function"
          ? window.durationLabel(trade.entryTime, trade.exitTime)
          : null;
        if(duration) addTimingRow("Duration", duration);
        return;
      }

      const pending = document.createElement("div");
      pending.className = "timing-pending";
      pending.textContent = "Timing not broker-proven";
      card.appendChild(pending);
    });
  }

  function applyReviewProvenance(){
    if(currentFile() !== "calendar-2026.html") return;

    if(typeof window.showDetail === "function" && !window.showDetail.__waspnProvenanceWrapped){
      const original = window.showDetail;
      const wrapped = function(date){
        activeReviewDate = date;
        const result = original(date);
        setTimeout(() => correctReviewTiming(date), 0);
        return result;
      };
      wrapped.__waspnProvenanceWrapped = true;
      window.showDetail = wrapped;
    }
  }

  function applyReviewJournalSync(){
    if(currentFile() !== "calendar-2026.html") return;

    const refreshOpenReview = () => {
      if(!activeReviewDate || typeof window.showDetail !== "function") return;
      window.showDetail(activeReviewDate);
    };

    window.addEventListener(
      "waspn:tradezero-journal-update",
      () => setTimeout(refreshOpenReview, 0)
    );

    if(window.WASPNTradeZeroJournal?.refresh){
      window.WASPNTradeZeroJournal.refresh();
      return;
    }

    if(document.querySelector('script[data-waspn-review-journal-sync="true"]')) return;

    const script = document.createElement("script");
    script.src = "tradezero-journal.js?v=4";
    script.async = true;
    script.dataset.waspnReviewJournalSync = "true";
    script.onload = () => window.WASPNTradeZeroJournal?.refresh?.();
    document.head.appendChild(script);
  }

  function validDateKey(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  function plainObject(value){
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function optionalFinite(value, label){
    if(value === undefined || value === null || value === "") return;
    if(!Number.isFinite(Number(value))) throw new Error(label + " must be a finite number.");
  }

  function validateTrade(trade, date, index){
    if(!plainObject(trade)) throw new Error(`Invalid trade ${index + 1} in ${date}.`);

    for(const field of ["entryPrice","exitPrice","shares","fees","grossPnl","calculatedNet","netPnl","actualNet","brokerGrossPnl","brokerFees","brokerCommission"]){
      optionalFinite(trade[field], `${date} trade ${index + 1} ${field}`);
    }

    if(Number(trade.fees ?? 0) < 0) throw new Error(`Negative fee in ${date} trade ${index + 1}.`);
    if(Number(trade.shares ?? 0) < 0) throw new Error(`Negative share count in ${date} trade ${index + 1}.`);

    for(const field of ["ticker","side","setupReason","entryTime","exitTime","brokerSourceId"]){
      if(trade[field] !== undefined && trade[field] !== null && typeof trade[field] !== "string"){
        throw new Error(`${date} trade ${index + 1} ${field} is invalid.`);
      }
    }
  }

  function hardenedValidateJournalObject(data){
    if(!plainObject(data)) throw new Error("The WASPN database in this backup is invalid.");

    for(const [date, day] of Object.entries(data)){
      if(!validDateKey(date)) throw new Error("The backup contains an invalid daily date: " + date);
      if(!plainObject(day)) throw new Error("Invalid daily record: " + date);
      if(day.date !== undefined && day.date !== date) throw new Error("Daily record date mismatch: " + date);

      if(day.trades !== undefined){
        if(!Array.isArray(day.trades) || day.trades.length > MAX_ATTEMPTS){
          throw new Error("Invalid trades record: " + date);
        }
        day.trades.forEach((trade, index) => validateTrade(trade, date, index));
      }

      for(const field of ["startValue","totalNet","brokerDailyNet"]){
        optionalFinite(day[field], `${date} ${field}`);
      }

      if(day.liveRisk !== undefined){
        if(!plainObject(day.liveRisk)) throw new Error("Invalid live risk record: " + date);
        for(const field of ["attempt","maxAttemptReached","realisedPnl"]){
          optionalFinite(day.liveRisk[field], `${date} liveRisk.${field}`);
        }
        if(Number(day.liveRisk.attempt ?? 0) < 0 || Number(day.liveRisk.maxAttemptReached ?? 0) < 0){
          throw new Error("Negative attempt count in " + date);
        }
        for(const flag of ["sessionEnded","windowBreach","hardStopReached","warningReached"]){
          if(day.liveRisk[flag] !== undefined && typeof day.liveRisk[flag] !== "boolean"){
            throw new Error(`Invalid ${flag} flag in ${date}.`);
          }
        }
      }

      if(day.brokerJournal !== undefined){
        if(!plainObject(day.brokerJournal)) throw new Error("Invalid broker journal record: " + date);
        for(const field of ["entryCount","provenAttemptCount"]){
          optionalFinite(day.brokerJournal[field], `${date} brokerJournal.${field}`);
          if(Number(day.brokerJournal[field] ?? 0) < 0) throw new Error("Negative broker count in " + date);
        }
      }

      if(day.compliance !== undefined){
        if(!plainObject(day.compliance)) throw new Error("Invalid compliance record: " + date);
        optionalFinite(day.compliance.score, `${date} compliance.score`);
        if(Number(day.compliance.score ?? 0) < 0 || Number(day.compliance.score ?? 0) > 3){
          throw new Error("Compliance score out of range: " + date);
        }
      }

      if(day.sessionScore !== undefined){
        if(!plainObject(day.sessionScore)) throw new Error("Invalid process score record: " + date);
        optionalFinite(day.sessionScore.score, `${date} sessionScore.score`);
        if(Number(day.sessionScore.score ?? 0) < 0 || Number(day.sessionScore.score ?? 0) > 5){
          throw new Error("Process score out of range: " + date);
        }
        if(day.sessionScore.answers !== undefined && !plainObject(day.sessionScore.answers)){
          throw new Error("Invalid process answers: " + date);
        }
      }
    }

    return data;
  }

  function applyBackupValidation(){
    if(currentFile() !== "data-backup.html") return;
    window.validateJournalObject = hardenedValidateJournalObject;
    window.isDateKey = validDateKey;
  }

  function sharedPolicyLabels(){
    return window.WASPNSession?.policyLabels?.() || {window:"06:30–11:00 ET",attempts:"5 Max",warning:"-$75",hardStop:"-$100",objective:"+$50"};
  }

  function applyPolicyLabels(){
    const labels = sharedPolicyLabels();
    document.querySelectorAll(".guardrail").forEach(card => {
      const name = card.querySelector(".label")?.textContent?.trim().toLowerCase();
      const value = card.querySelector(".guardrail-value");
      if(!value) return;
      if(name === "window") value.textContent = labels.window;
      else if(name === "attempts") value.textContent = labels.attempts;
      else if(name?.includes("warning")) value.textContent = labels.warning;
      else if(name?.includes("stop")) value.textContent = labels.hardStop;
    });
    document.querySelectorAll("[data-waspn-policy]").forEach(node => {
      const value = labels[node.dataset.waspnPolicy];
      if(value) node.textContent = value;
    });
  }

  function ensureBuildVersion(){
    if(document.getElementById("waspnBuildVersion")) return;
    const badge = document.createElement("div");
    badge.id = "waspnBuildVersion";
    badge.className = "waspn-build-version";
    badge.textContent = `WASPN v${window.WASPNSession?.APP_VERSION || "14"}`;
    document.body.appendChild(badge);
  }

  function renderBrokerState(){
    const badge = document.getElementById("waspnBrokerState");
    if(!badge) return;
    const verified = window.WASPNSession?.backendStatus?.().verified === true;
    const broker = getTradeZeroState();
    const ok = verified && (broker?.usable === true || broker?.dataFresh === true);
    badge.className = `waspn-broker-state ${ok ? "verified" : "degraded"}`;
    badge.textContent = ok ? "BROKER VERIFIED" : "BROKER DEGRADED / UNVERIFIED";
  }

  function onSharedRefresh(handler){
    ["storage","focus","pageshow","waspn:tradezero-update","waspn:tradezero-journal-update"].forEach(event => window.addEventListener(event, handler));
  }

  function ensureBrokerState(){
    if(!["live-risk.html","journal.html","compliance.html","calendar-2026.html"].includes(currentFile())) return;
    if(document.getElementById("waspnBrokerState")) return;
    const badge = document.createElement("div");
    badge.id = "waspnBrokerState";
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-live", "polite");
    badge.className = "waspn-broker-state degraded";
    document.querySelector(".prototype-strip, .topbar")?.insertAdjacentElement("afterend", badge);
    onSharedRefresh(renderBrokerState);
    setInterval(renderBrokerState,5000);
    renderBrokerState();
  }

  function sharedPolicyLabels(){
    return window.WASPNSession?.policyLabels?.() || {window:"06:30–11:00 ET",attempts:"5 Max",warning:"-$75",hardStop:"-$100",objective:"+$50"};
  }

  function applyPolicyLabels(){
    const labels = sharedPolicyLabels();
    document.querySelectorAll(".guardrail").forEach(card => {
      const name = card.querySelector(".label")?.textContent?.trim().toLowerCase();
      const value = card.querySelector(".guardrail-value");
      if(!value) return;
      if(name === "window") value.textContent = labels.window;
      else if(name === "attempts") value.textContent = labels.attempts;
      else if(name?.includes("warning")) value.textContent = labels.warning;
      else if(name?.includes("stop")) value.textContent = labels.hardStop;
    });
    document.querySelectorAll("[data-waspn-policy]").forEach(node => {
      const value = labels[node.dataset.waspnPolicy];
      if(value) node.textContent = value;
    });
  }

  function ensureBuildVersion(){
    if(document.getElementById("waspnBuildVersion")) return;
    const badge = document.createElement("div");
    badge.id = "waspnBuildVersion";
    badge.className = "waspn-build-version";
    badge.textContent = `WASPN v${window.WASPNSession?.APP_VERSION || "14"}`;
    document.body.appendChild(badge);
  }

  function renderBrokerState(){
    const badge = document.getElementById("waspnBrokerState");
    if(!badge) return;
    const verified = window.WASPNSession?.backendStatus?.().verified === true;
    const broker = getTradeZeroState();
    const ok = verified && (broker?.usable === true || broker?.dataFresh === true);
    badge.className = `waspn-broker-state ${ok ? "verified" : "degraded"}`;
    badge.textContent = ok ? "BROKER VERIFIED" : "BROKER DEGRADED / UNVERIFIED";
  }

  function onSharedRefresh(handler){
    ["storage","focus","pageshow","waspn:tradezero-update","waspn:tradezero-journal-update"].forEach(event => window.addEventListener(event, handler));
  }

  function ensureBrokerState(){
    if(!["live-risk.html","journal.html","compliance.html","calendar-2026.html"].includes(currentFile())) return;
    if(document.getElementById("waspnBrokerState")) return;
    const badge = document.createElement("div");
    badge.id = "waspnBrokerState";
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-live", "polite");
    badge.className = "waspn-broker-state degraded";
    document.querySelector(".prototype-strip, .topbar")?.insertAdjacentElement("afterend", badge);
    onSharedRefresh(renderBrokerState);
    setInterval(renderBrokerState,5000);
    renderBrokerState();
  }

  function injectStyles(){
    if(document.getElementById("waspnWorkflowNavStyles")) return;

    const style = document.createElement("style");
    style.id = "waspnWorkflowNavStyles";
    style.textContent = `
      body{padding-bottom:calc(96px + env(safe-area-inset-bottom)) !important}
      .waspn-build-version{position:fixed;right:10px;bottom:calc(82px + env(safe-area-inset-bottom));z-index:9998;padding:3px 7px;border:1px solid #273442;border-radius:999px;background:rgba(7,11,16,.9);color:#657687;font-size:8px;font-weight:850}
      .waspn-update-prompt{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:10001;border:1px solid #22c7ff;border-radius:999px;background:#0e2633;color:#75dbe7;padding:8px 12px;font-size:10px;font-weight:900}
      .waspn-broker-state{width:max-content;max-width:calc(100% - 20px);margin:0 auto 8px;padding:5px 9px;border-radius:999px;font-size:8px;font-weight:950;letter-spacing:.8px;text-align:center}
      .waspn-broker-state.verified{border:1px solid rgba(53,208,127,.35);background:#0e1c15;color:#35d07f}
      .waspn-broker-state.degraded{border:1px solid rgba(243,184,75,.42);background:#1d170d;color:#f3b84b}
      .waspn-build-version{position:fixed;right:10px;bottom:calc(82px + env(safe-area-inset-bottom));z-index:9998;padding:3px 7px;border:1px solid #273442;border-radius:999px;background:rgba(7,11,16,.9);color:#657687;font-size:8px;font-weight:850}
      .waspn-update-prompt{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:10001;border:1px solid #22c7ff;border-radius:999px;background:#0e2633;color:#75dbe7;padding:8px 12px;font-size:10px;font-weight:900}
      .waspn-broker-state{width:max-content;max-width:calc(100% - 20px);margin:0 auto 8px;padding:5px 9px;border-radius:999px;font-size:8px;font-weight:950;letter-spacing:.8px;text-align:center}
      .waspn-broker-state.verified{border:1px solid rgba(53,208,127,.35);background:#0e1c15;color:#35d07f}
      .waspn-broker-state.degraded{border:1px solid rgba(243,184,75,.42);background:#1d170d;color:#f3b84b}
      .waspn-broker-time-field input[readonly]{color:#9eb4c4 !important;background:#0b151d !important;border-color:rgba(34,199,255,.22) !important;font-variant-numeric:tabular-nums}
      .waspn-objective-note{display:none;margin-top:8px;padding:11px 12px;border:1px solid rgba(53,208,127,.35);border-radius:13px;background:#0e1c15;color:#a9dbc0;font-size:9px;line-height:1.45;text-align:center}
      .waspn-objective-note.active{display:block}
      .waspn-objective-note strong{display:block;color:#35d07f;font-size:10px;font-weight:950;letter-spacing:.8px;margin-bottom:3px}
      .waspn-objective-note span{color:#99b7a7;font-weight:750}
      .waspn-workflow-nav{position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:7px 7px max(7px,env(safe-area-inset-bottom));background:rgba(5,9,13,.96);border-top:1px solid #273442;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
      .waspn-workflow-inner{width:100%;max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}
      .waspn-workflow-item{position:relative;min-width:0;min-height:61px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 2px;overflow:hidden;border:1px solid #283645;border-radius:12px;background:linear-gradient(180deg,#111922,#0d141b);color:#9ba9b7;text-decoration:none;text-align:center;font-size:clamp(8px,2.3vw,10px);font-weight:850;line-height:1.1;-webkit-tap-highlight-color:transparent}
      .waspn-workflow-item:active{transform:scale(.96)}
      .waspn-workflow-icon{min-width:25px;height:25px;display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:950;line-height:1}
      .waspn-workflow-item[data-step="home"] .waspn-workflow-icon{font-size:18px}
      .waspn-workflow-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
      .waspn-workflow-item.active{color:var(--workflow-active,#22c7ff);border-color:var(--workflow-active,#22c7ff);background:#111c24}
      .waspn-workflow-item.active .waspn-workflow-icon{color:var(--workflow-active,#22c7ff);text-shadow:0 0 10px var(--workflow-active,#22c7ff)}
      .waspn-workflow-item.active::before{content:"";position:absolute;left:12px;right:12px;top:0;height:2px;border-radius:0 0 5px 5px;background:var(--workflow-active,#22c7ff);box-shadow:0 0 8px var(--workflow-active,#22c7ff)}
      @media(max-width:390px){.waspn-workflow-inner{gap:4px}.waspn-workflow-item{min-height:58px;border-radius:10px}.waspn-workflow-icon{min-width:23px;height:23px;font-size:13px}}
    `;
    document.head.appendChild(style);
  }

  function setActive(key){
    document.querySelectorAll(".waspn-workflow-item").forEach(link => {
      const active = link.dataset.step === key;
      link.classList.toggle("active", active);
      if(active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function buildNav(){
    injectStyles();
    document.querySelectorAll(".bottom-nav, .waspn-workflow-nav").forEach(element => element.remove());

    const nav = document.createElement("nav");
    nav.className = "waspn-workflow-nav";
    nav.setAttribute("aria-label", "WASPN chronological workflow");

    const inner = document.createElement("div");
    inner.className = "waspn-workflow-inner";

    STEPS.forEach(step => {
      const link = document.createElement("a");
      link.href = step.href;
      link.className = "waspn-workflow-item";
      link.dataset.step = step.key;
      link.style.setProperty("--workflow-active", step.color);
      link.addEventListener("click", () => setActive(step.key));

      const icon = document.createElement("span");
      icon.className = "waspn-workflow-icon";
      icon.textContent = step.icon;

      const label = document.createElement("span");
      label.className = "waspn-workflow-label";
      label.textContent = step.label;

      link.append(icon, label);
      inner.appendChild(link);
    });

    nav.appendChild(inner);
    document.body.appendChild(nav);
    setActive(activeKey());
  }

  registerServiceWorker();

  const start = () => {
    injectStyles();
    applyJournalTiming();
    applyJournalRiskGuard();
    applyAttemptBreachDisplay();
    applyObjectiveDisplay();
    applyComplianceSafety();
    applyReviewProvenance();
    applyReviewJournalSync();
    applyBackupValidation();
    applyPolicyLabels();
    ensureBrokerState();
    buildNav();
    ensureBuildVersion();
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }
  else{
    start();
  }
})();
