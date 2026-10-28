(function () {

“use strict”;

const ENDPOINT =
“https://wasp-backend-api.replit.app/api/waspn/live-status”;

const POLL_MS =
5000;

const TIMEOUT_MS =
4000;

const MAX_AGE_MS =
15000;

let latest =
null;

let lastSuccessAt =
0;

let inFlight =
false;

function isUsable(){

if(
  !latest ||
  typeof latest !==
    "object"
){
  return false;
}
const attempts =
  Number(
    latest.attempts
  );
const pnl =
  Number(
    latest.dayRealized
  );
const recent =
  lastSuccessAt > 0 &&
  (
    Date.now() -
    lastSuccessAt
  ) <=
    MAX_AGE_MS;
return (
  recent &&
  latest.tradeZeroConnected ===
    true &&
  latest.dataFresh ===
    true &&
  Number.isFinite(
    attempts
  ) &&
  Number.isFinite(
    pnl
  )
);

}

async function refresh(){

if(
  inFlight
){
  return;
}
inFlight =
  true;
const controller =
  new AbortController();
const timeout =
  setTimeout(
    () => {
      controller.abort();
    },
    TIMEOUT_MS
  );
try{
  const response =
    await fetch(
      ENDPOINT,
      {
        method:
          "GET",
        cache:
          "no-store",
        signal:
          controller.signal,
        headers:{
          "Accept":
            "application/json"
        }
      }
    );
  if(
    !response.ok
  ){
    return;
  }
  const data =
    await response.json();
  if(
    !data ||
    typeof data !==
      "object"
  ){
    return;
  }
  latest =
    data;
  lastSuccessAt =
    Date.now();
  window.dispatchEvent(
    new CustomEvent(
      "waspn:tradezero-update",
      {
        detail:
          getState()
      }
    )
  );
}
catch{
  /*
    Deliberately silent.
    The existing WASPN Live Risk page remains fully
    functional using its local Journal/session state.
  */
}
finally{
  clearTimeout(
    timeout
  );
  inFlight =
    false;
}

}

function getState(){

if(
  !isUsable()
){
  return {
    usable:
      false,
    tradeZeroConnected:
      false,
    attempts:
      null,
    dayRealized:
      null,
    warningReached:
      false,
    hardStopReached:
      false,
    maxAttemptReached:
      false,
    objectiveReached:
      false,
    sessionClosed:
      false,
    riskState:
      null,
    currentWindow:
      null,
    attemptSource:
      null,
    diagnostics:
      []
  };
}
return {
  usable:
    true,
  tradeDate:
    latest.tradeDate,
  tradeZeroConnected:
    latest.tradeZeroConnected ===
      true,
  attempts:
    Number(
      latest.attempts
    ),
  dayRealized:
    Number(
      latest.dayRealized
    ),
  warningReached:
    latest.warningReached ===
      true,
  hardStopReached:
    latest.hardStopReached ===
      true,
  maxAttemptReached:
    latest.maxAttemptReached ===
      true,
  objectiveReached:
    latest.objectiveReached ===
      true,
  sessionClosed:
    latest.sessionClosed ===
      true,
  riskState:
    typeof latest.riskState ===
      "string"
      ? latest.riskState
      : null,
  currentWindow:
    typeof latest.currentWindow ===
      "string"
      ? latest.currentWindow
      : null,
  attemptSource:
    typeof latest.attemptSource ===
      "string"
      ? latest.attemptSource
      : null,
  diagnostics:
    Array.isArray(
      latest.diagnostics
    )
      ? latest.diagnostics.slice()
      : [],
  lastUpdated:
    latest.lastUpdated ||
    null
};

}

window.WASPNTradeZero = {

refresh,
getState,
isUsable

};

refresh();

setInterval(
refresh,
POLL_MS
);

window.addEventListener(
“focus”,
refresh
);

window.addEventListener(
“pageshow”,
refresh
);

})();