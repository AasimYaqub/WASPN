(() => {

  const STEPS = [
    {
      key:"home",
      label:"Home",
      icon:"⌂",
      href:"index.html",
      color:"#22c7ff"
    },
    {
      key:"risk",
      label:"Risk",
      icon:"1",
      href:"live-risk.html",
      color:"#22c7ff"
    },
    {
      key:"journal",
      label:"Journal",
      icon:"2",
      href:"journal.html",
      color:"#75dbe7"
    },
    {
      key:"end",
      label:"End",
      icon:"3",
      href:"compliance.html",
      color:"#35d07f"
    },
    {
      key:"review",
      label:"Review",
      icon:"4",
      href:"calendar-2026.html",
      color:"#aeb7ff"
    }
  ];


  const WASPN_LIVE_STATUS_ENDPOINT =
    "https://wasp-backend-api.replit.app/api/waspn/live-status";


  let windowBreachRequestInFlight =
    false;



  /* ========================================
     PWA SERVICE WORKER
  ======================================== */

  function registerServiceWorker(){

    if(
      !(
        "serviceWorker"
        in navigator
      )
    ){
      return;
    }


    const register = () => {

      navigator.serviceWorker
        .register(
          "./service-worker.js",
          {
            scope:"./"
          }
        )
        .then(
          registration => {

            registration.update();

          }
        )
        .catch(
          error => {

            console.warn(
              "WASPN service worker registration failed:",
              error
            );

          }
        );

    };


    if(
      document.readyState ===
      "complete"
    ){

      register();

    }

    else{

      window.addEventListener(
        "load",
        register,
        {
          once:true
        }
      );

    }

  }



  /* ========================================
     ACTIVE PAGE
  ======================================== */

  function currentFile(){

    return (
      window.location.pathname
        .split("/")
        .pop() || ""
    );

  }


  function activeKey(){

    const file =
      currentFile();


    if(
      file === "" ||
      file === "index.html"
    ){
      return "home";
    }


    if(
      file === "live-risk.html"
    ){
      return "risk";
    }


    if(
      file === "journal.html"
    ){
      return "journal";
    }


    if(
      file === "compliance.html"
    ){
      return "end";
    }


    if(
      file === "calendar-2026.html"
    ){
      return "review";
    }


    return "";

  }



  /* ========================================
     COMPLIANCE SAFETY OVERRIDE
  ======================================== */

  function complianceTimeInsideWindow(
    value
  ){

    if(
      !value ||
      !/^\d{1,2}:\d{2}/
        .test(
          String(value)
        )
    ){
      return null;
    }


    const match =
      String(value)
        .match(
          /^(\d{1,2}):(\d{2})/
        );


    if(
      !match
    ){
      return null;
    }


    const hour =
      Number(match[1]);

    const minute =
      Number(match[2]);

    const mins =
      hour * 60 +
      minute;


    const preliminary =
      mins >= 390 &&
      mins < 420;

    const main =
      mins >= 540 &&
      mins < 660;


    return (
      preliminary ||
      main
    );

  }


  function applyComplianceSafetyOverride(){

    if(
      currentFile() !==
      "compliance.html"
    ){
      return;
    }


    if(
      typeof window.loadDay !==
        "function"
    ){
      return;
    }


    window.applyStructuralPrefill =
      function(
        day
      ){

        const q1 =
          document.getElementById(
            "q1"
          );

        const q2 =
          document.getElementById(
            "q2"
          );

        const q3 =
          document.getElementById(
            "q3"
          );

        const auto1 =
          document.getElementById(
            "auto1"
          );

        const auto2 =
          document.getElementById(
            "auto2"
          );

        const auto3 =
          document.getElementById(
            "auto3"
          );


        if(
          !q1 ||
          !q2 ||
          !q3
        ){
          return;
        }


        q1.checked =
          false;

        q2.checked =
          false;

        q3.checked =
          false;

        auto1?.classList.remove(
          "show"
        );

        auto2?.classList.remove(
          "show"
        );

        auto3?.classList.remove(
          "show"
        );


        const trades =
          Array.isArray(
            day?.trades
          )
            ? day.trades
            : [];


        if(
          trades.length > 0
        ){

          const allTimed =
            trades.every(
              trade =>
                complianceTimeInsideWindow(
                  trade?.entryTime
                ) !== null
            );

          const allInside =
            allTimed &&
            trades.every(
              trade =>
                complianceTimeInsideWindow(
                  trade?.entryTime
                ) === true
            );


          if(
            allInside
          ){

            q1.checked =
              true;

            auto1?.classList.add(
              "show"
            );

          }

        }


        const brokerJournal =
          day?.brokerJournal;

        const brokerHistoryComplete =
          brokerJournal?.complete ===
            true &&
          brokerJournal?.dataFresh !==
            false;


        if(
          brokerHistoryComplete
        ){

          const live =
            day?.liveRisk;

          const maxAttempt =
            Math.max(
              Number(
                live?.maxAttemptReached ||
                0
              ),
              Number(
                live?.attempt ||
                0
              ),
              trades.length
            );


          if(
            Number.isFinite(
              maxAttempt
            ) &&
            maxAttempt <= 5
          ){

            q2.checked =
              true;

            auto2?.classList.add(
              "show"
            );

          }

        }


        q3.checked =
          false;

        auto3?.classList.remove(
          "show"
        );

      };


    window.loadDay();

  }



  /* ========================================
     JOURNAL BROKER TIMING
  ======================================== */

  function getJournalStore(){

    try{

      return JSON.parse(
        localStorage.getItem(
          "waspnJournalV2"
        )
      ) || {};

    }

    catch{

      return {};

    }

  }


  function formatBrokerTime(
    value
  ){

    if(
      !value
    ){
      return "—";
    }


    const text =
      String(
        value
      )
      .trim();


    if(
      /^\d{1,2}:\d{2}(?::\d{2})?$/
        .test(
          text
        )
    ){

      return text;

    }


    const parsed =
      new Date(
        text
      );


    if(
      !Number.isNaN(
        parsed.getTime()
      )
    ){

      return new Intl.DateTimeFormat(
        "en-GB",
        {
          timeZone:
            "America/New_York",
          hour:
            "2-digit",
          minute:
            "2-digit",
          second:
            "2-digit",
          hourCycle:
            "h23"
        }
      )
      .format(
        parsed
      );

    }


    return text;

  }


  function ensureJournalTimingFields(){

    if(
      currentFile() !==
      "journal.html"
    ){
      return;
    }


    for(
      let i = 1;
      i <= 5;
      i++
    ){

      const entryPrice =
        document.getElementById(
          "entryPrice" +
          i
        );


      const grid =
        entryPrice
          ?.closest(
            ".grid"
          );


      if(
        !grid ||
        document.getElementById(
          "waspnEntryTime" +
          i
        )
      ){
        continue;
      }


      const entryWrap =
        document.createElement(
          "div"
        );

      entryWrap.className =
        "field waspn-broker-time-field";

      entryWrap.innerHTML = `
        <label>
          Entry Time • Broker
        </label>
        <input
          id="waspnEntryTime${i}"
          type="text"
          readonly
          value="—"
          aria-label="Broker entry time"
        >
      `;


      const exitWrap =
        document.createElement(
          "div"
        );

      exitWrap.className =
        "field waspn-broker-time-field";

      exitWrap.innerHTML = `
        <label>
          Exit Time • Broker
        </label>
        <input
          id="waspnExitTime${i}"
          type="text"
          readonly
          value="—"
          aria-label="Broker exit time"
        >
      `;


      grid.appendChild(
        entryWrap
      );

      grid.appendChild(
        exitWrap
      );

    }

  }


  function renderJournalTiming(){

    if(
      currentFile() !==
      "journal.html"
    ){
      return;
    }


    ensureJournalTimingFields();


    const date =
      document.getElementById(
        "tradeDate"
      )?.value;


    const day =
      date
        ? getJournalStore()[
            date
          ] || {}
        : {};


    const trades =
      Array.isArray(
        day.trades
      )
        ? day.trades
        : [];


    for(
      let i = 1;
      i <= 5;
      i++
    ){

      const trade =
        trades[
          i - 1
        ] || {};


      const entry =
        document.getElementById(
          "waspnEntryTime" +
          i
        );

      const exit =
        document.getElementById(
          "waspnExitTime" +
          i
        );


      if(
        entry
      ){

        entry.value =
          formatBrokerTime(
            trade.entryTime
          );

      }


      if(
        exit
      ){

        exit.value =
          formatBrokerTime(
            trade.exitTime
          );

      }

    }

  }


  function applyJournalTiming(){

    if(
      currentFile() !==
      "journal.html"
    ){
      return;
    }


    ensureJournalTimingFields();


    if(
      typeof window.loadDay ===
        "function" &&
      !window.loadDay
        .__waspnTimingWrapped
    ){

      const originalLoadDay =
        window.loadDay;


      const wrapped =
        function(
          ...args
        ){

          const result =
            originalLoadDay.apply(
              this,
              args
            );


          setTimeout(
            renderJournalTiming,
            0
          );


          return result;

        };


      wrapped.__waspnTimingWrapped =
        true;


      window.loadDay =
        wrapped;

    }


    document
      .getElementById(
        "tradeDate"
      )
      ?.addEventListener(
        "change",
        () =>
          setTimeout(
            renderJournalTiming,
            0
          )
      );


    window.addEventListener(
      "storage",
      renderJournalTiming
    );

    window.addEventListener(
      "focus",
      renderJournalTiming
    );

    window.addEventListener(
      "pageshow",
      renderJournalTiming
    );


    renderJournalTiming();

  }



  /* ========================================
     +$50 OBJECTIVE DISPLAY
  ======================================== */

  function getTradeZeroState(){

    try{

      if(
        !window.WASPNTradeZero ||
        typeof window.WASPNTradeZero.getState !==
          "function"
      ){
        return null;
      }


      return window.WASPNTradeZero.getState();

    }

    catch{

      return null;

    }

  }


  function ensureObjectiveNote(){

    if(
      currentFile() !==
      "live-risk.html"
    ){
      return null;
    }


    let note =
      document.getElementById(
        "waspnObjectiveNote"
      );


    if(
      note
    ){
      return note;
    }


    note =
      document.createElement(
        "div"
      );


    note.id =
      "waspnObjectiveNote";

    note.className =
      "waspn-objective-note";

    note.innerHTML = `
      <strong>
        +$50 OBJECTIVE REACHED
      </strong>
      <span>
        Informational only • WASPN does not close the session here. Continue only for a genuinely valid setup within all remaining risk rules.
      </span>
    `;


    const cockpit =
      document.querySelector(
        ".cockpit"
      );


    if(
      cockpit
    ){

      cockpit.insertAdjacentElement(
        "afterend",
        note
      );

    }


    return note;

  }


  function renderObjectiveNote(){

    if(
      currentFile() !==
      "live-risk.html"
    ){
      return;
    }


    const note =
      ensureObjectiveNote();


    if(
      !note
    ){
      return;
    }


    const state =
      getTradeZeroState();


    note.classList.toggle(
      "active",
      !!(
        state &&
        state.usable === true &&
        state.objectiveReached ===
          true
      )
    );

  }


  function applyObjectiveDisplay(){

    if(
      currentFile() !==
      "live-risk.html"
    ){
      return;
    }


    ensureObjectiveNote();

    renderObjectiveNote();


    window.addEventListener(
      "waspn:tradezero-update",
      renderObjectiveNote
    );


    window.addEventListener(
      "focus",
      renderObjectiveNote
    );


    window.addEventListener(
      "pageshow",
      renderObjectiveNote
    );


    setInterval(
      renderObjectiveNote,
      5000
    );

  }



  /* ========================================
     WINDOW BREACH DISPLAY
  ======================================== */

  function ensureWindowBreachNote(){

    if(
      currentFile() !==
      "live-risk.html"
    ){
      return null;
    }


    let note =
      document.getElementById(
        "waspnWindowBreachNote"
      );


    if(
      note
    ){
      return note;
    }


    note =
      document.createElement(
        "div"
      );


    note.id =
      "waspnWindowBreachNote";

    note.className =
      "waspn-window-breach-note";


    note.innerHTML = `
      <strong>
        ⚠ WINDOW BREACH
      </strong>
      <span>
        TradeZero confirms an entry occurred outside the permitted WASPN trading windows.
        No further entries are permitted today.
      </span>
      <small>
        Permitted entry windows: 06:30–07:00 ET and 09:00–11:00 ET.
      </small>
    `;


    const cockpit =
      document.querySelector(
        ".cockpit"
      );


    if(
      cockpit
    ){

      cockpit.insertAdjacentElement(
        "beforebegin",
        note
      );

    }


    return note;

  }


  async function renderWindowBreachNote(){

    if(
      currentFile() !==
      "live-risk.html"
    ){
      return;
    }


    if(
      windowBreachRequestInFlight
    ){
      return;
    }


    const note =
      ensureWindowBreachNote();


    if(
      !note
    ){
      return;
    }


    windowBreachRequestInFlight =
      true;


    try{

      const response =
        await fetch(
          WASPN_LIVE_STATUS_ENDPOINT,
          {
            method:"GET",
            cache:"no-store",
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


      const detected =
        data?.outOfWindowEntryDetected ===
          true;


      note.classList.toggle(
        "active",
        detected
      );


      document.body.classList.toggle(
        "waspn-window-breach-active",
        detected
      );

    }

    catch{

      /*
        Do not clear an already-visible warning
        merely because one network poll failed.
      */

    }

    finally{

      windowBreachRequestInFlight =
        false;

    }

  }


  function applyWindowBreachDisplay(){

    if(
      currentFile() !==
      "live-risk.html"
    ){
      return;
    }


    ensureWindowBreachNote();

    renderWindowBreachNote();


    window.addEventListener(
      "waspn:tradezero-update",
      renderWindowBreachNote
    );


    window.addEventListener(
      "focus",
      renderWindowBreachNote
    );


    window.addEventListener(
      "pageshow",
      renderWindowBreachNote
    );


    setInterval(
      renderWindowBreachNote,
      5000
    );

  }



  /* ========================================
     STYLES
  ======================================== */

  function injectStyles(){

    if(
      document.getElementById(
        "waspnWorkflowNavStyles"
      )
    ){
      return;
    }


    const style =
      document.createElement(
        "style"
      );


    style.id =
      "waspnWorkflowNavStyles";


    style.textContent = `

      body{

        padding-bottom:
          calc(
            96px +
            env(safe-area-inset-bottom)
          ) !important;

      }


      .waspn-broker-time-field input[readonly]{

        color:#9eb4c4 !important;

        background:#0b151d !important;

        border-color:
          rgba(
            34,
            199,
            255,
            .22
          ) !important;

        font-variant-numeric:
          tabular-nums;

      }


      .waspn-window-breach-note{

        display:none;

        margin:
          0
          0
          10px;

        padding:
          14px 13px;

        border:
          2px solid
          #ff4255;

        border-radius:
          14px;

        background:
          linear-gradient(
            180deg,
            #2b1015,
            #1a0b0e
          );

        box-shadow:
          0
          0
          22px
          rgba(
            255,
            66,
            85,
            .22
          );

        color:#ffd4d8;

        text-align:center;

        line-height:1.45;

      }


      .waspn-window-breach-note.active{

        display:block;

        animation:
          waspnWindowBreachPulse
          1.8s
          ease-in-out
          infinite;

      }


      .waspn-window-breach-note strong{

        display:block;

        color:#ff5263;

        font-size:15px;

        font-weight:1000;

        letter-spacing:
          1.2px;

        margin-bottom:5px;

      }


      .waspn-window-breach-note span{

        display:block;

        color:#ffd7db;

        font-size:10px;

        font-weight:850;

      }


      .waspn-window-breach-note small{

        display:block;

        margin-top:6px;

        color:#d49ba2;

        font-size:9px;

        font-weight:750;

      }


      @keyframes waspnWindowBreachPulse{

        0%,
        100%{

          box-shadow:
            0
            0
            16px
            rgba(
              255,
              66,
              85,
              .18
            );

        }

        50%{

          box-shadow:
            0
            0
            30px
            rgba(
              255,
              66,
              85,
              .38
            );

        }

      }


      .waspn-objective-note{

        display:none;

        margin-top:8px;

        padding:11px 12px;

        border:
          1px solid
          rgba(
            53,
            208,
            127,
            .35
          );

        border-radius:13px;

        background:#0e1c15;

        color:#a9dbc0;

        font-size:9px;

        line-height:1.45;

        text-align:center;

      }


      .waspn-objective-note.active{

        display:block;

      }


      .waspn-objective-note strong{

        display:block;

        color:#35d07f;

        font-size:10px;

        font-weight:950;

        letter-spacing:.8px;

        margin-bottom:3px;

      }


      .waspn-objective-note span{

        color:#99b7a7;

        font-weight:750;

      }


      .waspn-workflow-nav{

        position:fixed;

        left:0;
        right:0;
        bottom:0;

        z-index:9999;

        padding:
          7px
          7px
          max(
            7px,
            env(safe-area-inset-bottom)
          );

        background:
          rgba(
            5,
            9,
            13,
            .96
          );

        border-top:
          1px solid
          #273442;

        backdrop-filter:
          blur(16px);

        -webkit-backdrop-filter:
          blur(16px);

      }


      .waspn-workflow-inner{

        width:100%;

        max-width:1000px;

        margin:0 auto;

        display:grid;

        grid-template-columns:
          repeat(
            5,
            minmax(0,1fr)
          );

        gap:5px;

      }


      .waspn-workflow-item{

        position:relative;

        min-width:0;
        min-height:61px;

        display:flex;

        flex-direction:column;

        align-items:center;
        justify-content:center;

        gap:3px;

        padding:
          6px 2px;

        overflow:hidden;

        border:
          1px solid
          #283645;

        border-radius:12px;

        background:
          linear-gradient(
            180deg,
            #111922,
            #0d141b
          );

        color:#9ba9b7;

        text-decoration:none;

        text-align:center;

        font-size:
          clamp(
            8px,
            2.3vw,
            10px
          );

        font-weight:850;

        line-height:1.1;

        transition:
          transform .12s ease,
          border-color .12s ease,
          background .12s ease,
          color .12s ease;

        -webkit-tap-highlight-color:
          transparent;

      }


      .waspn-workflow-item:active{

        transform:
          scale(.96);

      }


      .waspn-workflow-icon{

        min-width:25px;
        height:25px;

        display:flex;

        align-items:center;
        justify-content:center;

        color:white;

        font-size:14px;
        font-weight:950;

        line-height:1;

      }


      .waspn-workflow-item[data-step="home"]
      .waspn-workflow-icon{

        font-size:18px;

      }


      .waspn-workflow-label{

        overflow:hidden;

        text-overflow:ellipsis;

        white-space:nowrap;

        max-width:100%;

      }


      .waspn-workflow-item.active{

        color:
          var(
            --workflow-active,
            #22c7ff
          );

        border-color:
          var(
            --workflow-active,
            #22c7ff
          );

        background:#111c24;

        box-shadow:
          inset
          0
          0
          18px
          color-mix(
            in srgb,
            var(
              --workflow-active,
              #22c7ff
            )
            10%,
            transparent
          );

      }


      .waspn-workflow-item.active
      .waspn-workflow-icon{

        color:
          var(
            --workflow-active,
            #22c7ff
          );

        text-shadow:
          0 0 10px
          var(
            --workflow-active,
            #22c7ff
          );

      }


      .waspn-workflow-item.active::before{

        content:"";

        position:absolute;

        left:12px;
        right:12px;
        top:0;

        height:2px;

        border-radius:
          0 0 5px 5px;

        background:
          var(
            --workflow-active,
            #22c7ff
          );

        box-shadow:
          0
          0
          8px
          var(
            --workflow-active,
            #22c7ff
          );

      }


      @media(max-width:390px){

        .waspn-workflow-inner{
          gap:4px;
        }


        .waspn-workflow-item{

          min-height:58px;

          border-radius:10px;

        }


        .waspn-workflow-icon{

          min-width:23px;
          height:23px;

          font-size:13px;

        }

      }

    `;


    document.head.appendChild(
      style
    );

  }



  /* ========================================
     ACTIVE NAV
  ======================================== */

  function setActive(
    key
  ){

    document
      .querySelectorAll(
        ".waspn-workflow-item"
      )
      .forEach(
        link => {

          const active =
            link.dataset.step ===
            key;


          link.classList.toggle(
            "active",
            active
          );


          if(
            active
          ){

            link.setAttribute(
              "aria-current",
              "page"
            );

          }

          else{

            link.removeAttribute(
              "aria-current"
            );

          }

        }
      );

  }



  /* ========================================
     BUILD NAV
  ======================================== */

  function buildNav(){

    injectStyles();


    document
      .querySelectorAll(
        ".bottom-nav, .waspn-workflow-nav"
      )
      .forEach(
        element =>
          element.remove()
      );


    const nav =
      document.createElement(
        "nav"
      );


    nav.className =
      "waspn-workflow-nav";


    nav.setAttribute(
      "aria-label",
      "WASPN chronological workflow"
    );


    const inner =
      document.createElement(
        "div"
      );


    inner.className =
      "waspn-workflow-inner";


    STEPS.forEach(
      step => {

        const link =
          document.createElement(
            "a"
          );


        link.href =
          step.href;


        link.className =
          "waspn-workflow-item";


        link.dataset.step =
          step.key;


        link.style.setProperty(
          "--workflow-active",
          step.color
        );


        link.addEventListener(
          "click",
          () => {

            setActive(
              step.key
            );

          }
        );


        const icon =
          document.createElement(
            "span"
          );


        icon.className =
          "waspn-workflow-icon";


        icon.textContent =
          step.icon;


        const label =
          document.createElement(
            "span"
          );


        label.className =
          "waspn-workflow-label";


        label.textContent =
          step.label;


        link.appendChild(
          icon
        );


        link.appendChild(
          label
        );


        inner.appendChild(
          link
        );

      }
    );


    nav.appendChild(
      inner
    );


    document.body.appendChild(
      nav
    );


    setActive(
      activeKey()
    );

  }



  /* ========================================
     START
  ======================================== */

  registerServiceWorker();


  const start = () => {

    injectStyles();

    applyComplianceSafetyOverride();

    applyJournalTiming();

    applyObjectiveDisplay();

    applyWindowBreachDisplay();

    buildNav();

  };


  if(
    document.readyState ===
    "loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      start
    );

  }

  else{

    start();

  }

})();