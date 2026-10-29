/* Shared daily policy. No broker writes or authentication material belongs here. */
(function(root){
  "use strict";

  const PRELIM_START = 390;
  const MAIN_START = 420;
  const END = 660;
  const WARNING = -75;
  const HARD_STOP = -100;
  const MAX_ATTEMPTS = 5;
  const COOLDOWN_MS = 5 * 60 * 1000;
  const STORAGE_KEY = "waspnJournalV2";
  const BACKEND_MAX_AGE_MS = 15000;

  let rememberedDate = null;
  let rememberedRisk = {};
  let backend = null;
  let checkedAt = 0;

  function nyParts(now = new Date()){
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone:"America/New_York",
        year:"numeric",
        month:"2-digit",
        day:"2-digit",
        weekday:"long",
        hour:"2-digit",
        minute:"2-digit",
        second:"2-digit",
        hourCycle:"h23"
      })
      .formatToParts(now)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
    );

    return {
      ...parts,
      date:`${parts.year}-${parts.month}-${parts.day}`,
      minutes:Number(parts.hour) * 60 + Number(parts.minute)
    };
  }

  function finite(value){
    return value !== null && value !== "" && Number.isFinite(Number(value));
  }

  function resetDay(){
    const date = nyParts().date;
    if(rememberedDate !== date){
      rememberedDate = date;
      rememberedRisk = {};
      backend = null;
      checkedAt = 0;
    }
    return date;
  }

  function backendStatus(){
    resetDay();
    const verified = !!(
      checkedAt &&
      Date.now() - checkedAt <= BACKEND_MAX_AGE_MS &&
      backend?.tradeDate === rememberedDate &&
      backend.tradeZeroConnected === true &&
      backend.dataFresh === true &&
      [
        "sessionClosed",
        "hardStopReached",
        "maxAttemptReached",
        "outOfWindowEntryDetected"
      ].every(flag => typeof backend[flag] === "boolean") &&
      finite(backend.attempts) &&
      finite(backend.dayRealized)
    );
    return {verified};
  }

  function backendUnavailable(){
    checkedAt = 0;
  }

  function retain(live, previous){
    live.maxAttemptReached = Math.max(
      Number(live.maxAttemptReached) || 0,
      Number(live.attempt) || 0,
      Number(previous.maxAttemptReached) || 0,
      Number(previous.attempt) || 0
    );

    for(const flag of [
      "sessionEnded",
      "windowBreach",
      "hardStopReached",
      "warningReached"
    ]){
      live[flag] = !!live[flag] || !!previous[flag];
    }

    live.closedReason ||= previous.closedReason;
    live.closedAt ||= previous.closedAt;
    return live;
  }

  function remember(live){
    rememberedRisk = retain({...rememberedRisk}, live || {});
  }

  function timeInsideWindow(value){
    // Broker wall-clock fields are ET. ISO timestamps require an explicit offset.
    if(typeof value !== "string") return null;

    let minutes;
    const wall = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value.trim());

    if(wall){
      const [,h,m,s="0"] = wall;
      if(+h > 23 || +m > 59 || +s > 59) return null;
      minutes = +h * 60 + +m;
    }
    else if(/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))){
      minutes = nyParts(new Date(value)).minutes;
    }
    else{
      return null;
    }

    return minutes >= PRELIM_START && minutes < END;
  }

  function clock(now = new Date()){
    const ny = nyParts(now);

    if(["Saturday","Sunday"].includes(ny.weekday)){
      return {
        key:"weekend",
        canStart:false,
        title:"MARKET CLOSED — WEEKEND",
        detail:"No WASPN trading session today.",
        className:"closed"
      };
    }

    if(ny.minutes >= END){
      return {
        key:"closed",
        canStart:false,
        title:"SESSION CLOSED",
        detail:"11:00 AM ET reached • No reopening later.",
        className:"closed"
      };
    }

    if(ny.minutes < PRELIM_START){
      return {
        key:"before",
        canStart:false,
        title:"WAIT — SESSION NOT OPEN",
        detail:"Preliminary window begins at 06:30 ET.",
        className:"warn"
      };
    }

    if(ny.minutes < MAIN_START){
      return {
        key:"preliminary",
        canStart:true,
        title:"PRELIMINARY WINDOW",
        detail:"06:30–07:00 ET • Exceptional setups only.",
        className:"ok"
      };
    }

    return {
      key:"main",
      canStart:true,
      title:"WITHIN WASPN",
      detail:"Main trading window • 07:00–11:00 ET.",
      className:"ok"
    };
  }

  function brokerPnlUsable(broker, date){
    return !!(
      broker?.tradeDate === date &&
      finite(broker.dayRealized) &&
      (
        broker.usable === true ||
        (
          broker.tradeZeroConnected === true &&
          broker.dataFresh === true
        )
      )
    );
  }

  function evaluate(live, {broker=null,date=nyParts().date,now=new Date()} = {}){
    const current = nyParts(now);
    const sameDate = broker?.tradeDate === date;
    const pnlUsable = brokerPnlUsable(broker, date);

    const attempts = Math.max(
      0,
      Number(live.attempt) || 0,
      Number(live.maxAttemptReached) || 0,
      sameDate && finite(broker?.attempts) ? Math.max(0, Number(broker.attempts)) : 0,
      sameDate && broker?.maxAttemptReached === true ? MAX_ATTEMPTS : 0
    );

    live.maxAttemptReached = attempts;

    // Positive, date-scoped broker evidence remains latched even if later polls clear it.
    if(sameDate && broker?.outOfWindowEntryDetected === true){
      live.windowBreach = true;
    }

    // P&L risk thresholds are broker-authoritative. Journal/manual P&L is display/review data only.
    const brokerWarning = sameDate && broker?.warningReached === true;
    const brokerHardStop = sameDate && broker?.hardStopReached === true;
    const brokerPnl = pnlUsable ? Number(broker.dayRealized) : null;

    if(brokerWarning || (brokerPnl !== null && brokerPnl <= WARNING)){
      live.warningReached = true;

      if(!live.lossWarning?.triggered){
        live.lossWarning = {
          triggered:true,
          active:true,
          resetGateRequired:false,
          startedAt:now.getTime(),
          until:now.getTime() + COOLDOWN_MS,
          source:"TRADEZERO",
          triggerPnl:brokerPnl
        };
      }
    }

    if(brokerHardStop || (brokerPnl !== null && brokerPnl <= HARD_STOP)){
      live.hardStopReached = true;
    }

    const reason =
      live.windowBreach
        ? "WINDOW_BREACH"
        : live.hardStopReached
          ? "HARD_STOP"
          : attempts >= MAX_ATTEMPTS || (sameDate && broker?.maxAttemptReached === true)
            ? "MAX_ATTEMPTS"
            : sameDate && broker?.sessionClosed === true
              ? "BACKEND_CLOSED"
              : date === current.date && current.minutes >= END
                ? "SESSION_END"
                : null;

    // Backend daily checkpoint flags are authoritative even when live broker data is stale.
    // objectiveReached alone is informational and never closes the session.
    if(reason){
      live.sessionEnded = true;
      live.closedReason ||= reason;
      live.closedAt ||= now.toISOString();
    }

    return live;
  }

  function sync(brokerInput=null){
    const date = resetDay();

    if(brokerInput !== null){
      if(brokerInput?.tradeDate === date){
        backend = {...brokerInput};
        checkedAt = Date.now();
      }
      else{
        backendUnavailable();
      }
    }

    const verified = backendStatus().verified;

    let journal;
    try{
      journal = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || "{}");
    }
    catch{
      journal = {};
    }

    if(!journal || typeof journal !== "object" || Array.isArray(journal)){
      journal = {};
    }

    const originalDay = journal[date] || {date};
    const day = {...originalDay};
    const live = retain({...day.liveRisk}, rememberedRisk);
    const trades = Array.isArray(day.trades) ? day.trades : [];

    live.attempt = Math.max(Number(live.attempt) || 0, trades.length);

    // Journal P&L remains available as a local display/review fallback only.
    if(finite(day.totalNet)){
      live.realisedPnl = Number(day.totalNet);
    }

    const evaluatedBroker = backend
      ? {...backend, usable:verified, dataFresh:verified}
      : null;

    evaluate(live, {broker:evaluatedBroker, date});

    // Persist trustworthy same-day broker daily P&L so Review still has it after NY rollover.
    if(brokerPnlUsable(evaluatedBroker, date)){
      const value = Number(evaluatedBroker.dayRealized);
      day.brokerDailyNet = value;
      day.brokerDailyNetSource = "TRADEZERO_LIVE";
      day.brokerDailyObservedAt =
        typeof evaluatedBroker.lastUpdated === "string"
          ? evaluatedBroker.lastUpdated
          : new Date().toISOString();
    }

    day.liveRisk = live;
    remember(live);

    if(JSON.stringify(originalDay) !== JSON.stringify(day)){
      journal[date] = day;
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
    }

    return {...live, backendVerified:verified};
  }

  function confirmBrokerEntries(live, entries){
    // Inspect raw broker timings, never reconciled/manual fields that may differ.
    if(
      Array.isArray(entries) &&
      entries.some(entry => entry?.sourceId && timeInsideWindow(entry.entryTime) === false)
    ){
      live.windowBreach = true;
    }
    return live;
  }

  function writeJournal(journal){
    // Editing, deleting, or importing journal data must not reopen today's session.
    const date = resetDay();

    let previous;
    try{
      previous = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || "{}")[date]?.liveRisk;
    }
    catch{}

    const lossWarning = previous?.lossWarning;
    previous = retain({...previous}, rememberedRisk);

    if(
      previous.sessionEnded ||
      previous.windowBreach ||
      previous.hardStopReached ||
      previous.warningReached ||
      previous.maxAttemptReached > 0
    ){
      const day = journal[date] || {date};
      const live = retain({...day.liveRisk}, previous);

      if(lossWarning?.triggered && !live.lossWarning?.triggered){
        live.lossWarning = lossWarning;
      }

      live.closedReason = previous.closedReason || live.closedReason;
      live.closedAt = previous.closedAt || live.closedAt;
      journal[date] = {...day, liveRisk:live};
    }

    remember(journal[date]?.liveRisk || {});
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
  }

  const api = {
    PRELIM_START,
    MAIN_START,
    END,
    WARNING,
    HARD_STOP,
    MAX_ATTEMPTS,
    COOLDOWN_MS,
    BACKEND_MAX_AGE_MS,
    backendStatus,
    backendUnavailable,
    brokerPnlUsable,
    nyParts,
    timeInsideWindow,
    clock,
    evaluate,
    sync,
    writeJournal,
    confirmBrokerEntries
  };

  if(typeof module !== "undefined") module.exports = api;

  if(root.document){
    root.WASPNSession = Object.freeze(api);
    const update = () => sync();
    update();
    root.addEventListener("storage", update);
    root.addEventListener("focus", update);
    root.addEventListener("pageshow", update);
    root.setInterval(update, 1000);
  }
})(typeof window !== "undefined" ? window : globalThis);
