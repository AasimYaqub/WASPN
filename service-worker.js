const CACHE_NAME = "waspn-pwa-v2";

const BASE_PATH = new URL("./", self.location.href).pathname;

const APP_SHELL = [
  BASE_PATH,
  BASE_PATH + "index.html",
  BASE_PATH + "live-risk.html",
  BASE_PATH + "journal.html",
  BASE_PATH + "compliance.html",
  BASE_PATH + "calendar-2026.html",
  BASE_PATH + "data-backup.html",
  BASE_PATH + "workflow-nav.js",
  BASE_PATH + "manifest.webmanifest",
  BASE_PATH + "futuristic_neon_wasp_trading_emblem.png"
];


/* ========================================
   INSTALL
======================================== */

self.addEventListener("install", event => {

  event.waitUntil(

    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())

  );

});


/* ========================================
   ACTIVATE
======================================== */

self.addEventListener("activate", event => {

  event.waitUntil(

    caches
      .keys()
      .then(keys =>

        Promise.all(

          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))

        )

      )
      .then(() => self.clients.claim())

  );

});


/* ========================================
   FETCH
======================================== */

self.addEventListener("fetch", event => {

  const request = event.request;

  if (request.method !== "GET") {
    return;
  }


  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }


  /* ======================================
     HTML / PAGE NAVIGATION

     ALWAYS TRY NETWORK FIRST.
     Prevents installed PWA from showing
     an old HTML page after deployment.
  ====================================== */

  if (request.mode === "navigate") {

    event.respondWith(

      fetch(request, {
        cache: "no-store"
      })
      .then(response => {

        if (
          response &&
          response.ok
        ) {

          const copy = response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache =>
              cache.put(
                request,
                copy
              )
            );

        }

        return response;

      })
      .catch(async () => {

        const cached =
          await caches.match(request);

        if (cached) {
          return cached;
        }


        const home =
          await caches.match(
            BASE_PATH + "index.html"
          );

        if (home) {
          return home;
        }


        return new Response(
          "WASPN is offline and this page is not cached.",
          {
            status: 503,
            statusText: "Offline",
            headers: {
              "Content-Type":
                "text/plain; charset=utf-8"
            }
          }
        );

      })

    );

    return;
  }


  /* ======================================
     APP ASSETS

     NETWORK FIRST → CACHE FALLBACK
  ====================================== */

  event.respondWith(

    fetch(request, {
      cache: "no-store"
    })
    .then(response => {

      if (
        response &&
        response.ok
      ) {

        const copy =
          response.clone();


        caches
          .open(CACHE_NAME)
          .then(cache =>
            cache.put(
              request,
              copy
            )
          );

      }


      return response;

    })
    .catch(async () => {

      const cached =
        await caches.match(request);


      if (cached) {
        return cached;
      }


      return new Response(
        "WASPN is offline and this resource is not cached.",
        {
          status: 503,
          statusText: "Offline",
          headers: {
            "Content-Type":
              "text/plain; charset=utf-8"
          }
        }
      );

    })

  );

});


/* ========================================
   FORCE UPDATE MESSAGE

   Allows the main app to tell the service
   worker to activate immediately.
======================================== */

self.addEventListener("message", event => {

  if (
    event.data &&
    event.data.type === "SKIP_WAITING"
  ) {

    self.skipWaiting();

  }

});