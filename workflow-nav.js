(() => {

  const STEPS = [
    {
      key: "home",
      label: "Home",
      icon: "⌂",
      href: "index.html",
      color: "#22c7ff"
    },
    {
      key: "risk",
      label: "Risk",
      icon: "1",
      href: "live-risk.html#top",
      color: "#22c7ff"
    },
    {
      key: "timer",
      label: "Timer",
      icon: "◷",
      href: "live-risk.html#timerSection",
      color: "#f3b84b"
    },
    {
      key: "journal",
      label: "Journal",
      icon: "2",
      href: "journal.html",
      color: "#75dbe7"
    },
    {
      key: "end",
      label: "End",
      icon: "3",
      href: "compliance.html",
      color: "#35d07f"
    },
    {
      key: "review",
      label: "Review",
      icon: "4",
      href: "calendar-2026.html",
      color: "#aeb7ff"
    }
  ];


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

      if(
        window.location.hash ===
        "#timerSection"
      ){
        return "timer";
      }


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
          6px
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
            6,
            minmax(0,1fr)
          );

        gap:4px;

      }


      .waspn-workflow-item{

        position:relative;

        min-width:0;
        min-height:59px;

        display:flex;

        flex-direction:column;

        align-items:center;
        justify-content:center;

        gap:3px;

        padding:
          6px 1px;

        overflow:hidden;

        border:
          1px solid
          #283645;

        border-radius:11px;

        background:
          linear-gradient(
            180deg,
            #111922,
            #0d141b
          );

        color:#94a2b0;

        text-decoration:none;

        text-align:center;

        font-size:
          clamp(
            7px,
            2.1vw,
            9px
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
          scale(.95);

      }


      .waspn-workflow-icon{

        min-width:23px;
        height:23px;

        display:flex;

        align-items:center;
        justify-content:center;

        color:white;

        font-size:13px;
        font-weight:950;

        line-height:1;

      }


      .waspn-workflow-item[data-step="home"]
      .waspn-workflow-icon{

        font-size:17px;

      }


      .waspn-workflow-item[data-step="timer"]
      .waspn-workflow-icon{

        font-size:17px;

      }


      .waspn-workflow-label{

        width:100%;

        overflow:hidden;

        text-overflow:ellipsis;

        white-space:nowrap;

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
          inset 0 0 18px
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

        left:9px;
        right:9px;
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
          0 0 8px
          var(
            --workflow-active,
            #22c7ff
          );

      }


      @media(max-width:390px){

        .waspn-workflow-nav{
          padding-left:4px;
          padding-right:4px;
        }


        .waspn-workflow-inner{
          gap:3px;
        }


        .waspn-workflow-item{

          min-height:56px;

          border-radius:9px;

          font-size:7px;

        }


        .waspn-workflow-icon{

          min-width:21px;
          height:21px;

          font-size:12px;

        }

      }

    `;


    document.head.appendChild(
      style
    );

  }


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


  function refreshActive(){

    setActive(
      activeKey()
    );

  }


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

            /*
              Gives immediate visual feedback
              before navigation / hash movement.
            */

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


    refreshActive();

  }


  window.addEventListener(
    "hashchange",
    refreshActive
  );


  window.addEventListener(
    "popstate",
    refreshActive
  );


  if(
    document.readyState ===
    "loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      buildNav
    );

  }

  else{

    buildNav();

  }

})();