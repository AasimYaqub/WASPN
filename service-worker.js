const CACHE_NAME = "waspn-pwa-v1";

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
  BASE_PATH + "futuristic_neon_wasp_trading_emblem.png",
  BASE_PATH + "trade_the_process_waspn_trading_command_centre.png"
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

              keys
                .filter(
                  key =>
                    key !==
                    CACHE_NAME
                )
                .map(
                  key =>
                    caches.delete(
                      key
                    )
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
   FETCH
   NETWORK FIRST → CACHE FALLBACK
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


    const url =
      new URL(
        request.url
      );


    if(
      url.origin !==
      self.location.origin
    ){

      return;

    }


    event.respondWith(

      fetch(
        request
      )
      .then(
        response => {

          if(
            response &&
            response.status === 200
          ){

            const copy =
              response.clone();


            caches
              .open(
                CACHE_NAME
              )
              .then(
                cache =>
                  cache.put(
                    request,
                    copy
                  )
              );

          }


          return response;

        }
      )
      .catch(
        async () => {

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
            request.mode ===
            "navigate"
          ){

            return caches.match(
              BASE_PATH +
              "index.html"
            );

          }


          return new Response(
            "WASPN is offline and this resource is not cached.",
            {
              status:503,
              statusText:"Offline",
              headers:{
                "Content-Type":
                  "text/plain"
              }
            }
          );

        }
      )

    );

  }
);