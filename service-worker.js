/* =========================================================
   WASPN SERVICE WORKER
   Version: v2
   ========================================================= */

const CACHE_NAME = "waspn-pwa-v2";
const CACHE_PREFIX = "waspn-pwa-";

/*
  Core WASPN app shell.

  Keep these paths relative so the service worker works
  correctly from GitHub Pages.
*/
const APP_SHELL = [
  "./",
  "./index.html",
  "./live-risk.html",
  "./journal.html",
  "./calendar-2026.html",
  "./data-backup.html",
  "./workflow-nav.js",
  "./manifest.webmanifest",
  "./apple-touch-icon.png"
];


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener("install", event => {

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        /*
          Activate this service worker immediately instead
          of waiting for every old tab/window to close.
        */
        return self.skipWaiting();
      })
  );

});


/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener("activate", event => {

  event.waitUntil(
    Promise.all([

      /*
        Delete old WASPN cache versions.
      */
      caches
        .keys()
        .then(cacheNames => {
          return Promise.all(
            cacheNames.map(cacheName => {

              if(
                cacheName.startsWith(CACHE_PREFIX) &&
                cacheName !== CACHE_NAME
              ){
                return caches.delete(cacheName);
              }

              return Promise.resolve(false);
            })
          );
        }),

      /*
        Immediately control already-open WASPN pages.
      */
      self.clients.claim()

    ])
  );

});


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener("fetch", event => {

  const request = event.request;

  /*
    Only handle normal GET requests.
  */
  if(request.method !== "GET"){
    return;
  }

  const url = new URL(request.url);

  /*
    Ignore requests outside this site's origin.
  */
  if(url.origin !== self.location.origin){
    return;
  }


  /* ---------------------------------------------------------
     HTML / PAGE NAVIGATION
     NETWORK FIRST

     This is important for WASPN because changes to pages such
     as Live Risk, Journal and Review should appear as soon as
     the updated GitHub Pages version is available.

     If the network fails, use the cached version.
     --------------------------------------------------------- */

  if(
    request.mode === "navigate" ||
    request.destination === "document" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/")
  ){

    event.respondWith(
      networkFirst(request)
    );

    return;
  }


  /* ---------------------------------------------------------
     SERVICE WORKER ITSELF

     Never serve the service worker from this service worker's
     runtime cache.
     --------------------------------------------------------- */

  if(
    url.pathname.endsWith("/service-worker.js") ||
    url.pathname.endsWith("service-worker.js")
  ){
    return;
  }


  /* ---------------------------------------------------------
     STATIC FILES
     CACHE FIRST + BACKGROUND REFRESH

     Good for:
     - JS
     - CSS
     - images
     - icons
     - manifest
     - fonts

     Cached assets load quickly, while the network response
     refreshes the cache in the background.
     --------------------------------------------------------- */

  event.respondWith(
    cacheFirstWithRefresh(request)
  );

});


/* =========================================================
   NETWORK FIRST
   ========================================================= */

async function networkFirst(request){

  try{

    /*
      cache:"no-store" tells the browser HTTP cache not to
      hand us an old HTML page before we reach the network.
    */
    const networkResponse = await fetch(
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
        await caches.open(CACHE_NAME);

      await cache.put(
        request,
        networkResponse.clone()
      );

    }

    return networkResponse;

  }

  catch(error){

    /*
      Network unavailable.
      Try the exact cached page.
    */
    const cachedResponse =
      await caches.match(request);

    if(cachedResponse){
      return cachedResponse;
    }


    /*
      Final offline fallback.
    */
    const home =
      await caches.match("./index.html");

    if(home){
      return home;
    }


    /*
      Nothing cached.
    */
    return new Response(
      `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta
            name="viewport"
            content="width=device-width,initial-scale=1.0"
          >
          <meta name="theme-color" content="#070b10">

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
              border:1px solid #273442;
              border-radius:18px;
            }

            .brand{
              color:#22c7ff;
              font-size:12px;
              font-weight:950;
              letter-spacing:2.4px;
            }

            h1{
              margin:10px 0 8px;
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
            <div class="brand">WASPN</div>

            <h1>Offline</h1>

            <p>
              This WASPN page is not available in the local
              cache yet. Reconnect to the internet and reload
              the app once.
            </p>
          </div>

        </body>
        </html>
      `,
      {
        status:503,
        headers:{
          "Content-Type":"text/html; charset=utf-8"
        }
      }
    );

  }

}


/* =========================================================
   CACHE FIRST + BACKGROUND REFRESH
   ========================================================= */

async function cacheFirstWithRefresh(request){

  const cache =
    await caches.open(CACHE_NAME);

  const cachedResponse =
    await cache.match(request);

  /*
    Start a network refresh even if we already have a cached
    response.
  */
  const networkPromise =
    fetch(request)
      .then(async networkResponse => {

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

      })
      .catch(() => null);


  /*
    If cached, return immediately.
  */
  if(cachedResponse){

    /*
      Allow the refresh to continue in the background.
    */
    return cachedResponse;

  }


  /*
    Nothing cached, so wait for the network.
  */
  const networkResponse =
    await networkPromise;

  if(networkResponse){
    return networkResponse;
  }


  /*
    No cache and no network response.
  */
  return new Response(
    "",
    {
      status:503,
      statusText:"Offline"
    }
  );

}


/* =========================================================
   MESSAGE HANDLER

   Allows the app to explicitly tell a waiting service worker
   to activate if you ever add an update button later.
   ========================================================= */

self.addEventListener("message", event => {

  if(
    event.data &&
    event.data.type === "SKIP_WAITING"
  ){
    self.skipWaiting();
  }

});