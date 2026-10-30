/* Shared daily policy. No broker writes or authentication material belongs here. */
(function(root){
  "use strict";

  const START = 390;
  const END = 660;
  const WARNING = -75;
  const HARD_STOP = -100;
  const OBJECTIVE = 50;
  const MAX_ATTEMPTS = 5;
  const APP_VERSION = "14";
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

    return minutes >= START && minutes < END;
  }

  function formatPolicyMinute(total){
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    return String(hour).padStart(2,"0") + ":" + String(minute).padStart(2,"0");
  }

  function policyLabels(){
    return Object.freeze({
      window:`${formatPolicyMinute(START)}–${formatPolicyMinute(END)} ET`,
      start:`${formatPolicyMinute(START)} ET`,
      end:`${formatPolicyMinute(END)} ET`,
      attempts:`${MAX_ATTEMPTS} Max`,
      warning:`-$${Math.abs(WARNING)}`,
      hardStop:`-$${Math.abs(HARD_STOP)}`,
      objective:`+$${OBJECTIVE}`
    });
  }

  function formatPolicyMinute(total){
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    return String(hour).padStart(2,"0") + ":" + String(minute).padStart(2,"0");
  }

  function policyLabels(){
    return Object.freeze({
      window:`${formatPolicyMinute(START)}–${formatPolicyMinute(END)} ET`,
      start:`${formatPolicyMinute(START)} ET`,
      end:`${formatPolicyMinute(END)} ET`,
      attempts:`${MAX_ATTEMPTS} Max`,
      warning:`-$${Math.abs(WARNING)}`,
      hardStop:`-$${Math.abs(HARD_STOP)}`,
      objective:`+$${OBJECTIVE}`
    });
  }

  function clock(now = new Date()){
    const ny = nyParts(now);

    if(["Saturday","Sunday"].includes(ny.weekday)){
      return {key:"weekend",canStart:false,title:"MARKET CLOSED — WEEKEND",detail:"No WASPN trading session today.",className:"closed"};
    }

    if(ny.minutes >= END){
      return {key:"closed",canStart:false,title:"SESSION CLOSED",detail:`${policyLabels().end} reached • No reopening later.`,className:"closed"};
    }

    if(ny.minutes < START){
      return {key:"before",canStart:false,title:"WAIT — SESSION NOT OPEN",detail:`Trading window begins at ${policyLabels().start}.`,className:"warn"};
    }

    return {key:"window",canStart:true,title:"WITHIN WASPN",detail:`Trading window • ${policyLabels().window}.`,className:"ok"};
  }

  function brokerPnlUsable(broker, date){
    return !!(
      broker?.tradeDate === date &&
      finite(broker.dayRealized) &&
      (
        broker.usable === true ||
        (broker.tradeZeroConnected === true && broker.dataFresh === true)
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

    if(reason){
      live.sessionEnded = true;
      live.closedReason ||= reason;
      live.closedAt ||= now.toISOString();
    }

    return live;
  }

  function invalidateConflictingReviews(day, live){
    const windowViolation = live.windowBreach === true;
    const attemptViolation = Math.max(
      Number(live.attempt) || 0,
      Number(live.maxAttemptReached) || 0
    ) > MAX_ATTEMPTS;

    if(!windowViolation && !attemptViolation) return false;

    let changed = false;

    if(day.compliance && typeof day.compliance === "object"){
      if(windowViolation && day.compliance.window !== false){
        day.compliance.window = false;
        changed = true;
      }

      if(attemptViolation && day.compliance.attempts !== false){
        day.compliance.attempts = false;
        changed = true;
      }

      if(changed){
        day.compliance.score = [
          day.compliance.window,
          day.compliance.attempts,
          day.compliance.stop
        ].filter(Boolean).length;
      }
    }

    if(day.sessionScore?.answers && typeof day.sessionScore.answers === "object"){
      let scoreChanged = false;

      if(windowViolation && day.sessionScore.answers.insideWindow !== false){
        day.sessionScore.answers.insideWindow = false;
        scoreChanged = true;
      }

      if(attemptViolation && day.sessionScore.answers.stoppedByFive !== false){
        day.sessionScore.answers.stoppedByFive = false;
        scoreChanged = true;
      }

      if(scoreChanged){
        day.sessionScore.score = Object.values(day.sessionScore.answers)
          .filter(value => value === true)
          .length;
        changed = true;
      }
    }

    if(changed){
      day.reviewInvalidatedAt = new Date().toISOString();
      day.reviewInvalidatedReason = [
        windowViolation ? "WINDOW_BREACH" : null,
        attemptViolation ? "ATTEMPT_LIMIT_BREACH" : null
      ].filter(Boolean).join("+");
    }

    return changed;
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

    if(!journal || typeof journal !== "object" || Array.isArray(journal)) journal = {};

    const originalDay = journal[date] || {date};
    const day = {...originalDay};
    const live = retain({...day.liveRisk}, rememberedRisk);
    const trades = Array.isArray(day.trades) ? day.trades : [];

    live.attempt = Math.max(Number(live.attempt) || 0, trades.length);

    if(finite(day.totalNet)){
      live.realisedPnl = Number(day.totalNet);
    }

    const evaluatedBroker = backend
      ? {...backend, usable:verified, dataFresh:verified}
      : null;

    evaluate(live, {broker:evaluatedBroker, date});

    if(brokerPnlUsable(evaluatedBroker, date)){
      day.brokerDailyNet = Number(evaluatedBroker.dayRealized);
      day.brokerDailyNetSource = "TRADEZERO_LIVE";
      day.brokerDailyObservedAt =
        typeof evaluatedBroker.lastUpdated === "string"
          ? evaluatedBroker.lastUpdated
          : new Date().toISOString();
    }

    day.liveRisk = live;
    invalidateConflictingReviews(day, live);
    remember(live);

    if(JSON.stringify(originalDay) !== JSON.stringify(day)){
      journal[date] = day;
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
    }

    return {...live, backendVerified:verified};
  }

  function confirmBrokerEntries(live, entries){
    if(
      Array.isArray(entries) &&
      entries.some(entry => entry?.sourceId && timeInsideWindow(entry.entryTime) === false)
    ){
      live.windowBreach = true;
    }
    return live;
  }

  function writeJournal(journal){
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
      invalidateConflictingReviews(journal[date], live);
    }

    remember(journal[date]?.liveRisk || {});
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
  }

  /* ========================================
     BACKUP VALIDATION
  ======================================== */

  function isRealDateKey(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const [year,month,day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year,month - 1,day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }

  function plainObject(value){
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function optionalFinite(value, label){
    if(value === undefined || value === null || value === "") return;
    if(!Number.isFinite(Number(value))) throw new Error(label + " must be a finite number.");
  }

  function validateBackupTrade(trade, date, index){
    if(!plainObject(trade)) throw new Error(`Invalid trade ${index + 1} in ${date}.`);

    for(const field of [
      "entryPrice","exitPrice","shares","fees","grossPnl","calculatedNet",
      "netPnl","actualNet","brokerGrossPnl","brokerFees","brokerCommission"
    ]){
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

  function validateBackupJournal(data){
    if(!plainObject(data)) throw new Error("The WASPN database in this backup is invalid.");

    for(const [date,day] of Object.entries(data)){
      if(!isRealDateKey(date)) throw new Error("The backup contains an invalid daily date: " + date);
      if(!plainObject(day)) throw new Error("Invalid daily record: " + date);
      if(day.date !== undefined && day.date !== date) throw new Error("Daily record date mismatch: " + date);

      if(day.trades !== undefined){
        if(!Array.isArray(day.trades) || day.trades.length > MAX_ATTEMPTS){
          throw new Error("Invalid trades record: " + date);
        }
        day.trades.forEach((trade,index) => validateBackupTrade(trade,date,index));
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

  const api = {
    START,END,WARNING,HARD_STOP,OBJECTIVE,MAX_ATTEMPTS,APP_VERSION,COOLDOWN_MS,
    BACKEND_MAX_AGE_MS,backendStatus,backendUnavailable,brokerPnlUsable,nyParts,
    formatPolicyMinute,policyLabels,formatPolicyMinute,policyLabels,timeInsideWindow,clock,evaluate,sync,writeJournal,confirmBrokerEntries,
    invalidateConflictingReviews,isRealDateKey,validateBackupJournal
  };

  if(typeof module !== "undefined") module.exports = api;

  if(root.document){
    root.WASPNSession = Object.freeze(api);

    const update = () => sync();
    update();
    root.addEventListener("storage",update);
    root.addEventListener("focus",update);
    root.addEventListener("pageshow",update);
    root.setInterval(update,1000);

    if(root.location?.pathname?.endsWith("data-backup.html")){
      const installBackupValidators = () => {
        root.isDateKey = isRealDateKey;
        root.validateJournalObject = validateBackupJournal;

        // Explicitly update the classic-script global bindings created by the
        // Backup page's inline function declarations.
        try{
          root.eval(
            "isDateKey = WASPNSession.isRealDateKey; " +
            "validateJournalObject = WASPNSession.validateBackupJournal;"
          );
        }
        catch{}

        root.__WASPN_BACKUP_VALIDATION_HARDENED = true;
      };

      // The Backup page defines its legacy functions after session-rules.js.
      // Install once the inline script has run, and again after DOM readiness.
      root.setTimeout(installBackupValidators,0);
      root.addEventListener(
        "DOMContentLoaded",
        () => root.setTimeout(installBackupValidators,0),
        {once:true}
      );
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
