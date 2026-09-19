// ============================================================
// PWA — instalar como app y descargar la app completa (offline)
// No toca app.js: usa sus mismos elementos (#toastStack, modales)
// pero de forma independiente, para no interferir con el editor.
// ============================================================
(function () {
  "use strict";

  function toast(mensaje, tipo) {
    const stack = document.getElementById("toastStack");
    if (!stack) { console.log(mensaje); return; }
    const el = document.createElement("div");
    el.className = "toast" + (tipo === "error" ? " error" : "");
    el.textContent = mensaje;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  // ----------------------------------------------------------
  // 1. Service worker: hace que la app abra sin conexión
  // ----------------------------------------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.warn("No se pudo registrar el service worker (la app funciona igual, sin caché offline):", err);
      });
    });
  }

  // ----------------------------------------------------------
  // 2. Botón «Instalar app»
  // ----------------------------------------------------------
  const btnInstall = document.getElementById("btnInstallApp");
  let promptDiferido = null;

  const yaEstaInstalada = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  const esIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS moderno se anuncia como Mac

  if (btnInstall) {
    if (yaEstaInstalada()) {
      btnInstall.style.display = "none";
    } else if (esIOS()) {
      // Safari no dispara "beforeinstallprompt": mostramos el botón igual,
      // y al tocarlo explicamos el paso manual con el modal ya armado en el HTML.
      btnInstall.style.display = "";
      btnInstall.addEventListener("click", () => {
        const modal = document.getElementById("modalInstalarIOS");
        if (modal) modal.classList.remove("hidden");
      });
    } else {
      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        promptDiferido = e;
        btnInstall.style.display = "";
      });
      btnInstall.addEventListener("click", async () => {
        if (!promptDiferido) return;
        btnInstall.disabled = true;
        promptDiferido.prompt();
        try { await promptDiferido.userChoice; } catch (e) {}
        promptDiferido = null;
        btnInstall.disabled = false;
        btnInstall.style.display = "none";
      });
      window.addEventListener("appinstalled", () => {
        btnInstall.style.display = "none";
        promptDiferido = null;
        toast("Pizarrón instalado ✅");
      });
    }
  }

  // ----------------------------------------------------------
  // 3. Botón «App offline»: descarga toda la app en un .zip
  // ----------------------------------------------------------
  const btnDownload = document.getElementById("btnDownloadApp");
  if (btnDownload) {
    btnDownload.addEventListener("click", async () => {
      if (typeof JSZip === "undefined") {
        toast("No se pudo preparar la descarga (revisá tu conexión a internet).", "error");
        return;
      }

      const textoOriginal = btnDownload.innerHTML;
      btnDownload.disabled = true;
      btnDownload.innerHTML = '<span class="ic">⏳</span><span class="txt">Empaquetando…</span>';

      try {
        const zip = new JSZip();
        const base = new URL(".", location.href);
        const archivos = [
          "index.html",
          "styles.css",
          "app.js",
          "examples.js",
          "engine.browser.js",
          "pwa.js",
          "sw.js",
          "manifest.json",
          "icon-192.png",
          "icon-512.png",
          "icon-512-maskable.png",
          "apple-touch-icon.png"
        ];

        let algunoFalló = false;
        for (const nombre of archivos) {
          try {
            const res = await fetch(new URL(nombre, base).href, { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            zip.file(nombre, await res.blob());
          } catch (err) {
            console.warn("No se pudo incluir", nombre, err);
            algunoFalló = true;
          }
        }

        zip.file("LEEME.txt",
`PIZARRÓN — paquete descargado
==============================

Qué es esto
-----------
Una copia completa de la app: editor, motor de pseudocódigo, íconos,
manifest y service worker.

Cómo usarla
-----------
- Abrir "index.html" con doble clic funciona directo, sin instalar nada
  ni necesitar conexión: es HTML/CSS/JS puro, sin backend.
- La única parte que pide internet es la tipografía (Google Fonts) y,
  la primera vez, la librería JSZip para este mismo botón de descarga;
  si no hay conexión, la app usa una fuente del sistema como reemplazo
  y el resto funciona igual.

Instalarla como app (recomendado para uso diario)
----------------------------------------------------
1. Subí esta carpeta a un hosting con HTTPS (GitHub Pages, Netlify Drop,
   Vercel, etc.) — es gratis y tarda un par de minutos.
2. Abrí esa dirección una vez, con internet, y tocá "📲 Instalar app"
   (en iPhone/iPad: Compartir → "Agregar a inicio").
3. De ahí en más abre sin conexión, como cualquier app instalada.

Archivos incluidos
-------------------
index.html                    — la app
styles.css                    — estilos
app.js                        — lógica del editor/consola/variables
examples.js                   — ejemplos del menú
engine.browser.js             — motor de pseudocódigo
pwa.js                        — instalar / descargar app
sw.js                         — funcionamiento sin conexión
manifest.json                 — datos para "instalarla"
icon-192.png / icon-512.png /
icon-512-maskable.png /
apple-touch-icon.png          — íconos

(El código fuente del motor, separado en lexer/parser/intérprete, no se
incluye acá porque no hace falta para usar la app; si lo necesitás para
modificarlo, pedilo aparte.)
`);

        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pizarron-app.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);

        if (algunoFalló) {
          toast("Se descargó el .zip, pero faltó algún archivo. Revisá el LEEME.txt de adentro.", "error");
        } else {
          toast("App descargada ✅ (pizarron-app.zip)");
        }
      } catch (err) {
        console.error("Error armando el .zip de descarga:", err);
        toast("No se pudo armar la descarga. Intentá de nuevo.", "error");
      } finally {
        btnDownload.disabled = false;
        btnDownload.innerHTML = textoOriginal;
      }
    });
  }
})();
