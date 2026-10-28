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


  function saveJournal(
    journal
  ){

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        journal
      )
    );

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

    /*
      FIRST AUTHORITY:
      stable TradeZero sourceId.

      Never use attemptNumber to identify an already
      merged broker trade.
    */

    const existingSourceIndex =
      trades.findIndex(
        trade =>
          trade &&
          trade.brokerSourceId ===
            entry.sourceId
      );

    if(
      existingSourceIndex >= 0
    ){

      return existingSourceIndex;

    }


    /*
      For an unlinked manual Journal trade we will
      only attach the broker cycle when the ticker
      agrees.

      This prevents an incomplete TradeZero history
      from silently attaching a cycle to the wrong
      manual attempt.
    */

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
        matchingManualIndex >= 0
      ){

        return matchingManualIndex;

      }

    }


    /*
      For a new broker-only trade, the currently
      proven attempt number can choose an EMPTY slot.

      Once linked, sourceId becomes the permanent
      identity even if TradeZero later discovers an
      earlier historical cycle.
    */

    const preferredIndex =
      Number(
        entry.attemptNumber
      ) - 1;

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


    /*
      Last safe option:
      first completely unused slot.
    */

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


    /*
      No confident slot.
      Do not guess.
    */

    return -1;

  }


  function mergeEntryIntoTrade(
    existingTrade,
    entry
  ){

    const trade = {

      ...(existingTrade || {})

    };


    /*
      Broker identity / provenance.
    */

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


    /*
      FILL EMPTY ONLY.

      Existing manual Journal values always win.
    */

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


    /*
      Current backend realizedPnl is explicitly
      GROSS BEFORE FEES.

      Do NOT map this to actualNet.
    */

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


    /*
      Only populate the Journal Total Trade Fees
      field when BOTH fee components are actually
      known.

      Null does not mean zero.
    */

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


    /*
      Preserve broker timing separately.
    */

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


    /*
      IMPORTANT:
      We deliberately do NOT set:

      actualNet
      netPnl
      calculatedNet

      because TradeZero currently gives gross cycle
      P&L but not documented fees/commission.

      Existing Journal accounting remains intact.
    */

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
        changed:
          false,
        merged:
          0
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
        changed:
          false,
        merged:
          0
      };

    }


    if(
      !Array.isArray(
        feed.entries
      )
    ){

      return {
        changed:
          false,
        merged:
          0
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
            ] || {}
          );


        const mergedTrade =
          mergeEntryIntoTrade(
            trades[
              index
            ] || {},
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


    /*
      Preserve every other WASPN subsystem.

      Do NOT alter:
      - Live Risk
      - Compliance
      - Process score
      - Session notes
      - totalNet
      - journalSavedAt
    */

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


  function refreshJournalScreen(){

    /*
      Do not destroy unsaved typing.

      If the form is clean, use the Journal's
      existing loader so broker-filled values appear
      immediately.
    */

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


      const feed =
        await response.json();


      if(
        !feed ||
        typeof feed !==
          "object"
      ){

        return;

      }


      latest =
        feed;


      const result =
        mergeFeed(
          feed
        );


      refreshJournalScreen();


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

      /*
        Silent failure.

        The existing Journal remains fully usable
        manually if TradeZero is unavailable.
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