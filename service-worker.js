/* =========================================================
   WASPN SERVICE WORKER
   Version: v3
   ========================================================= */

const CACHE_NAME = "waspn-pwa-v3";
const CACHE_PREFIX = "waspn-pwa-";


/*
  Core WASPN application shell.
*/
const APP_SHELL = [

  "./",
  "./index.html",
  "./live-risk.html",
  "./journal.html",
  "./compliance.html",
  "./calendar-2026.html",
  "./data-backup.html",

  "./workflow-nav.js",

  "./manifest.webmanifest",

  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"

];


/* =========================================================
   INSTALL
========================================================= */

self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      installFreshAppShell()
        .then(
          () =>
            self.skipWaiting()
        )
    );

  }
);


async function installFreshAppShell(){

  const cache =
    await caches.open(
      CACHE_NAME
    );


  /*
    Explicitly request fresh copies during installation.

    This avoids carrying browser HTTP-cache versions into a
    newly installed WASPN service-worker cache.
  */
  for(
    const url of APP_SHELL
  ){

    try{

      const response =
        await fetch(
          url,
          {
            cache:"reload"
          }
        );


      if(
        response &&
        response.ok
      ){

        await cache.put(
          url,
          response.clone()
        );

      }

    }

    catch(error){

      /*
        One unavailable optional asset should not prevent the
        whole WASPN service worker from installing.
      */

    }

  }

}


/* =========================================================
   ACTIVATE
========================================================= */

self.addEventListener(
  "activate",
  event => {

    event.waitUntil(
      activateNewVersion()
    );

  }
);


async function activateNewVersion(){

  const cacheNames =
    await caches.keys();


  await Promise.all(

    cacheNames.map(
      cacheName => {

        if(
          cacheName.startsWith(
            CACHE_PREFIX
          ) &&
          cacheName !==
            CACHE_NAME
        ){

          return caches.delete(
            cacheName
          );

        }


        return Promise.resolve(
          false
        );

      }
    )

  );


  await self.clients.claim();

}


/* =========================================================
   FETCH
========================================================= */

self.addEventListener(
  "fetch",
  event => {

    const request =
      event.request;


    /*
      Only intercept GET requests.
    */
    if(
      request.method !==
      "GET"
    ){

      return;

    }


    const url =
      new URL(
        request.url
      );


    /*
      Do NOT intercept TradeZero / Replit / other external
      requests.

      This means WASPN 2.0 API calls go directly from the app
      to the secure backend.
    */
    if(
      url.origin !==
      self.location.origin
    ){

      return;

    }


    /*
      Never handle the service worker itself through its own
      runtime cache.
    */
    if(
      url.pathname.endsWith(
        "/service-worker.js"
      ) ||
      url.pathname.endsWith(
        "service-worker.js"
      )
    ){

      return;

    }


    /* -------------------------------------------------------
       HTML / NAVIGATION

       NETWORK FIRST.

       Live Risk, Journal, Review and other page updates should
       appear immediately when a newer GitHub Pages version is
       available.
    ------------------------------------------------------- */

    if(
      request.mode ===
        "navigate" ||
      request.destination ===
        "document" ||
      url.pathname.endsWith(
        ".html"
      ) ||
      url.pathname.endsWith(
        "/"
      )
    ){

      event.respondWith(
        networkFirst(
          request
        )
      );

      return;

    }


    /* -------------------------------------------------------
       APP JAVASCRIPT + MANIFEST

       Also NETWORK FIRST.

       These files control WASPN functionality and navigation,
       so stale code is more dangerous than a slightly slower
       first request.
    ------------------------------------------------------- */

    if(
      url.pathname.endsWith(
        ".js"
      ) ||
      url.pathname.endsWith(
        ".webmanifest"
      )
    ){

      event.respondWith(
        networkFirst(
          request
        )
      );

      return;

    }


    /* -------------------------------------------------------
       IMAGES / ICONS / OTHER STATIC ASSETS

       CACHE FIRST + BACKGROUND REFRESH.
    ------------------------------------------------------- */

    event.respondWith(
      cacheFirstWithRefresh(
        request
      )
    );

  }
);


/* =========================================================
   NETWORK FIRST
========================================================= */

