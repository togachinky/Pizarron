// ============================================================
// APP — interfaz de Pizarrón (editor + consola + variables)
// ============================================================
(function () {
  "use strict";

  const Engine = window.Engine;
  const STORAGE_KEY = "pizarron.codigo";
  const THEME_KEY = "pizarron.tema";

  const DEFAULT_CODE = `Proceso MiPrimerPrograma
    Escribir "Hola, mundo!"
FinProceso
`;

  // ---------------- Referencias al DOM ----------------
  const $ = (sel) => document.querySelector(sel);
  const codeInput = $("#codeInput");
  const highlightLayer = $("#highlightLayer");
  const gutter = $("#gutter");
  const consoleOutput = $("#consoleOutput");
  const varsBody = $("#varsBody");
  const statusDot = $("#statusDot");
  const statusText = $("#statusText");
  const cursorPos = $("#cursorPos");
  const autosaveMsg = $("#autosaveMsg");
  const toastStack = $("#toastStack");

  const btnRun = $("#btnRun");
  const btnStep = $("#btnStep");
  const btnStop = $("#btnStop");
  const btnNew = $("#btnNew");
  const btnOpen = $("#btnOpen");
  const btnSave = $("#btnSave");
  const btnExamples = $("#btnExamples");
  const btnHelp = $("#btnHelp");
  const btnTheme = $("#btnTheme");
  const btnClearConsole = $("#btnClearConsole");
  const btnCollapseVars = $("#btnCollapseVars");
  const fileInput = $("#fileInput");

  const paneVars = $("#paneVars");

  // ---------------- Estado ----------------
  let runState = "idle"; // idle | running | waitingInput | paused | finished | error
  let currentGen = null;
  let currentInterp = null;
  let stepMode = false;
  let currentLine = null;
  let errorLine = null;
  let resumeValue = undefined;
  let pendingInputName = null;

  // ==========================================================
  // RESALTADO DE SINTAXIS (independiente del lexer real, para
  // que no explote mientras el usuario está escribiendo)
  // ==========================================================
  const HL_KEYWORDS = new Set([
    "proceso", "algoritmo", "finproceso", "finalgoritmo",
    "definir", "dimension", "como",
    "entero", "real", "cadena", "caracter", "logico", "numerico", "booleano",
    "escribir", "leer", "sin", "saltar",
    "si", "entonces", "sino", "finsi",
    "segun", "hacer", "de", "otro", "modo", "finsegun",
    "mientras", "finmientras",
    "repetir", "hasta", "que",
    "para", "desde", "con", "paso", "finpara",
    "funcion", "finfuncion",
    "subproceso", "subalgoritmo", "finsubproceso", "finsubalgoritmo",
    "y", "o", "no", "mod", "div", "ref",
  ]);
  const HL_BOOL = new Set(["verdadero", "falso"]);

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function highlightLine(line) {
    // Comentario de línea completa
    const commentIdx = line.indexOf("//");
    let code = line;
    let comment = "";
    if (commentIdx !== -1 && !isInsideString(line, commentIdx)) {
      comment = line.slice(commentIdx);
      code = line.slice(0, commentIdx);
    }
    let out = "";
    let i = 0;
    const n = code.length;
    while (i < n) {
      const ch = code[i];
      if (ch === '"' || ch === "'") {
        const quote = ch;
        let j = i + 1;
        while (j < n && code[j] !== quote) j++;
        const seg = code.slice(i, Math.min(j + 1, n));
        out += `<span class="tok-str">${escapeHtml(seg)}</span>`;
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        let j = i;
        while (j < n && /[0-9.]/.test(code[j])) j++;
        out += `<span class="tok-num">${escapeHtml(code.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      if (/[A-Za-zÀ-ÿ_ñÑ]/.test(ch)) {
        let j = i;
        while (j < n && /[A-Za-zÀ-ÿ0-9_ñÑ]/.test(code[j])) j++;
        const word = code.slice(i, j);
        const lower = word.toLowerCase();
        if (HL_BOOL.has(lower)) out += `<span class="tok-bool">${escapeHtml(word)}</span>`;
        else if (HL_KEYWORDS.has(lower)) out += `<span class="tok-kw">${escapeHtml(word)}</span>`;
        else out += escapeHtml(word);
        i = j;
        continue;
      }
      out += escapeHtml(ch);
      i++;
    }
    if (comment) out += `<span class="tok-com">${escapeHtml(comment)}</span>`;
    return out || "\u200b";
  }

  function isInsideString(line, idx) {
    let inStr = false, quote = null;
    for (let k = 0; k < idx; k++) {
      const c = line[k];
      if (!inStr && (c === '"' || c === "'")) { inStr = true; quote = c; }
      else if (inStr && c === quote) { inStr = false; }
    }
    return inStr;
  }

  function renderHighlight() {
    const lines = codeInput.value.split("\n");
    const html = lines
      .map((l, idx) => {
        let cls = "line";
        if (idx + 1 === currentLine) cls += " exec-line";
        if (idx + 1 === errorLine) cls += " error-line";
        return `<div class="${cls}">${highlightLine(l)}</div>`;
      })
      .join("");
    highlightLayer.innerHTML = html;
    renderGutter(lines.length);
    syncScroll();
  }

  function renderGutter(count) {
    let html = "";
    for (let i = 1; i <= count; i++) {
      let cls = "";
      if (i === currentLine) cls = "gutter-exec";
      if (i === errorLine) cls = "gutter-err";
      html += `<div class="${cls}">${i}</div>`;
    }
    gutter.innerHTML = html;
  }

  function syncScroll() {
    highlightLayer.scrollTop = codeInput.scrollTop;
    highlightLayer.scrollLeft = codeInput.scrollLeft;
    gutter.scrollTop = codeInput.scrollTop;
  }

  codeInput.addEventListener("input", () => {
    renderHighlight();
    autosave();
  });
  codeInput.addEventListener("scroll", syncScroll);
  codeInput.addEventListener("keyup", updateCursorPos);
  codeInput.addEventListener("click", updateCursorPos);

  // Tabulación con Tab (en vez de sacar el foco)
  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      insertAtCursor("    ");
    }
    if (e.key === "F9") {
      e.preventDefault();
      runProgram(false);
    }
    // Auto-indentación básica al hacer Enter
    if (e.key === "Enter") {
      const pos = codeInput.selectionStart;
      const before = codeInput.value.slice(0, pos);
      const lineStart = before.lastIndexOf("\n") + 1;
      const currentLineText = before.slice(lineStart);
      const indentMatch = currentLineText.match(/^[ \t]*/);
      let indent = indentMatch ? indentMatch[0] : "";
      if (/(Entonces|Hacer|Repetir)\s*$/i.test(currentLineText.trim())) indent += "    ";
      if (indent) {
        e.preventDefault();
        insertAtCursor("\n" + indent);
      }
    }
  });

  function insertAtCursor(text) {
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    const value = codeInput.value;
    codeInput.value = value.slice(0, start) + text + value.slice(end);
    const newPos = start + text.length;
    codeInput.selectionStart = codeInput.selectionEnd = newPos;
    codeInput.focus();
    renderHighlight();
    autosave();
    updateCursorPos();
  }

  function updateCursorPos() {
    const pos = codeInput.selectionStart;
    const before = codeInput.value.slice(0, pos);
    const lines = before.split("\n");
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    cursorPos.textContent = `Línea ${line}, columna ${col}`;
  }

  // ==========================================================
  // AUTOGUARDADO
  // ==========================================================
  let autosaveTimer = null;
  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, codeInput.value);
        autosaveMsg.textContent = "Guardado automáticamente";
        setTimeout(() => { if (autosaveMsg.textContent === "Guardado automáticamente") autosaveMsg.textContent = ""; }, 1800);
      } catch (e) { /* almacenamiento no disponible, no pasa nada */ }
    }, 500);
  }

  function loadAutosaved() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved !== null ? saved : DEFAULT_CODE;
    } catch (e) {
      return DEFAULT_CODE;
    }
  }

  // ==========================================================
  // TEMA CLARO / OSCURO
  // ==========================================================
  function loadTheme() {
    let theme = "dark";
    try { theme = localStorage.getItem(THEME_KEY) || "dark"; } catch (e) {}
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  }
  btnTheme.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", "light");
    try { localStorage.setItem(THEME_KEY, isLight ? "dark" : "light"); } catch (e) {}
  });

  // ==========================================================
  // TOASTS
  // ==========================================================
  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " error" : "");
    el.textContent = message;
    toastStack.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  // ==========================================================
  // MODALES
  // ==========================================================
  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const backdrop = e.target.closest(".modal-backdrop");
      backdrop.classList.add("hidden");
    });
  });
  document.querySelectorAll(".modal-backdrop").forEach((bd) => {
    bd.addEventListener("click", (e) => { if (e.target === bd) bd.classList.add("hidden"); });
  });

  function confirmDialog(title, message) {
    return new Promise((resolve) => {
      $("#confirmTitle").textContent = title;
      $("#confirmMsg").textContent = message;
      openModal("#modalConfirm");
      const okBtn = $("#confirmOk");
      function cleanup(result) {
        okBtn.removeEventListener("click", onOk);
        closeModal("#modalConfirm");
        resolve(result);
      }
      function onOk() { cleanup(true); }
      okBtn.addEventListener("click", onOk);
      document.querySelectorAll("#modalConfirm [data-close]").forEach((b) => {
        b.addEventListener("click", () => cleanup(false), { once: true });
      });
    });
  }

  // ---------------- Ejemplos ----------------
  function renderExamples() {
    const list = $("#examplesList");
    list.innerHTML = "";
    (window.EXAMPLES || []).forEach((ex) => {
      const btn = document.createElement("button");
      btn.className = "example-item";
      btn.innerHTML = `<b>${escapeHtml(ex.title)}</b><span>${escapeHtml(ex.desc)}</span>`;
      btn.addEventListener("click", async () => {
        const ok = await confirmDialog("Cargar ejemplo", `¿Cargar "${ex.title}"? Se reemplazará el código actual.`);
        if (!ok) return;
        stopExecution();
        codeInput.value = ex.code;
        renderHighlight();
        autosave();
        closeModal("#modalExamples");
        toast("Ejemplo cargado: " + ex.title);
      });
      list.appendChild(btn);
    });
  }
  btnExamples.addEventListener("click", () => openModal("#modalExamples"));

  // ---------------- Ayuda ----------------
  function renderHelp() {
    $("#helpBody").innerHTML = `
      <h3>Estructura general</h3>
      <pre>Proceso NombreDelPrograma
    // instrucciones
FinProceso</pre>

      <h3>Variables</h3>
      <table>
        <tr><td><code>Definir x Como Entero</code></td><td>Declara una variable numérica entera</td></tr>
        <tr><td><code>Definir n Como Real</code></td><td>Declara un número con decimales</td></tr>
        <tr><td><code>Definir s Como Cadena</code></td><td>Declara texto</td></tr>
        <tr><td><code>Definir b Como Logico</code></td><td>Declara Verdadero/Falso</td></tr>
        <tr><td><code>Dimension v[10] Como Entero</code></td><td>Declara un arreglo (empieza en el índice 1)</td></tr>
        <tr><td><code>x &lt;- 5</code></td><td>Asignación</td></tr>
      </table>

      <h3>Entrada / salida</h3>
      <table>
        <tr><td><code>Escribir "texto", var</code></td><td>Muestra texto y valores, salto de línea al final</td></tr>
        <tr><td><code>Escribir Sin Saltar "texto"</code></td><td>Igual, sin saltar de línea</td></tr>
        <tr><td><code>Leer x</code></td><td>Pide un valor por teclado y lo guarda en x</td></tr>
      </table>

      <h3>Condicionales</h3>
      <pre>Si condicion Entonces
    // ...
SiNo
    // ...
FinSi</pre>
      <pre>Segun variable Hacer
    1: Escribir "uno"
    2,3: Escribir "dos o tres"
    De Otro Modo:
        Escribir "otro"
FinSegun</pre>

      <h3>Bucles</h3>
      <pre>Para i &lt;- 1 Hasta 10 Con Paso 1 Hacer
    // ...
FinPara</pre>
      <pre>Mientras condicion Hacer
    // ...
FinMientras</pre>
      <pre>Repetir
    // ...
Hasta Que condicion</pre>

      <h3>Funciones y subprocesos</h3>
      <pre>Funcion resultado = Nombre(a, b)
    resultado &lt;- a + b
FinFuncion</pre>
      <pre>SubProceso Nombre(ref x)
    x &lt;- x + 1
FinSubProceso</pre>

      <h3>Operadores</h3>
      <table>
        <tr><td><code>+ - * / ^</code></td><td>Aritméticos (suma, resta, mult., div., potencia)</td></tr>
        <tr><td><code>Mod</code>, <code>Div</code></td><td>Resto y división entera</td></tr>
        <tr><td><code>= &lt;&gt; &lt; &gt; &lt;= &gt;=</code></td><td>Comparación</td></tr>
        <tr><td><code>Y</code>, <code>O</code>, <code>No</code></td><td>Lógicos</td></tr>
      </table>
    `;
  }
  btnHelp.addEventListener("click", () => { renderHelp(); openModal("#modalHelp"); });

  // ---------------- Snippets ----------------
  const SNIPPETS = {
    si: "Si  Entonces\n    \nSiNo\n    \nFinSi",
    segun: "Segun  Hacer\n    1: \n    De Otro Modo:\n        \nFinSegun",
    mientras: "Mientras  Hacer\n    \nFinMientras",
    repetir: "Repetir\n    \nHasta Que ",
    para: "Para i <- 1 Hasta 10 Hacer\n    \nFinPara",
    funcion: "Funcion resultado = NombreFuncion()\n    \nFinFuncion",
    escribir: 'Escribir ""',
    leer: "Leer ",
    asignar: " <- ",
  };
  document.querySelectorAll(".snippet-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.snippet;
      insertAtCursor(SNIPPETS[key] || "");
    });
  });

  // ==========================================================
  // NUEVO / ABRIR / DESCARGAR
  // ==========================================================
  btnNew.addEventListener("click", async () => {
    const ok = await confirmDialog("Nuevo programa", "¿Crear un programa nuevo? Se perderán los cambios sin descargar.");
    if (!ok) return;
    stopExecution();
    codeInput.value = DEFAULT_CODE;
    renderHighlight();
    autosave();
    toast("Programa nuevo creado");
  });

  btnOpen.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      stopExecution();
      codeInput.value = String(reader.result);
      renderHighlight();
      autosave();
      toast("Archivo cargado: " + file.name);
    };
    reader.onerror = () => toast("No se pudo leer el archivo", "error");
    reader.readAsText(file);
    fileInput.value = "";
  });

  btnSave.addEventListener("click", () => {
    const blob = new Blob([codeInput.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    let name = "programa";
    const match = codeInput.value.match(/(?:Proceso|Algoritmo)\s+([A-Za-zÀ-ÿ0-9_]+)/i);
    if (match) name = match[1];
    a.href = url;
    a.download = name + ".psc";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Programa descargado como " + name + ".psc");
  });

  // ==========================================================
  // CONSOLA
  // ==========================================================
  function clearConsole() {
    consoleOutput.innerHTML = '<div class="console-empty">La salida de tu programa va a aparecer acá. Presioná «Ejecutar» para empezar.</div>';
  }
  btnClearConsole.addEventListener("click", clearConsole);

  function consoleEnsureClean() {
    const empty = consoleOutput.querySelector(".console-empty");
    if (empty) empty.remove();
  }

  function printOutput(text) {
    consoleEnsureClean();
    let last = consoleOutput.lastElementChild;
    if (!last || !last.classList.contains("out") || last.dataset.closed === "1") {
      last = document.createElement("span");
      last.className = "out";
      consoleOutput.appendChild(last);
    }
    last.textContent += text;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function printSystem(text) {
    consoleEnsureClean();
    const div = document.createElement("div");
    div.className = "sys";
    div.textContent = text;
    consoleOutput.appendChild(div);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function printError(err) {
    consoleEnsureClean();
    const div = document.createElement("div");
    div.className = "err";
    div.textContent = "⛔ " + err.message + (err.line ? ` (línea ${err.line})` : "");
    consoleOutput.appendChild(div);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function closeCurrentOutputSpan() {
    const last = consoleOutput.lastElementChild;
    if (last && last.classList.contains("out")) last.dataset.closed = "1";
  }

  function promptInput(varName) {
    return new Promise((resolve) => {
      consoleEnsureClean();
      const line = document.createElement("div");
      line.className = "console-line";
      const caret = document.createElement("span");
      caret.className = "prompt-caret";
      caret.textContent = "? " + varName + " =";
      const input = document.createElement("input");
      input.className = "console-input";
      input.type = "text";
      input.autocomplete = "off";
      input.autocapitalize = "off";
      line.appendChild(caret);
      line.appendChild(input);
      consoleOutput.appendChild(line);
      consoleOutput.scrollTop = consoleOutput.scrollHeight;
      input.focus();
      function submit() {
        const val = input.value;
        input.disabled = true;
        line.classList.add("done");
        closeCurrentOutputSpan();
        resolve(val);
      }
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    });
  }

  // ==========================================================
  // VARIABLES
  // ==========================================================
  function renderVars(scope) {
    if (!scope || scope.vars.size === 0) {
      varsBody.innerHTML = '<div class="vars-empty">Cuando ejecutes el programa vas a ver acá el valor de cada variable en tiempo real.</div>';
      return;
    }
    let html = '<table class="vars-table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>';
    for (const [key, box] of scope.vars.entries()) {
      const typeLabel = box.isArray ? box.type + "[]" : box.type;
      const valLabel = Engine.toDisplay(box.value);
      html += `<tr><td>${escapeHtml(key)}</td><td class="vtype">${escapeHtml(typeLabel)}</td><td>${escapeHtml(valLabel)}</td></tr>`;
    }
    html += "</tbody></table>";
    varsBody.innerHTML = html;
  }

  // ==========================================================
  // ESTADO / STATUS BAR
  // ==========================================================
  function setStatus(kind, text) {
    statusDot.className = "status-dot" + (kind ? " " + kind : "");
    statusText.textContent = text;
  }

  function setRunningUI(isRunning) {
    btnRun.disabled = isRunning && !stepMode;
    btnStep.disabled = isRunning && !stepMode;
    btnStop.disabled = !isRunning;
  }

  // ==========================================================
  // EJECUCIÓN
  // ==========================================================
  function resetExecUI() {
    currentLine = null;
    errorLine = null;
    renderHighlight();
  }

  function stopExecution(silent) {
    currentGen = null;
    currentInterp = null;
    runState = "idle";
    resetExecUI();
    setRunningUI(false);
    setStatus("", "Detenido");
    if (!silent) closeCurrentOutputSpan();
  }

  function compileCurrent() {
    const src = codeInput.value;
    const tokens = Engine.tokenize(src);
    const ast = Engine.parse(tokens);
    return ast;
  }

  async function runProgram(useStepMode) {
    if (runState === "running" || runState === "waitingInput") return;
    stepMode = useStepMode;
    clearConsole();
    consoleEnsureClean();
    errorLine = null;
    let ast;
    try {
      ast = compileCurrent();
    } catch (e) {
      printError(e);
      errorLine = e.line || null;
      renderHighlight();
      setStatus("error", "Error de sintaxis");
      toast("Error de sintaxis: " + e.message, "error");
      return;
    }
    currentInterp = new Engine.Interpreter(ast);
    currentGen = currentInterp.run();
    runState = "running";
    setRunningUI(true);
    setStatus("running", stepMode ? "Paso a paso…" : "Ejecutando…");
    await pump(true);
  }

  async function pump(auto) {
    while (true) {
      let result;
      try {
        result = currentGen.next(resumeValue);
        resumeValue = undefined;
      } catch (e) {
        printError(e);
        errorLine = e.line || currentLine || null;
        renderHighlight();
        setStatus("error", "Error en ejecución");
        toast("Error: " + e.message, "error");
        setRunningUI(false);
        runState = "error";
        return;
      }
      if (result.done) {
        closeCurrentOutputSpan();
        currentLine = null;
        renderVars(currentInterp.globalScope);
        renderHighlight();
        setRunningUI(false);
        setStatus("", "Programa finalizado");
        printSystem("— Fin del programa —");
        runState = "finished";
        return;
      }
      const ev = result.value;
      if (ev.kind === "line") {
        currentLine = ev.line;
        renderHighlight();
        renderVars(currentInterp.globalScope);
        if (stepMode && auto) {
          setStatus("running", `Línea ${ev.line} — presioná «Paso a paso» para continuar`);
          runState = "paused";
          return;
        }
        continue;
      }
      if (ev.kind === "output") {
        printOutput(ev.text + (ev.newline ? "\n" : ""));
        continue;
      }
      if (ev.kind === "input") {
        closeCurrentOutputSpan();
        runState = "waitingInput";
        setStatus("waiting", `Esperando el valor de "${ev.name}"…`);
        const val = await promptInput(ev.name);
        resumeValue = val;
        runState = "running";
        setStatus("running", stepMode ? "Paso a paso…" : "Ejecutando…");
        continue;
      }
    }
  }

  btnRun.addEventListener("click", () => runProgram(false));
  btnStep.addEventListener("click", () => {
    if (runState === "idle" || runState === "finished" || runState === "error") {
      runProgram(true);
    } else if (runState === "paused") {
      runState = "running";
      pump(true);
    }
  });
  btnStop.addEventListener("click", () => {
    stopExecution();
    printSystem("— Ejecución detenida por el usuario —");
  });

  // ==========================================================
  // PESTAÑAS MÓVILES
  // ==========================================================
  document.querySelectorAll(".mobile-tabs button").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".mobile-tabs button").forEach((b) => b.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.pane;
      document.querySelectorAll(".pane").forEach((p) => p.classList.remove("active"));
      const map = { editor: "#paneEditor", console: "#paneConsole", vars: "#paneVars" };
      $(map[target]).classList.add("active");
    });
  });

  // ==========================================================
  // PANEL DE VARIABLES COLAPSABLE (escritorio)
  // ==========================================================
  btnCollapseVars.addEventListener("click", () => {
    paneVars.classList.toggle("collapsed");
    btnCollapseVars.textContent = paneVars.classList.contains("collapsed") ? "«" : "»";
  });

  // ==========================================================
  // INICIALIZACIÓN
  // ==========================================================
  function init() {
    loadTheme();
    codeInput.value = loadAutosaved();
    renderHighlight();
    updateCursorPos();
    renderExamples();
    setStatus("", "Detenido");

    // Registrar el service worker si el navegador lo soporta (uso offline básico)
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      // No se registra ningún archivo sw.js todavía: se deja preparado
      // para no romper si en el futuro se agrega uno.
    }
  }

  init();
})();
