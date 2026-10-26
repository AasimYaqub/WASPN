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

            /*
              Check GitHub for a newer worker
              whenever WASPN is opened online.
            */

            registration.update();

          }
        )
        .catch(
          error => {

            /*
              A failed registration must never
              interfere with trading controls.
            */

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