(function () {

  "use strict";

  const ENDPOINT =
    "https://wasp-backend-api.replit.app/api/waspn/journal";

  const STORAGE_KEY = "waspnJournalV2";
  const POLL_MS = 5000;
  const TIMEOUT_MS = 4000;
  const MAX_ATTEMPTS = WASPNSession.MAX_ATTEMPTS;
  const OVERFLOW_ID = "tradezeroBreachTrades";

  let inFlight = false;
  let latest = null;
  let lastFeedFingerprint = null;
  const overflowCache = new Map();

  function getJournal(){
    try{
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    }
    catch{
      return {};
    }
  }

  function saveJournal(journal){
    WASPNSession.writeJournal(journal);
  }

  function isFiniteNumber(value){
    return (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value))
    );
  }

  function isEmptyText(value){
    return value === null || value === undefined || String(value).trim() === "";
  }

  function isEmptyNumber(value){
    return (
      value === null ||
      value === undefined ||
      value === "" ||
      Number(value) === 0
    );
  }

  function normalizedSymbol(value){
    return String(value || "").trim().toUpperCase();
  }

  function money(value){
    const n = Number(value || 0);
    if(n > 0) return "+$" + n.toFixed(2);
    if(n < 0) return "-$" + Math.abs(n).toFixed(2);
    return "$0.00";
  }

  function hasManualTradeContent(trade){
    if(!trade || typeof trade !== "object") return false;

    return Boolean(
      trade.ticker ||
      Number(trade.entryPrice || 0) !== 0 ||
      Number(trade.exitPrice || 0) !== 0 ||
      Number(trade.shares || 0) !== 0 ||
      trade.setupReason ||
      trade.setup
    );
  }

  function tradeMatchesSymbol(trade, symbol){
    return !!symbol && normalizedSymbol(trade?.ticker) === symbol;
  }

  /*
    Reconciliation order is deliberately strict:
    1. exact broker source ID
    2. broker attempt number / slot, including confirmed breach attempts > 5
    3. unique unmatched ticker fallback within normal UI slots
    4. first empty normal UI slot

    Attempts beyond MAX_ATTEMPTS are never created from ticker guessing or an
    empty slot. They require an explicit broker attempt number, so displaying
    a breach trade cannot create extra trading permission.
  */
  function findTradeIndex(trades, entry){
    const existingSourceIndex = trades.findIndex(
      trade => trade && trade.brokerSourceId === entry.sourceId
    );

    if(existingSourceIndex >= 0) return existingSourceIndex;

    const symbol = normalizedSymbol(entry.symbol);
    const attemptNumber = Number(entry.attemptNumber);
    const preferredIndex = Number.isInteger(attemptNumber) && attemptNumber > 0
      ? attemptNumber - 1
      : -1;

    if(preferredIndex >= 0){
      const preferredTrade = trades[preferredIndex];

      if(!preferredTrade){
        return preferredIndex;
      }

      if(!preferredTrade.brokerSourceId){
        if(!hasManualTradeContent(preferredTrade) || tradeMatchesSymbol(preferredTrade, symbol)){
          return preferredIndex;
        }
      }
    }

    if(symbol){
      const matchingManual = [];

      for(let i = 0; i < MAX_ATTEMPTS; i++){
        const trade = trades[i];
        if(
          trade &&
          !trade.brokerSourceId &&
          tradeMatchesSymbol(trade, symbol)
        ){
          matchingManual.push(i);
        }
      }

      if(matchingManual.length === 1){
        return matchingManual[0];
      }
    }

    for(let i = 0; i < MAX_ATTEMPTS; i++){
      const trade = trades[i];
      if(!trade || (!trade.brokerSourceId && !hasManualTradeContent(trade))){
        return i;
      }
    }

    return -1;
  }

  function mergeEntryIntoTrade(existingTrade, entry){
    const trade = {...(existingTrade || {})};

    trade.brokerSourceId = entry.sourceId;
    trade.brokerSource = entry.source || "TRADEZERO";
    trade.brokerConfidence = entry.confidence || null;
    trade.brokerDiagnostics = Array.isArray(entry.diagnostics)
      ? entry.diagnostics.slice()
      : [];
    trade.brokerAttemptNumber = isFiniteNumber(entry.attemptNumber)
      ? Number(entry.attemptNumber)
      : null;
    trade.attemptLimitBreach = Boolean(
      trade.brokerAttemptNumber && trade.brokerAttemptNumber > MAX_ATTEMPTS
    );

    if(isEmptyText(trade.ticker) && entry.symbol){
      trade.ticker = normalizedSymbol(entry.symbol);
    }

    if(
      isEmptyText(trade.side) &&
      (entry.side === "long" || entry.side === "short")
    ){
      trade.side = entry.side;
    }

    if(isEmptyNumber(trade.entryPrice) && isFiniteNumber(entry.entryPrice)){
      trade.entryPrice = Number(entry.entryPrice);
    }

    if(isEmptyNumber(trade.exitPrice) && isFiniteNumber(entry.exitPrice)){
      trade.exitPrice = Number(entry.exitPrice);
    }

    if(isEmptyNumber(trade.shares) && isFiniteNumber(entry.totalShares)){
      trade.shares = Number(entry.totalShares);
    }

    if(isFiniteNumber(entry.realizedPnl)){
      trade.brokerGrossPnl = Number(entry.realizedPnl);
      trade.brokerRealizedPnlBasis = entry.realizedPnlBasis || "GROSS_BEFORE_FEES";
    }

    const brokerFees = isFiniteNumber(entry.fees) ? Number(entry.fees) : null;
    const brokerCommission = isFiniteNumber(entry.commission) ? Number(entry.commission) : null;

    if(brokerFees !== null){
      trade.brokerFees = brokerFees;
    }

    if(brokerCommission !== null){
      trade.brokerCommission = brokerCommission;
    }

    if(
      isEmptyNumber(trade.fees) &&
      (brokerFees !== null || brokerCommission !== null)
    ){
      trade.fees = Math.max(0, (brokerFees || 0) + (brokerCommission || 0));
    }

    if(!trade.entryTime && entry.entryTime){
      trade.entryTime = entry.entryTime;
    }

    if(!trade.exitTime && entry.exitTime){
      trade.exitTime = entry.exitTime;
    }

    trade.brokerTimingReconciled = Boolean(
      entry.sourceId &&
      entry.entryTime &&
      entry.exitTime
    );

    trade.brokerSyncedAt = new Date().toISOString();
    return trade;
  }

  function provenAttemptCount(entries){
    let maximum = 0;

    for(const entry of entries){
      if(isFiniteNumber(entry?.attemptNumber)){
        maximum = Math.max(maximum, Number(entry.attemptNumber));
      }
    }

    return maximum;
  }

  function mergeFeed(feed){
    if(!feed || typeof feed !== "object"){
      return {changed:false, merged:0};
    }

    const tradeDate = String(feed.tradeDate || "");
    if(!tradeDate || !Array.isArray(feed.entries)){
      return {changed:false, merged:0};
    }

    const journal = getJournal();
    const existingDay = journal[tradeDate] || {date:tradeDate};
    const trades = Array.isArray(existingDay.trades)
      ? existingDay.trades.slice()
      : [];

    let changed = false;
    let merged = 0;

    for(const entry of feed.entries){
      if(!entry || typeof entry !== "object" || !entry.sourceId) continue;

      const index = findTradeIndex(trades, entry);
      if(index < 0) continue;

      const before = JSON.stringify(trades[index] || {});
      const mergedTrade = mergeEntryIntoTrade(trades[index] || {}, entry);
      const after = JSON.stringify(mergedTrade);
      trades[index] = mergedTrade;

      if(before !== after){
        changed = true;
        merged++;
      }
    }

    const now = new Date().toISOString();
    const updatedDay = {
      ...existingDay,
      date:tradeDate,
      trades,
      brokerJournal:{
        source:"TRADEZERO",
        currency:feed.currency || "USD",
        mergePolicy:feed.mergePolicy || "FILL_EMPTY_ONLY",
        dataFresh:feed.dataFresh === true,
        complete:feed.complete === true,
        diagnostics:Array.isArray(feed.diagnostics) ? feed.diagnostics.slice() : [],
        entryCount:feed.entries.length,
        provenAttemptCount:provenAttemptCount(feed.entries),
        syncedAt:now
      },
      lastUpdated:now
    };

    // Inspect every confirmed broker entry, including entries beyond the five UI slots.
    const liveRisk = {...updatedDay.liveRisk};
    WASPNSession.confirmBrokerEntries(liveRisk, feed.entries);

    const provenAttempts = provenAttemptCount(feed.entries);
    const attemptEvidence = Math.max(
      Number(liveRisk.maxAttemptReached) || 0,
      Number(liveRisk.attempt) || 0,
      provenAttempts,
      feed.complete === true ? feed.entries.length : 0
    );

    updatedDay.liveRisk = WASPNSession.evaluate(
      liveRisk,
      {
        date:tradeDate,
        broker:{
          tradeDate,
          attempts:attemptEvidence,
          maxAttemptReached:attemptEvidence >= MAX_ATTEMPTS,
          outOfWindowEntryDetected:liveRisk.windowBreach === true
        }
      }
    );

    journal[tradeDate] = updatedDay;
    saveJournal(journal);

    return {changed, merged, tradeDate};
  }

  function journalIsDirty(){
    const status = document.getElementById("status");
    return !!(status && status.classList.contains("dirty"));
  }

  function renderBrokerSyncStatus(feed){
    let strip = document.getElementById("tradezeroJournalStatus");

    if(!strip){
      strip = document.createElement("div");
      strip.id = "tradezeroJournalStatus";
      strip.style.marginTop = "8px";
      strip.style.padding = "9px 10px";
      strip.style.border = "1px solid rgba(34,199,255,.24)";
      strip.style.borderRadius = "10px";
      strip.style.background = "#0c1720";
      strip.style.color = "#9eb4c4";
      strip.style.fontSize = "9px";
      strip.style.fontWeight = "800";
      strip.style.textAlign = "center";
      strip.style.letterSpacing = ".3px";

      const note = document.querySelector(".intraday-note");
      if(note) note.insertAdjacentElement("afterend", strip);
    }

    if(!strip) return;

    if(!feed || feed.dataFresh !== true){
      strip.textContent = "TRADEZERO • CONNECTION UNAVAILABLE";
      return;
    }

    const count = Array.isArray(feed.entries) ? feed.entries.length : 0;
    const overLimit = count > MAX_ATTEMPTS;

    strip.textContent =
      "TRADEZERO SYNCED • " +
      count +
      " BROKER TRADE" +
      (count === 1 ? "" : "S") +
      " MATCHED" +
      (feed.complete === true ? "" : " • PARTIAL HISTORY") +
      (overLimit ? " • ATTEMPT LIMIT BREACH" : "");

    strip.style.color = overLimit ? "#ff9ca5" : "#9eb4c4";
  }

  function overflowTradesForDate(date){
    if(!date) return [];
    const day = getJournal()[date];
    if(!Array.isArray(day?.trades)) return [];

    return day.trades
      .map((trade,index) => ({trade,index,attempt:index + 1}))
      .filter(({trade,attempt}) =>
        attempt > MAX_ATTEMPTS &&
        trade &&
        trade.brokerSourceId &&
        Number(trade.brokerAttemptNumber || attempt) > MAX_ATTEMPTS
      );
  }

  function mechanicalNet(trade){
    if(isFiniteNumber(trade?.actualNet)) return Number(trade.actualNet);
    if(isFiniteNumber(trade?.netPnl)) return Number(trade.netPnl);
    if(isFiniteNumber(trade?.calculatedNet)) return Number(trade.calculatedNet);

    if(isFiniteNumber(trade?.brokerGrossPnl)){
      const fees = Math.max(0, Number(trade?.brokerFees || 0));
      const commission = Math.max(0, Number(trade?.brokerCommission || 0));
      return Number(trade.brokerGrossPnl) - fees - commission;
    }

    return 0;
  }

  function saveOverflowSetup(date,index,value){
    const journal = getJournal();
    const day = journal[date];
    if(!day || !Array.isArray(day.trades) || !day.trades[index]) return;

    day.trades[index] = {
      ...day.trades[index],
      setupReason:String(value || "").trim(),
      lastAnnotatedAt:new Date().toISOString()
    };
    day.lastUpdated = new Date().toISOString();
    journal[date] = day;
    saveJournal(journal);

    const cached = overflowCache.get(date) || [];
    overflowCache.set(
      date,
      cached.map(item => item.index === index
        ? {...item,trade:{...item.trade,setupReason:String(value || "").trim()}}
        : item
      )
    );
  }

  function breachCard(item,date){
    const trade = item.trade;
    const attempt = Number(trade.brokerAttemptNumber || item.attempt);
    const card = document.createElement("section");
    card.className = "trade broker-breach-trade";
    card.dataset.brokerAttempt = String(attempt);
    card.style.borderColor = "rgba(255,95,109,.72)";
    card.style.boxShadow = "0 0 0 1px rgba(255,95,109,.08),0 12px 28px rgba(0,0,0,.18)";

    const entry = isFiniteNumber(trade.entryPrice) ? Number(trade.entryPrice) : null;
    const exit = isFiniteNumber(trade.exitPrice) ? Number(trade.exitPrice) : null;
    const shares = isFiniteNumber(trade.shares) ? Number(trade.shares) : null;
    const net = mechanicalNet(trade);
    const side = trade.side === "short" ? "Short" : "Long";

    card.innerHTML = `
      <div class="trade-head" style="border-bottom-color:rgba(255,95,109,.32)">
        <div class="trade-title-wrap">
          <div class="trade-kicker" style="color:#ff8d98">BREACH ATTEMPT ${attempt} • BROKER CONFIRMED</div>
          <div class="trade-title">Trade ${attempt}</div>
        </div>
        <div class="pnl ${net >= 0 ? "green" : "red"}">${money(net)}</div>
      </div>
      <div class="trade-body">
        <div class="grid">
          <div class="field"><label>Ticker</label><input value="${normalizedSymbol(trade.ticker)}" readonly></div>
          <div class="field"><label>Side</label><input value="${side}" readonly></div>
          <div class="field"><label>Broker / Avg Entry</label><input value="${entry === null ? "" : entry}" readonly></div>
          <div class="field"><label>Broker / Avg Exit</label><input value="${exit === null ? "" : exit}" readonly></div>
          <div class="field"><label>Total Shares</label><input value="${shares === null ? "" : shares}" readonly></div>
          <div class="field"><label>Entry → Exit ET</label><input value="${trade.entryTime || "—"} → ${trade.exitTime || "—"}" readonly></div>
        </div>
        <div class="calculation reconciled" style="border-color:rgba(255,95,109,.28);color:#ffb0b7">
          Attempt limit breach • Recorded for audit/review only • This does not create additional trading permission.
        </div>
        <div class="setup-field" style="border-color:rgba(255,95,109,.24)">
          <div class="field">
            <label>Setup Traded / Reason Trade Taken</label>
            <input class="setup-input breach-setup-input" type="text" maxlength="180" value="${String(trade.setupReason || trade.setup || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}" placeholder="One sentence — what setup did you trade and why?">
            <div class="setup-help">Broker mechanics are locked. Only your reason/setup remains editable.</div>
          </div>
        </div>
      </div>
    `;

    const setup = card.querySelector(".breach-setup-input");
    if(setup){
      setup.addEventListener("change", () => saveOverflowSetup(date,item.index,setup.value));
      setup.addEventListener("blur", () => saveOverflowSetup(date,item.index,setup.value));
    }

    return card;
  }

  function renderBrokerOverflow(){
    const tradeContainer = document.getElementById("trades");
    if(!tradeContainer) return;

    const date = document.getElementById("tradeDate")?.value || "";
    const items = overflowTradesForDate(date);
    overflowCache.set(date,items.map(item => ({...item,trade:{...item.trade}})));

    let host = document.getElementById(OVERFLOW_ID);
    if(!host){
      host = document.createElement("div");
      host.id = OVERFLOW_ID;
      tradeContainer.insertAdjacentElement("afterend",host);
    }

    host.innerHTML = "";
    for(const item of items){
      host.appendChild(breachCard(item,date));
    }

    if(items.length){
      const count = document.getElementById("tradeCount");
      if(count){
        count.textContent = String(Math.max(Number(count.textContent || 0),MAX_ATTEMPTS + items.length));
      }
    }
  }

  function restoreOverflowAfterManualSave(){
    const date = document.getElementById("tradeDate")?.value || "";
    const cached = overflowCache.get(date) || [];
    if(!date || !cached.length) return;

    const journal = getJournal();
    const day = journal[date];
    if(!day) return;

    const trades = Array.isArray(day.trades) ? day.trades.slice() : [];
    let changed = false;

    for(const item of cached){
      if(item.attempt <= MAX_ATTEMPTS) continue;
      if(!trades[item.index] || !trades[item.index].brokerSourceId){
        trades[item.index] = {...item.trade};
        changed = true;
      }
    }

    if(changed){
      day.trades = trades;
      day.lastUpdated = new Date().toISOString();
      journal[date] = day;
      saveJournal(journal);
    }

    renderBrokerOverflow();
  }

  function refreshJournalScreen(){
    if(!journalIsDirty()){
      if(typeof window.loadDay === "function") window.loadDay();
      if(typeof window.showExisting === "function") window.showExisting();
      if(typeof window.renderConnectedState === "function") window.renderConnectedState();
    }

    renderBrokerOverflow();
  }

  function getFeedFingerprint(feed){
    if(!feed || typeof feed !== "object") return "";

    return JSON.stringify({
      tradeDate:feed.tradeDate || null,
      currency:feed.currency || null,
      complete:feed.complete === true,
      dataFresh:feed.dataFresh === true,
      diagnostics:Array.isArray(feed.diagnostics) ? feed.diagnostics : [],
      entries:Array.isArray(feed.entries)
        ? feed.entries.map(entry => ({
            sourceId:entry.sourceId || null,
            attemptNumber:entry.attemptNumber ?? null,
            symbol:entry.symbol || null,
            side:entry.side || null,
            totalShares:entry.totalShares ?? null,
            entryPrice:entry.entryPrice ?? null,
            exitPrice:entry.exitPrice ?? null,
            realizedPnl:entry.realizedPnl ?? null,
            realizedPnlBasis:entry.realizedPnlBasis || null,
            fees:entry.fees ?? null,
            commission:entry.commission ?? null,
            entryTime:entry.entryTime || null,
            exitTime:entry.exitTime || null,
            confidence:entry.confidence || null
          }))
        : []
    });
  }

  function feedNeedsMerge(feed){
    if(!feed || !Array.isArray(feed.entries) || !feed.tradeDate) return false;
    const day = getJournal()[feed.tradeDate];
    const trades = Array.isArray(day?.trades) ? day.trades : [];

    return feed.entries.some(entry => {
      if(!entry?.sourceId) return false;
      const attempt = Number(entry.attemptNumber);
      const preferredIndex = Number.isInteger(attempt) && attempt > 0 ? attempt - 1 : -1;
      if(preferredIndex >= 0 && trades[preferredIndex]?.brokerSourceId === entry.sourceId){
        return false;
      }
      return !trades.some(trade => trade?.brokerSourceId === entry.sourceId);
    });
  }

  async function refresh(){
    if(inFlight) return;
    inFlight = true;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try{
      const response = await fetch(
        ENDPOINT,
        {
          method:"GET",
          cache:"no-store",
          signal:controller.signal,
          headers:{"Accept":"application/json"}
        }
      );

      if(response.status === 401 && window.WASPNTradeZero?.ensureApiToken){
        renderBrokerSyncStatus(null);
        await window.WASPNTradeZero.ensureApiToken();
        return;
      }

      if(!response.ok){
        renderBrokerSyncStatus(null);
        renderBrokerOverflow();
        return;
      }

      const feed = await response.json();
      if(!feed || typeof feed !== "object"){
        renderBrokerSyncStatus(null);
        renderBrokerOverflow();
        return;
      }

      latest = feed;
      renderBrokerSyncStatus(feed);

      const fingerprint = getFeedFingerprint(feed);
      let result = {
        changed:false,
        merged:0,
        tradeDate:feed.tradeDate || null
      };

      if(fingerprint !== lastFeedFingerprint || feedNeedsMerge(feed)){
        lastFeedFingerprint = fingerprint;
        result = mergeFeed(feed);
      }

      refreshJournalScreen();

      window.dispatchEvent(
        new CustomEvent(
          "waspn:tradezero-journal-update",
          {detail:{...result, feed}}
        )
      );
    }
    catch{
      renderBrokerSyncStatus(null);
      renderBrokerOverflow();
    }
    finally{
      clearTimeout(timeout);
      inFlight = false;
    }
  }

  window.WASPNTradeZeroJournal = {
    refresh,
    getState:() => latest,
    mergeFeed,
    findTradeIndex,
    renderBrokerOverflow
  };

  document.getElementById("tradeDate")?.addEventListener("change", () => {
    setTimeout(renderBrokerOverflow,0);
  });

  document.getElementById("saveBtn")?.addEventListener("click", () => {
    setTimeout(restoreOverflowAfterManualSave,0);
  });

  refresh();
  setInterval(refresh, POLL_MS);
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);

})();
