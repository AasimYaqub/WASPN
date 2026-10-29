(function () {

  "use strict";

  const ENDPOINT =
    "https://wasp-backend-api.replit.app/api/waspn/live-status";

  const POLL_MS = 5000;
  const TIMEOUT_MS = 4000;
  const MAX_AGE_MS = WASPNSession.BACKEND_MAX_AGE_MS;

  let latest = null;
  let lastSuccessAt = 0;
  let inFlight = false;
  let authSetupRunning = false;
  let authFailureNotified = false;

  async function getAuthWorker(){
    if(!("serviceWorker" in navigator)) return null;

    try{
      const registration = await navigator.serviceWorker.ready;
      return (
        navigator.serviceWorker.controller ||
        registration.active ||
        registration.waiting ||
        null
      );
    }
    catch{
      return null;
    }
  }

  function waitForWorkerMessage(expectedType, timeoutMs = 3000){
    return new Promise(resolve => {
      let finished = false;

      const finish = value => {
        if(finished) return;
        finished = true;
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve(value);
      };

      const handler = event => {
        if(event?.data?.type === expectedType) finish(event.data);
      };

      const timeout = setTimeout(() => finish(null), timeoutMs);
      navigator.serviceWorker.addEventListener("message", handler);
    });
  }

  async function apiTokenConfigured(){
    const worker = await getAuthWorker();
    if(!worker) return false;

    const responsePromise = waitForWorkerMessage("WASPN_API_TOKEN_STATUS");
    worker.postMessage({type:"WASPN_CHECK_API_TOKEN"});
    const response = await responsePromise;
    return response?.configured === true;
  }

  async function saveApiToken(token){
    const clean = String(token || "").trim();
    if(!clean) return false;

    const worker = await getAuthWorker();
    if(!worker) return false;

    const responsePromise = waitForWorkerMessage("WASPN_API_TOKEN_SAVED");
    worker.postMessage({type:"WASPN_SET_API_TOKEN", token:clean});
    return Boolean(await responsePromise);
  }

  async function clearApiToken(){
    const worker = await getAuthWorker();
    if(!worker) return false;

    const responsePromise = waitForWorkerMessage("WASPN_API_TOKEN_CLEARED");
    worker.postMessage({type:"WASPN_CLEAR_API_TOKEN"});
    return Boolean(await responsePromise);
  }

  async function ensureApiToken({replaceExisting=false} = {}){
    if(authSetupRunning) return false;
    authSetupRunning = true;

    try{
      const alreadyConfigured = await apiTokenConfigured();

      if(alreadyConfigured && !replaceExisting) return true;
      if(alreadyConfigured && replaceExisting) await clearApiToken();

      const token = window.prompt(
        replaceExisting
          ? "WASPN secure access\n\nThe saved API token was rejected. Enter the current token from Replit.\n\nIt stays on this iPhone and is not stored in GitHub."
          : "WASPN secure access\n\nEnter the API token you saved in Replit.\n\nIt will stay on this iPhone and is not stored in GitHub."
      );

      if(token === null || !String(token).trim()) return false;

      const saved = await saveApiToken(token);
      if(!saved){
        window.alert(
          "WASPN could not save the secure API token. Close and reopen the app, then try again."
        );
        return false;
      }

      return true;
    }
    finally{
      authSetupRunning = false;
    }
  }

  function isUsable(){
    if(!latest || typeof latest !== "object") return false;

    const attempts = Number(latest.attempts);
    const pnl = Number(latest.dayRealized);
    const recent =
      lastSuccessAt > 0 &&
      (Date.now() - lastSuccessAt) <= MAX_AGE_MS;

    return (
      recent &&
      latest.tradeDate === WASPNSession.nyParts().date &&
      latest.attempts !== null &&
      latest.attempts !== "" &&
      latest.dayRealized !== null &&
      latest.dayRealized !== "" &&
      latest.tradeZeroConnected === true &&
      latest.dataFresh === true &&
      Number.isFinite(attempts) &&
      Number.isFinite(pnl)
    );
  }

  async function fetchOnce(){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try{
      return await fetch(
        ENDPOINT,
        {
          method:"GET",
          cache:"no-store",
          signal:controller.signal,
          headers:{"Accept":"application/json"}
        }
      );
    }
    finally{
      clearTimeout(timeout);
    }
  }

  async function refresh(authRetry = 0){
    if(inFlight) return;
    inFlight = true;

    try{
      let response = await fetchOnce();

      if(response.status === 401){
        WASPNSession.backendUnavailable();

        if(authRetry >= 1){
          if(!authFailureNotified){
            authFailureNotified = true;
            window.alert(
              "WASPN secure access was rejected. Re-enter the current Replit API token on the next prompt."
            );
          }
          return;
        }

        const hadToken = await apiTokenConfigured();
        const configured = await ensureApiToken({replaceExisting:hadToken});
        if(!configured) return;

        // Retry exactly once with the newly saved credential.
        response = await fetchOnce();

        if(response.status === 401){
          WASPNSession.backendUnavailable();
          await clearApiToken();

          if(!authFailureNotified){
            authFailureNotified = true;
            window.alert(
              "The API token was rejected. WASPN left the backend unverified and cleared the rejected token so it can be replaced safely."
            );
          }
          return;
        }
      }

      if(!response.ok){
        WASPNSession.backendUnavailable();
        return;
      }

      const data = await response.json();
      if(!data || typeof data !== "object"){
        WASPNSession.backendUnavailable();
        return;
      }

      latest = data;
      lastSuccessAt = Date.now();
      authFailureNotified = false;

      // Shared policy persists daily broker P&L and latches broker risk evidence.
      WASPNSession.sync(data);

      window.dispatchEvent(
        new CustomEvent(
          "waspn:tradezero-update",
          {detail:getState()}
        )
      );
    }
    catch{
      WASPNSession.backendUnavailable();
    }
    finally{
      inFlight = false;
    }
  }

  function getState(){
    if(!isUsable()){
      return {
        usable:false,
        tradeZeroConnected:false,
        attempts:null,
        dayRealized:null,
        warningReached:false,
        hardStopReached:false,
        maxAttemptReached:false,
        outOfWindowEntryDetected:false,
        objectiveReached:false,
        sessionClosed:false,
        riskState:null,
        currentWindow:null,
        attemptSource:null,
        diagnostics:[]
      };
    }

    const local = WASPNSession.sync();

    return {
      usable:true,
      tradeDate:latest.tradeDate,
      tradeZeroConnected:latest.tradeZeroConnected === true,
      attempts:Math.max(Number(latest.attempts), Number(local.maxAttemptReached) || 0),
      dayRealized:Number(latest.dayRealized),
      warningReached:latest.warningReached === true,
      hardStopReached:latest.hardStopReached === true,
      maxAttemptReached:latest.maxAttemptReached === true,
      outOfWindowEntryDetected:latest.outOfWindowEntryDetected === true,
      objectiveReached:latest.objectiveReached === true,
      sessionClosed:latest.sessionClosed === true,
      riskState:typeof latest.riskState === "string" ? latest.riskState : null,
      currentWindow:typeof latest.currentWindow === "string" ? latest.currentWindow : null,
      attemptSource:typeof latest.attemptSource === "string" ? latest.attemptSource : null,
      diagnostics:Array.isArray(latest.diagnostics) ? latest.diagnostics.slice() : [],
      lastUpdated:latest.lastUpdated || null
    };
  }

  /* ========================================
     YEAR-AWARE PERFORMANCE REVIEW
  ======================================== */

  function installReviewYearAwareness(){
    if(!window.location.pathname.endsWith("calendar-2026.html")) return;

    const apply = () => {
      if(
        typeof window.render !== "function" ||
        typeof window.combined !== "function" ||
        typeof window.getJournal !== "function" ||
        typeof window.getDailyResult !== "function"
      ){
        return;
      }

      const ny = WASPNSession.nyParts();
      let reviewYear = Number(ny.year);

      try{
        currentMonth = Number(ny.month) - 1;
      }
      catch{
        return;
      }

      window.key = function(month, day){
        return (
          String(reviewYear) + "-" +
          String(month + 1).padStart(2,"0") + "-" +
          String(day).padStart(2,"0")
        );
      };

      window.monthEntries = function(month){
        const prefix = String(reviewYear) + "-" + String(month + 1).padStart(2,"0");
        return Object.entries(combined()).filter(([date]) => date.startsWith(prefix));
      };

      window.renderStats = function(){
        const entries = monthEntries(currentMonth);
        const values = entries.map(item => item[1]);
        const total = values.reduce((a,b) => a + b, 0);
        const monthUsd = document.getElementById("monthPnlUsd");

        if(entries.length){
          setMoneyStat("monthPnlUsd","monthPnlGbp",total);
          monthUsd.className = "metric-value " + (total >= 0 ? "green" : "red");
        }
        else{
          monthUsd.textContent = "No data";
          document.getElementById("monthPnlGbp").textContent = "—";
          monthUsd.className = "metric-value";
        }

        document.getElementById("greenDays").textContent = values.filter(value => value > 0).length;
        document.getElementById("redDays").textContent = values.filter(value => value < 0).length;

        const all = Object.entries(combined())
          .filter(([date]) => date.startsWith(String(reviewYear) + "-"))
          .map(([,value]) => value);

        const ytd = all.reduce((a,b) => a + b, 0);
        setMoneyStat("yearPnlUsd","yearPnlGbp",ytd,all.length === 0);
        document.getElementById("yearPnlUsd").className =
          "metric-value " + (all.length ? (ytd >= 0 ? "green" : "red") : "");
        document.getElementById("yearDays").textContent = all.length;
        document.getElementById("yearGreen").textContent = all.filter(value => value > 0).length;
        document.getElementById("yearRed").textContent = all.filter(value => value < 0).length;

        if(all.length){
          setMoneyStat("yearBestDayUsd","yearBestDayGbp",Math.max(...all));
          setMoneyStat("yearWorstDayUsd","yearWorstDayGbp",Math.min(...all));
        }
        else{
          setMoneyStat("yearBestDayUsd","yearBestDayGbp",0,true);
          setMoneyStat("yearWorstDayUsd","yearWorstDayGbp",0,true);
        }

        if(reviewYear === Number(ny.year)){
          renderWeeklyPnl();
        }
        else{
          document.getElementById("weekPnlUsd").textContent = "—";
          document.getElementById("weekPnlGbp").textContent = "—";
          document.getElementById("weekRange").textContent = "Current year only";
        }
      };

      window.render = function(){
        const ytdLabel = document.querySelector(".card > .label");
        if(ytdLabel) ytdLabel.textContent = reviewYear + " Year-to-Date";

        document.getElementById("monthTitle").textContent = months[currentMonth] + " " + reviewYear;

        document.querySelectorAll(".month-jump").forEach((button,index) => {
          button.classList.toggle("active", index === currentMonth);
        });

        renderStats();

        const container = document.getElementById("calendarDays");
        container.innerHTML = "";

        const first = new Date(reviewYear,currentMonth,1);
        let dayIndex = first.getDay();
        dayIndex = dayIndex === 0 ? 7 : dayIndex;
        let offset = dayIndex - 1;
        if(offset > 4) offset = 0;

        for(let i = 0; i < offset; i++){
          const empty = document.createElement("div");
          empty.className = "day empty";
          container.appendChild(empty);
        }

        const days = new Date(reviewYear,currentMonth + 1,0).getDate();
        const journal = getJournal();
        const todayKey = getNewYorkDateKey();

        for(let day = 1; day <= days; day++){
          const dateObj = new Date(reviewYear,currentMonth,day);
          if(dateObj.getDay() === 0 || dateObj.getDay() === 6) continue;

          const date = key(currentMonth,day);
          const result = getDailyResult(date,journal[date]);
          const value = result.value;
          const cell = document.createElement("div");
          cell.className = "day";

          if(typeof value === "number") cell.classList.add(value >= 0 ? "green-day" : "red-day");
          if(journal[date]) cell.classList.add("saved-day");
          if(date === todayKey) cell.classList.add("today");
          if(date > todayKey) cell.classList.add("future");

          const dateEl = document.createElement("div");
          dateEl.className = "date";
          dateEl.textContent = day + " " + months[currentMonth].slice(0,3);

          const pnl = document.createElement("div");
          pnl.className = "pnl";
          const pnlUsd = document.createElement("div");
          pnlUsd.className = "pnl-usd";
          const pnlGbp = document.createElement("div");
          pnlGbp.className = "pnl-gbp";

          if(typeof value === "number"){
            pnlUsd.textContent = usdMoney(value);
            pnlGbp.textContent = gbpMoney(value);
            pnlUsd.classList.add(value >= 0 ? "green" : "red");
          }
          else{
            pnlUsd.textContent = "—";
            pnlGbp.textContent = "";
          }

          pnl.appendChild(pnlUsd);
          pnl.appendChild(pnlGbp);

          if(result.live){
            const liveBadge = document.createElement("div");
            liveBadge.className = "live-badge";
            liveBadge.textContent = "LIVE";
            pnl.appendChild(liveBadge);
          }

          cell.appendChild(dateEl);
          cell.appendChild(pnl);

          if(typeof value === "number" || journal[date]){
            cell.addEventListener("click", () => showDetail(date));
          }

          container.appendChild(cell);
        }
      };

      document.getElementById("prev")?.addEventListener("click", () => {
        if(currentMonth === 0) reviewYear--;
      }, true);

      document.getElementById("next")?.addEventListener("click", () => {
        if(currentMonth === 11) reviewYear++;
      }, true);

      render();
    };

    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", apply, {once:true});
    }
    else{
      setTimeout(apply,0);
    }
  }

  window.WASPNTradeZero = {
    refresh,
    getState,
    isUsable,
    ensureApiToken,
    clearApiToken
  };

  installReviewYearAwareness();

  Promise.resolve()
    .then(() => navigator.serviceWorker?.ready)
    .catch(() => null)
    .finally(() => refresh());

  setInterval(refresh, POLL_MS);
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);

})();