async function networkFirst(
  request
){

  try{

    const networkResponse =
      await fetch(
        request,
        {
          cache:"no-store"
        }
      );


    if(
      networkResponse &&
      networkResponse.ok
    ){

      const cache =
        await caches.open(
          CACHE_NAME
        );


      await cache.put(
        request,
        networkResponse.clone()
      );

    }


    return networkResponse;

  }

  catch(error){

    /*
      Try the exact cached request first.
    */
    const cachedResponse =
      await caches.match(
        request
      );


    if(
      cachedResponse
    ){

      return cachedResponse;

    }


    /*
      If a query string was used, try the same path without it.
    */
    try{

      const url =
        new URL(
          request.url
        );


      url.search =
        "";


      const cleanRequest =
        new Request(
          url.toString(),
          {
            method:"GET"
          }
        );


      const cleanCached =
        await caches.match(
          cleanRequest
        );


      if(
        cleanCached
      ){

        return cleanCached;

      }

    }

    catch{

    }


    /*
      Final navigation fallback.
    */
    if(
      request.mode ===
        "navigate" ||
      request.destination ===
        "document"
    ){

      const home =
        await caches.match(
          "./index.html"
        );


      if(
        home
      ){

        return home;

      }


      return offlinePage();

    }


    return new Response(
      "",
      {
        status:503,
        statusText:"Offline"
      }
    );

  }

}


/* =========================================================
   CACHE FIRST + BACKGROUND REFRESH
========================================================= */

async function cacheFirstWithRefresh(
  request
){

  const cache =
    await caches.open(
      CACHE_NAME
    );


  const cachedResponse =
    await cache.match(
      request
    );


  const networkPromise =
    fetch(
      request,
      {
        cache:"no-cache"
      }
    )
    .then(
      async networkResponse => {

        if(
          networkResponse &&
          networkResponse.ok
        ){

          await cache.put(
            request,
            networkResponse.clone()
          );

        }


        return networkResponse;

      }
    )
    .catch(
      () =>
        null
    );


  if(
    cachedResponse
  ){

    /*
      Refresh continues in the background.
    */
    return cachedResponse;

  }


  const networkResponse =
    await networkPromise;


  if(
    networkResponse
  ){

    return networkResponse;

  }


  return new Response(
    "",
    {
      status:503,
      statusText:"Offline"
    }
  );

}


/* =========================================================
   OFFLINE PAGE
========================================================= */

function offlinePage(){

  return new Response(
    `
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1.0,viewport-fit=cover"
>

<meta
  name="theme-color"
  content="#070b10"
>

<title>WASPN • Offline</title>

<style>

*{
  box-sizing:border-box;
}

html,
body{

  margin:0;

  min-height:100%;

  background:#070b10;

  color:#edf4fb;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Arial,
    sans-serif;

}

body{

  min-height:100vh;
  min-height:100dvh;

  display:flex;

  align-items:center;
  justify-content:center;

  padding:24px;

}

.card{

  width:100%;
  max-width:420px;

  padding:24px;

  text-align:center;

  background:#10171f;

  border:
    1px solid
    #273442;

  border-radius:18px;

}

.brand{

  color:#22c7ff;

  font-size:12px;
  font-weight:950;

  letter-spacing:2.4px;

}

h1{

  margin:
    10px 0 8px;

  font-size:24px;

}

p{

  margin:0;

  color:#8797a7;

  font-size:14px;

  line-height:1.5;

}

</style>

</head>


<body>

<div class="card">

  <div class="brand">
    WASPN
  </div>

  <h1>
    Offline
  </h1>

  <p>
    This WASPN page is not available in the local cache yet.
    Reconnect to the internet and open WASPN once to refresh
    the offline application shell.
  </p>

</div>

</body>

</html>
    `,
    {
      status:503,

      headers:{
        "Content-Type":
          "text/html; charset=utf-8"
      }

    }
  );

}


/* =========================================================
   MESSAGE HANDLER
========================================================= */

self.addEventListener(
  "message",
  event => {

    if(
      event.data &&
      event.data.type ===
        "SKIP_WAITING"
    ){

      self.skipWaiting();

    }

  }
);