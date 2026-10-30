const CACHE_PREFIX =
  "waspn-pwa-";

const CACHE_NAME =
  "waspn-pwa-v16";

const APP_SHELL = [
  "./",
  "./index.html",
  "./session-rules.js?v=4",
  "./live-risk.html",
  "./journal.html",
  "./compliance.html",
  "./calendar-2026.html",
  "./data-backup.html",
  "./premium-theme.css?v=5",
  "./mobile-dock-fix.css?v=2",
  "./workflow-nav.js?v=5",
  "./review-broker-indicators.js?v=1",
  "./tradezero-live.js?v=4",
  "./tradezero-journal.js?v=4",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

const WASPN_BACKEND_ORIGIN =
  "https://wasp-backend-api.replit.app";

const TOKEN_DB_NAME =
  "waspn-secure-auth";

const TOKEN_DB_VERSION =
  1;

const TOKEN_STORE_NAME =
  "auth";

const TOKEN_KEY =
  "api-token";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => {
          if(key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME){
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      ))
      .then(() => self.clients.claim())
  );
});

function openTokenDatabase(){
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(TOKEN_DB_NAME,TOKEN_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if(!database.objectStoreNames.contains(TOKEN_STORE_NAME)){
        database.createObjectStore(TOKEN_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveApiToken(token){
  const clean = String(token || "").trim();

  if(!clean){
    await clearApiToken();
    return;
  }

  const database = await openTokenDatabase();

  await new Promise((resolve,reject) => {
    const transaction = database.transaction(TOKEN_STORE_NAME,"readwrite");
    transaction.objectStore(TOKEN_STORE_NAME).put(clean,TOKEN_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  database.close();
}

async function getApiToken(){
  try{
    const database = await openTokenDatabase();
    const value = await new Promise((resolve,reject) => {
      const transaction = database.transaction(TOKEN_STORE_NAME,"readonly");
      const request = transaction.objectStore(TOKEN_STORE_NAME).get(TOKEN_KEY);
      request.onsuccess = () => resolve(request.result || "");
      request.onerror = () => reject(request.error);
    });
    database.close();
    return String(value || "").trim();
  }
  catch{
    return "";
  }
}

async function clearApiToken(){
  try{
    const database = await openTokenDatabase();
    await new Promise((resolve,reject) => {
      const transaction = database.transaction(TOKEN_STORE_NAME,"readwrite");
      transaction.objectStore(TOKEN_STORE_NAME).delete(TOKEN_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }
  catch{
    // Clearing an absent/unavailable token store is harmless.
  }
}

self.addEventListener("message", event => {
  const data = event.data;
  if(!data || typeof data !== "object") return;

  if(data.type === "WASPN_ACTIVATE_UPDATE"){
    event.waitUntil(self.skipWaiting());
    return;
  }

  if(data.type === "WASPN_ACTIVATE_UPDATE"){
    event.waitUntil(self.skipWaiting());
    return;
  }

  if(data.type === "WASPN_SET_API_TOKEN"){
    event.waitUntil(
      saveApiToken(data.token)
        .then(() => event.source?.postMessage({type:"WASPN_API_TOKEN_SAVED"}))
    );
    return;
  }

  if(data.type === "WASPN_CLEAR_API_TOKEN"){
    event.waitUntil(
      clearApiToken()
        .then(() => event.source?.postMessage({type:"WASPN_API_TOKEN_CLEARED"}))
    );
    return;
  }

  if(data.type === "WASPN_CHECK_API_TOKEN"){
    event.waitUntil(
      getApiToken()
        .then(token => event.source?.postMessage({
          type:"WASPN_API_TOKEN_STATUS",
          configured:Boolean(token)
        }))
    );
  }
});

function isSameOrigin(request){
  try{
    return new URL(request.url).origin === self.location.origin;
  }
  catch{
    return false;
  }
}

function isNavigation(request){
  return request.mode === "navigate";
}

function isHtmlLike(request){
  try{
    const url = new URL(request.url);
    return (
      isNavigation(request) ||
      url.pathname.endsWith(".html") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".webmanifest")
    );
  }
  catch{
    return false;
  }
}

function isHtmlDocument(request,response){
  if(!response?.ok) return false;
  if(isNavigation(request)) return true;
  try{
    const url = new URL(request.url);
    return url.pathname.endsWith(".html");
  }
  catch{
    return false;
  }
}

async function applyPremiumTheme(request,response){
  if(!isHtmlDocument(request,response)) return response;

  const text = await response.text();
  const hasTheme = text.includes("premium-theme.css") && text.includes("mobile-dock-fix.css");
  const hasReviewIndicators = text.includes("review-broker-indicators.js");

  if(hasTheme && hasReviewIndicators){
    return new Response(text,response);
  }

  const theme = '<link rel="stylesheet" href="./premium-theme.css?v=5" data-waspn-premium-theme="true">\n<link rel="stylesheet" href="./mobile-dock-fix.css?v=2" data-waspn-dock-fix="true">';
  const indicatorScript = '<script src="./review-broker-indicators.js?v=1" defer data-waspn-review-indicators="true"></script>';

  let themed = text;

  if(!hasTheme){
    themed = themed.includes("</head>")
      ? themed.replace("</head>",theme + "\n</head>")
      : theme + themed;
  }

  if(!hasReviewIndicators){
    themed = themed.includes("</body>")
      ? themed.replace("</body>",indicatorScript + "\n</body>")
      : themed + "\n" + indicatorScript;
  }

  return new Response(themed,{
    status:response.status,
    statusText:response.statusText,
    headers:response.headers
  });
}

function isProtectedBackendRequest(request){
  try{
    const url = new URL(request.url);
    if(url.origin !== WASPN_BACKEND_ORIGIN) return false;

    return (
      url.pathname.startsWith("/api/waspn/") ||
      url.pathname.startsWith("/api/tradezero/")
    );
  }
  catch{
    return false;
  }
}

async function authenticatedBackendFetch(request){
  const token = await getApiToken();
  const headers = new Headers(request.headers);

  if(token){
    headers.set("Authorization","Bearer " + token);
  }

  const authenticatedRequest = new Request(
    request,
    {
      headers,
      cache:"no-store"
    }
  );

  return fetch(authenticatedRequest);
}

async function networkFirst(request){
  try{
    const fetched = await fetch(request,{cache:"no-store"});
    const response = await applyPremiumTheme(request,fetched);

    if(response && response.ok){
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request,response.clone());
    }

    return response;
  }
  catch{
    const cached = await caches.match(request);
    if(cached) return cached;

    if(isNavigation(request)){
      return await caches.match("./index.html");
    }

    throw new Error("Network unavailable and no cached response exists.");
  }
}

async function cacheFirst(request){
  const cached = await caches.match(request);

  if(cached){
    fetch(request)
      .then(async response => {
        if(response && response.ok){
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request,response.clone());
        }
      })
      .catch(() => {});

    return cached;
  }

  const response = await fetch(request);

  if(response && response.ok){
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request,response.clone());
  }

  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;

  if(isProtectedBackendRequest(request)){
    if(request.method === "GET"){
      event.respondWith(authenticatedBackendFetch(request));
    }
    return;
  }

  if(request.method !== "GET") return;

  if(!isSameOrigin(request)) return;

  if(isHtmlLike(request)){
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
