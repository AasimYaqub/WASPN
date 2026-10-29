(function () {

  "use strict";

  const ENDPOINT =
    "https://wasp-backend-api.replit.app/api/waspn/live-status";

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

  let authSetupRunning =
    false;


  /* ========================================
     SERVICE WORKER AUTH
  ======================================== */

  async function getAuthWorker(){

    if(
      !(
        "serviceWorker"
        in navigator
      )
    ){

      return null;

    }

    try{

      const registration =
        await navigator
          .serviceWorker
          .ready;

      return (
        navigator
          .serviceWorker
          .controller ||
        registration.active ||
        registration.waiting ||
        null
      );

    }

    catch{

      return null;

    }

  }


  function waitForWorkerMessage(
    expectedType,
    timeoutMs = 3000
  ){

    return new Promise(
      resolve => {

        let finished =
          false;

        const finish =
          value => {

            if(
              finished
            ){
              return;
            }

            finished =
              true;

            clearTimeout(
              timeout
            );

            navigator
              .serviceWorker
              .removeEventListener(
                "message",
                handler
              );

            resolve(
              value
            );

          };


        const handler =
          event => {

            if(
              event?.data?.type ===
                expectedType
            ){

              finish(
                event.data
              );

            }

          };


        const timeout =
          setTimeout(
            () => finish(null),
            timeoutMs
          );


        navigator
          .serviceWorker
          .addEventListener(
            "message",
            handler
          );

      }
    );

  }


  async function apiTokenConfigured(){

    const worker =
      await getAuthWorker();

    if(
      !worker
    ){

      return false;

    }

    const responsePromise =
      waitForWorkerMessage(
        "WASPN_API_TOKEN_STATUS"
      );

    worker.postMessage({
      type:
        "WASPN_CHECK_API_TOKEN"
    });

    const response =
      await responsePromise;

    return (
      response?.configured ===
      true
    );

  }


  async function saveApiToken(
    token
  ){

    const clean =
      String(
        token || ""
      ).trim();

    if(
      !clean
    ){

      return false;

    }

    const worker =
      await getAuthWorker();

    if(
      !worker
    ){

      return false;

    }

    const responsePromise =
      waitForWorkerMessage(
        "WASPN_API_TOKEN_SAVED"
      );

    worker.postMessage({
      type:
        "WASPN_SET_API_TOKEN",

      token:
        clean
    });

    const response =
      await responsePromise;

    return Boolean(
      response
    );

  }


  async function ensureApiToken(){

    if(
      authSetupRunning
    ){

      return false;

    }

    authSetupRunning =
      true;

    try{

      const alreadyConfigured =
        await apiTokenConfigured();

      if(
        alreadyConfigured
      ){

        return true;

      }

      const token =
        window.prompt(
          "WASPN secure access\n\nEnter the API token you saved in Replit.\n\nIt will stay on this iPhone and is not stored in GitHub."
        );

      if(
        token === null ||
        !String(
          token
        ).trim()
      ){

        return false;

      }

      const saved =
        await saveApiToken(
          token
        );

      if(
        !saved
      ){

        window.alert(
          "WASPN could not save the secure API token. Close and reopen the app, then try again."
        );

        return false;

      }

      return true;

    }

    finally{

      authSetupRunning =
        false;

    }

  }


  /* ========================================
     LIVE STATE
  ======================================== */

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


      /*
        Once backend authentication is live,
        a 401 means this device either has no
        token yet or has an old/incorrect token.

        Prompt securely, store it in the service
        worker, then retry once.
      */

      if(
        response.status ===
          401
      ){

        clearTimeout(
          timeout
        );

        inFlight =
          false;

        const configured =
          await ensureApiToken();

        if(
          configured
        ){

          return refresh();

        }

        return;

      }


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
        Silent fallback.

        Live Risk continues using the existing
        Journal/local session state.
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
    isUsable,
    ensureApiToken

  };


  /*
    Give the v6 service worker a chance to activate
    before the initial broker request.
  */

  Promise.resolve()
    .then(
      () =>
        navigator.serviceWorker?.ready
    )
    .catch(
      () => null
    )
    .finally(
      refresh
    );


  setInterval(
    refresh,
    POLL_MS
  );


  window.addEventListener(
    "focus",
    refresh
  );


  window.addEventListener(
    "pageshow",
    refresh
  );

})();