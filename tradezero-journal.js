(function () {

  "use strict";

  const ENDPOINT =
    "https://wasp-backend-api.replit.app/api/waspn/journal";

  const STORAGE_KEY =
    "waspnJournalV2";

  const POLL_MS =
    5000;

  const TIMEOUT_MS =
    4000;

  let inFlight =
    false;

  let latest =
    null;

  let lastFeedFingerprint =
    null;


  function getJournal(){

    try{

      return JSON.parse(
        localStorage.getItem(
          STORAGE_KEY
        )
      ) || {};

    }

    catch{

      return {};

    }

  }


  function saveJournal(journal){
    WASPNSession.writeJournal(journal);
  }


  function isFiniteNumber(
    value
  ){

    return (
      value !== null &&
      value !== undefined &&
      Number.isFinite(
        Number(
          value
        )
      )
    );

  }


  function isEmptyText(
    value
  ){

    return (
      value === null ||
      value === undefined ||
      String(
        value
      ).trim() === ""
    );

  }


  function isEmptyNumber(
    value
  ){

    return (
      value === null ||
      value === undefined ||
      value === "" ||
      Number(
        value
      ) === 0
    );

  }


  function hasManualTradeContent(
    trade
  ){

    if(
      !trade ||
      typeof trade !==
        "object"
    ){

      return false;

    }

    return Boolean(
      trade.ticker ||
      Number(
        trade.entryPrice ||
        0
      ) !== 0 ||
      Number(
        trade.exitPrice ||
        0
      ) !== 0 ||
      Number(
        trade.shares ||
        0
      ) !== 0 ||
      trade.setupReason ||
      trade.setup
    );

  }


  function findTradeIndex(
    trades,
    entry
  ){

    const existingSourceIndex =
      trades.findIndex(
        trade =>
          trade &&
          trade.brokerSourceId ===
            entry.sourceId
      );

    if(
      existingSourceIndex >=
      0
    ){

      return existingSourceIndex;

    }


    const symbol =
      String(
        entry.symbol ||
        ""
      )
      .trim()
      .toUpperCase();


    if(
      symbol
    ){

      const matchingManualIndex =
        trades.findIndex(
          trade => {

            if(
              !trade ||
              trade.brokerSourceId
            ){

              return false;

            }

            const existingTicker =
              String(
                trade.ticker ||
                ""
              )
              .trim()
              .toUpperCase();

            return (
              existingTicker ===
              symbol
            );

          }
        );


      if(
        matchingManualIndex >=
        0
      ){

        return matchingManualIndex;

      }

    }


    const preferredIndex =
      Number(
        entry.attemptNumber
      ) -
      1;


    if(
      preferredIndex >= 0 &&
      preferredIndex < 5
    ){

      const preferredTrade =
        trades[
          preferredIndex
        ];


      if(
        !preferredTrade ||
        (
          !preferredTrade.brokerSourceId &&
          !hasManualTradeContent(
            preferredTrade
          )
        )
      ){

        return preferredIndex;

      }

    }


    for(
      let i = 0;
      i < 5;
      i++
    ){

      const trade =
        trades[
          i
        ];

      if(
        !trade ||
        (
          !trade.brokerSourceId &&
          !hasManualTradeContent(
            trade
          )
        )
      ){

        return i;

      }

    }


    return -1;

  }


  function mergeEntryIntoTrade(
    existingTrade,
    entry
  ){

    const trade = {
      ...(existingTrade || {})
    };


    trade.brokerSourceId =
      entry.sourceId;

    trade.brokerSource =
      entry.source ||
      null;

    trade.brokerConfidence =
      entry.confidence ||
      null;

    trade.brokerDiagnostics =
      Array.isArray(
        entry.diagnostics
      )
        ? entry.diagnostics.slice()
        : [];

    trade.brokerAttemptNumber =
      isFiniteNumber(
        entry.attemptNumber
      )
        ? Number(
            entry.attemptNumber
          )
        : null;


    if(
      isEmptyText(
        trade.ticker
      ) &&
      entry.symbol
    ){

      trade.ticker =
        String(
          entry.symbol
        )
        .trim()
        .toUpperCase();

    }


    if(
      isEmptyText(
        trade.side
      ) &&
      (
        entry.side ===
          "long" ||
        entry.side ===
          "short"
      )
    ){

      trade.side =
        entry.side;

    }


    if(
      isEmptyNumber(
        trade.entryPrice
      ) &&
      isFiniteNumber(
        entry.entryPrice
      )
    ){

      trade.entryPrice =
        Number(
          entry.entryPrice
        );

    }


    if(
      isEmptyNumber(
        trade.exitPrice
      ) &&
      isFiniteNumber(
        entry.exitPrice
      )
    ){

      trade.exitPrice =
        Number(
          entry.exitPrice
        );

    }


    if(
      isEmptyNumber(
        trade.shares
      ) &&
      isFiniteNumber(
        entry.totalShares
      )
    ){

      trade.shares =
        Number(
          entry.totalShares
        );

    }


    if(
      isFiniteNumber(
        entry.realizedPnl
      )
    ){

      trade.brokerGrossPnl =
        Number(
          entry.realizedPnl
        );

      trade.brokerRealizedPnlBasis =
        entry.realizedPnlBasis ||
        "GROSS_BEFORE_FEES";

    }


    if(
      isEmptyNumber(
        trade.fees
      ) &&
      isFiniteNumber(
        entry.fees
      ) &&
      isFiniteNumber(
        entry.commission
      )
    ){

      trade.fees =
        Math.max(
          0,
          Number(
            entry.fees
          ) +
          Number(
            entry.commission
          )
        );

    }


    if(
      !trade.entryTime &&
      entry.entryTime
    ){

      trade.entryTime =
        entry.entryTime;

    }


    if(
      !trade.exitTime &&
      entry.exitTime
    ){

      trade.exitTime =
        entry.exitTime;

    }


    if(
      isFiniteNumber(
        entry.fees
      )
    ){

      trade.brokerFees =
        Number(
          entry.fees
        );

    }


    if(
      isFiniteNumber(
        entry.commission
      )
    ){

      trade.brokerCommission =
        Number(
          entry.commission
        );

    }


    trade.brokerSyncedAt =
      new Date()
        .toISOString();


    return trade;

  }


  function mergeFeed(
    feed
  ){

    if(
      !feed ||
      typeof feed !==
        "object"
    ){

      return {
        changed:false,
        merged:0
      };

    }


    const tradeDate =
      String(
        feed.tradeDate ||
        ""
      );


    if(
      !tradeDate
    ){

      return {
        changed:false,
        merged:0
      };

    }


    if(
      !Array.isArray(
        feed.entries
      )
    ){

      return {
        changed:false,
        merged:0
      };

    }


    const journal =
      getJournal();


    const existingDay =
      journal[
        tradeDate
      ] || {
        date:
          tradeDate
      };


    const trades =
      Array.isArray(
        existingDay.trades
      )
        ? existingDay.trades
            .slice(
              0,
              5
            )
        : [];


    let changed =
      false;

    let merged =
      0;


    feed.entries.forEach(
      entry => {

        if(
          !entry ||
          typeof entry !==
            "object" ||
          !entry.sourceId
        ){

          return;

        }


        const index =
          findTradeIndex(
            trades,
            entry
          );


        if(
          index < 0 ||
          index >= 5
        ){

          return;

        }


        const before =
          JSON.stringify(
            trades[
              index
            ] ||
            {}
          );


        const mergedTrade =
          mergeEntryIntoTrade(
            trades[
              index
            ] ||
            {},
            entry
          );


        const after =
          JSON.stringify(
            mergedTrade
          );


        trades[
          index
        ] =
          mergedTrade;


        if(
          before !==
          after
        ){

          changed =
            true;

          merged++;

        }

      }
    );


    const updatedDay = {

      ...existingDay,

      date:
        tradeDate,

      trades,

      brokerJournal:{

        source:
          "TRADEZERO",

        currency:
          feed.currency ||
          "USD",

        mergePolicy:
          feed.mergePolicy ||
          "FILL_EMPTY_ONLY",

        dataFresh:
          feed.dataFresh ===
            true,

        complete:
          feed.complete ===
            true,

        diagnostics:
          Array.isArray(
            feed.diagnostics
          )
            ? feed.diagnostics.slice()
            : [],

        entryCount:
          feed.entries.length,

        syncedAt:
          new Date()
            .toISOString()

      },

      lastUpdated:
        new Date()
          .toISOString()

    };


    // Inspect every confirmed broker entry, including those beyond the five UI slots.
    const liveRisk = {...updatedDay.liveRisk};
    WASPNSession.confirmBrokerEntries(liveRisk, feed.entries);
    updatedDay.liveRisk = WASPNSession.evaluate(liveRisk, {date:tradeDate});

    journal[
      tradeDate
    ] =
      updatedDay;


    saveJournal(
      journal
    );


    return {
      changed,
      merged,
      tradeDate
    };

  }


  function journalIsDirty(){

    const status =
      document.getElementById(
        "status"
      );

    return (
      status &&
      status.classList.contains(
        "dirty"
      )
    );

  }


  function renderBrokerSyncStatus(
    feed
  ){

    let strip =
      document.getElementById(
        "tradezeroJournalStatus"
      );


    if(
      !strip
    ){

      strip =
        document.createElement(
          "div"
        );

      strip.id =
        "tradezeroJournalStatus";

      strip.style.marginTop =
        "8px";

      strip.style.padding =
        "9px 10px";

      strip.style.border =
        "1px solid rgba(34,199,255,.24)";

      strip.style.borderRadius =
        "10px";

      strip.style.background =
        "#0c1720";

      strip.style.color =
        "#9eb4c4";

      strip.style.fontSize =
        "9px";

      strip.style.fontWeight =
        "800";

      strip.style.textAlign =
        "center";

      strip.style.letterSpacing =
        ".3px";


      const note =
        document.querySelector(
          ".intraday-note"
        );


      if(
        note
      ){

        note.insertAdjacentElement(
          "afterend",
          strip
        );

      }

    }


    if(
      !strip
    ){

      return;

    }


    if(
      !feed ||
      feed.dataFresh !==
        true
    ){

      strip.textContent =
        "TRADEZERO • CONNECTION UNAVAILABLE";

      return;

    }


    const count =
      Array.isArray(
        feed.entries
      )
        ? feed.entries.length
        : 0;


    strip.textContent =
      "TRADEZERO SYNCED • " +
      count +
      " BROKER TRADE" +
      (
        count === 1
          ? ""
          : "S"
      ) +
      " MATCHED" +
      (
        feed.complete ===
          true
          ? ""
          : " • PARTIAL HISTORY"
      );

  }


  function refreshJournalScreen(){

    if(
      journalIsDirty()
    ){

      return;

    }


    if(
      typeof window.loadDay ===
        "function"
    ){

      window.loadDay();

    }


    if(
      typeof window.showExisting ===
        "function"
    ){

      window.showExisting();

    }


    if(
      typeof window.renderConnectedState ===
        "function"
    ){

      window.renderConnectedState();

    }

  }


  function getFeedFingerprint(
    feed
  ){

    if(
      !feed ||
      typeof feed !==
        "object"
    ){

      return "";

    }


    return JSON.stringify({

      tradeDate:
        feed.tradeDate ||
        null,

      currency:
        feed.currency ||
        null,

      complete:
        feed.complete ===
          true,

      dataFresh:
        feed.dataFresh ===
          true,

      diagnostics:
        Array.isArray(
          feed.diagnostics
        )
          ? feed.diagnostics
          : [],

      entries:
        Array.isArray(
          feed.entries
        )
          ? feed.entries.map(
              entry => ({

                sourceId:
                  entry.sourceId ||
                  null,

                attemptNumber:
                  entry.attemptNumber ??
                  null,

                symbol:
                  entry.symbol ||
                  null,

                side:
                  entry.side ||
                  null,

                totalShares:
                  entry.totalShares ??
                  null,

                entryPrice:
                  entry.entryPrice ??
                  null,

                exitPrice:
                  entry.exitPrice ??
                  null,

                realizedPnl:
                  entry.realizedPnl ??
                  null,

                fees:
                  entry.fees ??
                  null,

                commission:
                  entry.commission ??
                  null,

                entryTime:
                  entry.entryTime ||
                  null,

                exitTime:
                  entry.exitTime ||
                  null,

                confidence:
                  entry.confidence ||
                  null

              })
            )
          : []

    });

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

        renderBrokerSyncStatus(
          null
        );

        return;

      }


      const feed =
        await response.json();


      if(
        !feed ||
        typeof feed !==
          "object"
      ){

        renderBrokerSyncStatus(
          null
        );

        return;

      }


      latest =
        feed;


      renderBrokerSyncStatus(
        feed
      );


      const fingerprint =
        getFeedFingerprint(
          feed
        );


      let result = {

        changed:false,

        merged:0,

        tradeDate:
          feed.tradeDate ||
          null

      };


      if(
        fingerprint !==
        lastFeedFingerprint
      ){

        lastFeedFingerprint =
          fingerprint;


        result =
          mergeFeed(
            feed
          );


        refreshJournalScreen();

      }


      window.dispatchEvent(
        new CustomEvent(
          "waspn:tradezero-journal-update",
          {

            detail:{
              ...result,
              feed
            }

          }
        )
      );

    }

    catch{

      renderBrokerSyncStatus(
        null
      );

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

    return latest;

  }


  window.WASPNTradeZeroJournal = {
    refresh,
    getState
  };


  refresh();


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