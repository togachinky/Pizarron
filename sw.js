/*
  Service worker de Pizarrón.
  Objetivo: habilitar el botón "Instalar app" y que la app abra sin
  conexión, con editor, motor de pseudocódigo y ejemplos incluidos.
*/

const VERSION = "pizarron-v1";
const ARCHIVOS_APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./examples.js",
  "./engine.browser.js",
  "./pwa.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png"
];

// Librería externa usada sólo por el botón "App offline"; se guarda la
// primera vez que carga con internet, para que ese botón también
// funcione después sin conexión.
const LIBRERIAS_CDN = [
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      await cache.addAll(ARCHIVOS_APP_SHELL);
      await Promise.all(
        LIBRERIAS_CDN.map((url) =>
          fetch(url, { mode: "no-cors" }).then((res) => cache.put(url, res)).catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // JSZip (CDN): caché primero, para que "App offline" funcione sin conexión
  // una vez que se guardó con internet alguna vez.
  if (LIBRERIAS_CDN.includes(req.url)) {
    event.respondWith(
      caches.match(req).then((r) => r || fetch(req, { mode: "no-cors" }))
    );
    return;
  }

  const esMismoOrigen = new URL(req.url).origin === self.location.origin;

  if (!esMismoOrigen) {
    // Otros pedidos externos (tipografía de Google Fonts, etc.): se
    // intenta guardar una copia de paso para la próxima vez, pero sin
    // bloquear ni romper nada si falla (por ejemplo, fuentes con CORS
    // restringido). Nunca reemplaza la respuesta real de la red.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copia)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // HTML: red primero (para no quedar pegado con una versión vieja),
  // con la copia en caché como respaldo sin conexión.
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Resto de los archivos propios (CSS, JS, íconos): caché primero.
  event.respondWith(
    caches.match(req).then((r) => r || fetch(req))
  );
});
