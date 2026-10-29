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


        const trades =
          Array.isArray(
            day?.trades
          )
            ? day.trades
            : [];


        /*
          WINDOW RULE

          Only auto-confirm when every recorded
          trade has a reliable entry time and
          every entry is inside a WASPN window.
        */

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


        /*
          ATTEMPT RULE

          Partial/reconstructed broker history
          cannot prove there was no sixth trade.

          Auto-confirm only if the broker journal
          explicitly says the day's history is
          complete.
        */

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


        /*
          HARD STOP RULE

          Never automatically certify this.

          WASPN knowing that it locked itself
          does not prove that no later order
          was manually placed in TradeZero.
        */

        q3.checked =
          false;

        auto3?.classList.remove(
          "show"
        );

      };


    /*
      Re-run the current Compliance page after
      replacing its pre-fill logic.
    */

    window.loadDay();

  }



  /* ========================================
     CALENDAR DATE SAFETY
  ======================================== */

  function getNewYorkToday(){

    const parts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:"America/New_York",
          year:"numeric",
          month:"2-digit",
          day:"2-digit"
        }
      )
      .formatToParts(
        new Date()
      );


    const data =
      {};


    parts.forEach(
      part => {

        if(
          part.type !==
          "literal"
        ){

          data[
            part.type
          ] =
            part.value;

        }

      }
    );


    return {

      year:
        Number(
          data.year
        ),

      month:
        Number(
          data.month
        ),

      day:
        Number(
          data.day
        ),

      iso:
        data.year +
        "-" +
        data.month +
        "-" +
        data.day

    };

  }


  function normalizeCalendarFutureDays(){

    if(
      currentFile() !==
      "calendar-2026.html"
    ){
      return;
    }


    const today =
      getNewYorkToday();


    const monthMap = {

      Jan:1,
      Feb:2,
      Mar:3,
      Apr:4,
      May:5,
      Jun:6,
      Jul:7,
      Aug:8,
      Sep:9,
      Oct:10,
      Nov:11,
      Dec:12

    };


    document
      .querySelectorAll(
        "#calendarDays .day:not(.empty)"
      )
      .forEach(
        cell => {

          const text =
            cell
              .querySelector(
                ".date"
              )
              ?.textContent
              ?.trim();


          if(
            !text
          ){
            return;
          }


          const match =
            text.match(
              /^(\d{1,2})\s+([A-Za-z]{3})/
            );


          if(
            !match
          ){
            return;
          }


          const day =
            Number(
              match[1]
            );

          const month =
            monthMap[
              match[2]
            ];


          if(
            !month
          ){
            return;
          }


          const date =
            "2026-" +
            String(
              month
            )
            .padStart(
              2,
              "0"
            ) +
            "-" +
            String(
              day
            )
            .padStart(
              2,
              "0"
            );


          const isFuture =
            date >
            today.iso;


          cell.classList.toggle(
            "future",
            isFuture
          );

        }
      );

  }


  function applyCalendarSafetyOverride(){

    if(
      currentFile() !==
      "calendar-2026.html"
    ){
      return;
    }


    const today =
      getNewYorkToday();

    const buttons =
      Array.from(
        document.querySelectorAll(
          ".month-jump"
        )
      );


    if(
      buttons.length
    ){

      let targetMonth =
        today.month -
        1;


      if(
        today.year <
        2026
      ){

        targetMonth =
          0;

      }

      else if(
        today.year >
        2026
      ){

        targetMonth =
          11;

      }


      targetMonth =
        Math.max(
          0,
          Math.min(
            11,
            targetMonth
          )
        );


      const target =
        buttons[
          targetMonth
        ];


      if(
        target &&
        !target.classList.contains(
          "active"
        )
      ){

        target.click();

      }


      buttons.forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              setTimeout(
                normalizeCalendarFutureDays,
                0
              );

            }
          );

        }
      );

    }


    normalizeCalendarFutureDays();

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

    applyComplianceSafetyOverride();

    applyCalendarSafetyOverride();

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