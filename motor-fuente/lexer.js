// ============================================================
// LEXER — convierte el código fuente en una lista de tokens
// ============================================================

const KEYWORDS = new Set([
  "PROCESO", "ALGORITMO", "FINPROCESO", "FINALGORITMO",
  "DEFINIR", "DIMENSION", "COMO",
  "ENTERO", "REAL", "CADENA", "CARACTER", "LOGICO", "NUMERICO", "BOOLEANO",
  "ESCRIBIR", "LEER", "SIN", "SALTAR",
  "SI", "ENTONCES", "SINO", "FINSI",
  "SEGUN", "HACER", "DE", "OTRO", "MODO", "FINSEGUN",
  "MIENTRAS", "FINMIENTRAS",
  "REPETIR", "HASTA", "QUE",
  "PARA", "DESDE", "CON", "PASO", "FINPARA",
  "FUNCION", "FINFUNCION",
  "SUBPROCESO", "SUBALGORITMO", "FINSUBPROCESO", "FINSUBALGORITMO",
  "Y", "O", "NO", "MOD", "DIV",
  "VERDADERO", "FALSO", "REF",
]);

class PseudoError extends Error {
  constructor(message, line) {
    super(message);
    this.name = "PseudoError";
    this.line = line;
  }
}

function isDigit(ch) { return ch >= "0" && ch <= "9"; }
function isIdentStart(ch) { return /[A-Za-zÀ-ÿ_ñÑ]/.test(ch); }
function isIdentPart(ch) { return /[A-Za-zÀ-ÿ0-9_ñÑ]/.test(ch); }

function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  function peekCh(o = 0) { return source[i + o]; }

  while (i < n) {
    const ch = source[i];

    // Fin de línea
    if (ch === "\n") { line++; i++; continue; }
    // Espacios
    if (ch === " " || ch === "\t" || ch === "\r") { i++; continue; }

    // Comentarios de línea //
    if (ch === "/" && peekCh(1) === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    // Comentarios de bloque { ... } o /* ... */
    if (ch === "{") {
      const startLine = line;
      i++;
      while (i < n && source[i] !== "}") { if (source[i] === "\n") line++; i++; }
      if (i >= n) throw new PseudoError("Comentario de bloque sin cerrar (falta '}')", startLine);
      i++; // saltar '}'
      continue;
    }
    if (ch === "/" && peekCh(1) === "*") {
      const startLine = line;
      i += 2;
      while (i < n && !(source[i] === "*" && peekCh(1) === "/")) { if (source[i] === "\n") line++; i++; }
      if (i >= n) throw new PseudoError("Comentario de bloque sin cerrar (falta '*/')", startLine);
      i += 2;
      continue;
    }

    // Cadenas de texto "..." o '...'
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const startLine = line;
      let value = "";
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\n") throw new PseudoError("Cadena de texto sin cerrar", startLine);
        if (source[i] === "\\" && (peekCh(1) === quote || peekCh(1) === "\\")) {
          value += peekCh(1);
          i += 2;
          continue;
        }
        value += source[i];
        i++;
      }
      if (i >= n) throw new PseudoError("Cadena de texto sin cerrar (falta comilla de cierre)", startLine);
      i++; // saltar comilla de cierre
      tokens.push({ type: "STRING", value, line: startLine });
      continue;
    }

    // Números
    if (isDigit(ch) || (ch === "." && isDigit(peekCh(1)))) {
      const startLine = line;
      let value = "";
      while (i < n && isDigit(source[i])) { value += source[i]; i++; }
      if (source[i] === "." && isDigit(peekCh(1))) {
        value += source[i]; i++;
        while (i < n && isDigit(source[i])) { value += source[i]; i++; }
      }
      tokens.push({ type: "NUMBER", value: parseFloat(value), line: startLine });
      continue;
    }

    // Identificadores / palabras clave
    if (isIdentStart(ch)) {
      const startLine = line;
      let value = "";
      while (i < n && isIdentPart(source[i])) { value += source[i]; i++; }
      const upper = value.toUpperCase();
      if (KEYWORDS.has(upper)) {
        tokens.push({ type: upper, value, line: startLine });
      } else {
        tokens.push({ type: "IDENT", value, line: startLine });
      }
      continue;
    }

    // Operadores y símbolos
    const startLine = line;
    if (ch === "<" && peekCh(1) === "-") { tokens.push({ type: "ASSIGN", value: "<-", line: startLine }); i += 2; continue; }
    if (ch === "<" && peekCh(1) === "=") { tokens.push({ type: "LE", value: "<=", line: startLine }); i += 2; continue; }
    if (ch === ">" && peekCh(1) === "=") { tokens.push({ type: "GE", value: ">=", line: startLine }); i += 2; continue; }
    if (ch === "<" && peekCh(1) === ">") { tokens.push({ type: "NE", value: "<>", line: startLine }); i += 2; continue; }
    if (ch === "!" && peekCh(1) === "=") { tokens.push({ type: "NE", value: "<>", line: startLine }); i += 2; continue; }
    if (ch === "←") { tokens.push({ type: "ASSIGN", value: "<-", line: startLine }); i++; continue; }

    const singleMap = {
      "<": "LT", ">": "GT", "=": "EQ", "+": "PLUS", "-": "MINUS",
      "*": "TIMES", "/": "DIVIDE", "^": "POWER", "%": "PERCENT",
      "(": "LPAREN", ")": "RPAREN", "[": "LBRACKET", "]": "RBRACKET",
      ",": "COMMA", ":": "COLON", ";": "SEMI",
    };
    if (singleMap[ch]) {
      tokens.push({ type: singleMap[ch], value: ch, line: startLine });
      i++;
      continue;
    }

    throw new PseudoError(`Carácter inesperado: '${ch}'`, startLine);
  }

  tokens.push({ type: "EOF", value: null, line: line });
  return tokens;
}

module.exports = { tokenize, PseudoError, KEYWORDS };
