const CACHE_PREFIX =
  "waspn-pwa-";

const CACHE_NAME =
  "waspn-pwa-v5";

const APP_SHELL = [
  "./",
  "./index.html",
  "./live-risk.html",
  "./journal.html",
  "./compliance.html",
  "./calendar-2026.html",
  "./data-backup.html",
  "./workflow-nav.js?v=3",
  "./tradezero-live.js?v=2",
  "./tradezero-journal.js?v=3",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];


/* ========================================
   INSTALL
======================================== */

self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      caches
        .open(
          CACHE_NAME
        )
        .then(
          cache =>
            cache.addAll(
              APP_SHELL
            )
        )
        .then(
          () =>
            self.skipWaiting()
        )
    );

  }
);


/* ========================================
   ACTIVATE
======================================== */

self.addEventListener(
  "activate",
  event => {

    event.waitUntil(
      caches
        .keys()
        .then(
          keys =>
            Promise.all(
              keys.map(
                key => {

                  /*
                    Only delete old WASPN caches.

                    CacheStorage is origin-wide on
                    GitHub Pages. Never delete caches
                    belonging to another app/repo on
                    the same origin.
                  */

                  if(
                    key.startsWith(
                      CACHE_PREFIX
                    ) &&
                    key !==
                      CACHE_NAME
                  ){

                    return caches.delete(
                      key
                    );

                  }

                  return Promise.resolve();

                }
              )
            )
        )
        .then(
          () =>
            self.clients.claim()
        )
    );

  }
);


/* ========================================
   HELPERS
======================================== */

function isSameOrigin(
  request
){

  try{

    return (
      new URL(
        request.url
      ).origin ===
      self.location.origin
    );

  }

  catch{

    return false;

  }

}


function isNavigation(
  request
){

  return (
    request.mode ===
    "navigate"
  );

}


function isHtmlLike(
  request
){

  try{

    const url =
      new URL(
        request.url
      );

    return (
      isNavigation(
        request
      ) ||
      url.pathname.endsWith(
        ".html"
      ) ||
      url.pathname.endsWith(
        ".js"
      ) ||
      url.pathname.endsWith(
        ".webmanifest"
      )
    );

  }

  catch{

    return false;

  }

}


/* ========================================
   NETWORK FIRST
======================================== */

async function networkFirst(
  request
){

  try{

    const response =
      await fetch(
        request,
        {
          cache:
            "no-store"
        }
      );


    if(
      response &&
      response.ok
    ){

      const cache =
        await caches.open(
          CACHE_NAME
        );


      await cache.put(
        request,
        response.clone()
      );

    }


    return response;

  }

  catch{

    const cached =
      await caches.match(
        request
      );


    if(
      cached
    ){

      return cached;

    }


    if(
      isNavigation(
        request
      )
    ){

      return (
        await caches.match(
          "./index.html"
        )
      );

    }


    throw new Error(
      "Network unavailable and no cached response exists."
    );

  }

}


/* ========================================
   CACHE FIRST
======================================== */

async function cacheFirst(
  request
){

  const cached =
    await caches.match(
      request
    );


  if(
    cached
  ){

    fetch(
      request
    )
    .then(
      async response => {

        if(
          response &&
          response.ok
        ){

          const cache =
            await caches.open(
              CACHE_NAME
            );


          await cache.put(
            request,
            response.clone()
          );

        }

      }
    )
    .catch(
      () => {}
    );


    return cached;

  }


  const response =
    await fetch(
      request
    );


  if(
    response &&
    response.ok
  ){

    const cache =
      await caches.open(
        CACHE_NAME
      );


    await cache.put(
      request,
      response.clone()
    );

  }


  return response;

}


/* ========================================
   FETCH
======================================== */

self.addEventListener(
  "fetch",
  event => {

    const request =
      event.request;


    if(
      request.method !==
      "GET"
    ){

      return;

    }


    /*
      External requests — including the Replit
      TradeZero backend — pass straight through.

      Broker API responses are never cached.
    */

    if(
      !isSameOrigin(
        request
      )
    ){

      return;

    }


    if(
      isHtmlLike(
        request
      )
    ){

      event.respondWith(
        networkFirst(
          request
        )
      );

      return;

    }


    event.respondWith(
      cacheFirst(
        request
      )
    );

  }
);