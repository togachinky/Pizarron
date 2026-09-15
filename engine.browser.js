// ============================================================
// MOTOR DE PSEUDOCÓDIGO — generado a partir de lexer.js + parser.js
// + interpreter.js. No editar a mano aquí: editar los fuentes en
// /engine y volver a generar con el script de build.
// ============================================================
window.Engine = (function () {
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


// ============================================================
// PARSER — convierte los tokens en un árbol de sintaxis (AST)
// ============================================================

const TYPE_TOKENS = new Set(["ENTERO", "REAL", "CADENA", "CARACTER", "LOGICO", "NUMERICO", "BOOLEANO"]);

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(o = 0) { return this.tokens[this.pos + o]; }
  cur() { return this.tokens[this.pos]; }
  at(type) { return this.cur().type === type; }
  atAny(...types) { return types.includes(this.cur().type); }

  advance() { const t = this.tokens[this.pos]; if (this.pos < this.tokens.length - 1) this.pos++; return t; }

  expect(type, msg) {
    if (!this.at(type)) {
      const t = this.cur();
      throw new PseudoError(msg || `Se esperaba '${type}' y se encontró '${t.value ?? t.type}'`, t.line);
    }
    return this.advance();
  }

  // Comprueba una secuencia de tipos de token consecutivos (para palabras compuestas)
  matchSeq(...types) {
    for (let k = 0; k < types.length; k++) {
      if (this.peek(k).type !== types[k]) return false;
    }
    for (let k = 0; k < types.length; k++) this.advance();
    return true;
  }
  checkSeq(...types) {
    for (let k = 0; k < types.length; k++) {
      if (this.peek(k).type !== types[k]) return false;
    }
    return true;
  }

  // ---------------- Programa completo ----------------
  parseProgram() {
    const program = { type: "Program", main: null, functions: {}, subprocesses: {} };
    while (!this.at("EOF")) {
      if (this.atAny("PROCESO", "ALGORITMO")) {
        if (program.main) throw new PseudoError("Ya existe un bloque Proceso/Algoritmo principal", this.cur().line);
        program.main = this.parseMain();
      } else if (this.at("FUNCION")) {
        const fn = this.parseFunction();
        program.functions[fn.name.toUpperCase()] = fn;
      } else if (this.atAny("SUBPROCESO", "SUBALGORITMO")) {
        const sp = this.parseSubprocess();
        program.subprocesses[sp.name.toUpperCase()] = sp;
      } else {
        const t = this.cur();
        throw new PseudoError(`Se esperaba 'Proceso', 'Funcion' o 'SubProceso' y se encontró '${t.value ?? t.type}'`, t.line);
      }
    }
    if (!program.main) throw new PseudoError("Falta el bloque principal (Proceso ... FinProceso)", 1);
    return program;
  }

  parseMain() {
    const startTok = this.advance(); // PROCESO | ALGORITMO
    let name = "SinTitulo";
    if (this.at("IDENT")) name = this.advance().value;
    const body = this.parseStatements(["FINPROCESO", "FINALGORITMO"]);
    this.expect(this.at("FINPROCESO") ? "FINPROCESO" : "FINALGORITMO", "Falta 'FinProceso' / 'FinAlgoritmo'");
    return { type: "Main", name, body, line: startTok.line };
  }

  parseFunction() {
    const startTok = this.advance(); // FUNCION
    let retVar = null;
    let name;
    // Funcion resultado = Nombre(params)  OR  Funcion Nombre(params)
    const savedPos = this.pos;
    if (this.at("IDENT") && this.peek(1).type === "EQ") {
      retVar = this.advance().value;
      this.expect("EQ");
      name = this.expect("IDENT", "Se esperaba el nombre de la función").value;
    } else {
      name = this.expect("IDENT", "Se esperaba el nombre de la función").value;
    }
    const params = this.parseParamList();
    const body = this.parseStatements(["FINFUNCION"]);
    this.expect("FINFUNCION", "Falta 'FinFuncion'");
    return { type: "Function", name, retVar, params, body, line: startTok.line };
  }

  parseSubprocess() {
    const startTok = this.advance(); // SUBPROCESO | SUBALGORITMO
    const name = this.expect("IDENT", "Se esperaba el nombre del subproceso").value;
    const params = this.parseParamList();
    const body = this.parseStatements(["FINSUBPROCESO", "FINSUBALGORITMO"]);
    this.expect(this.at("FINSUBPROCESO") ? "FINSUBPROCESO" : "FINSUBALGORITMO", "Falta 'FinSubProceso'");
    return { type: "Subprocess", name, params, body, line: startTok.line };
  }

  parseParamList() {
    this.expect("LPAREN", "Se esperaba '(' luego del nombre");
    const params = [];
    if (!this.at("RPAREN")) {
      do {
        let byRef = false;
        if (this.at("REF")) { byRef = true; this.advance(); }
        const pname = this.expect("IDENT", "Se esperaba el nombre de un parámetro").value;
        params.push({ name: pname, byRef });
      } while (this.at("COMMA") && this.advance());
    }
    this.expect("RPAREN", "Falta ')' al declarar los parámetros");
    return params;
  }

  // ---------------- Bloques de instrucciones ----------------
  parseStatements(endTypes) {
    const stmts = [];
    while (!this.atAny("EOF", ...endTypes)) {
      // Fin especial para SEGUN/otro-modo: se controla afuera
      stmts.push(this.parseStatement());
    }
    return stmts;
  }

  parseStatement() {
    const t = this.cur();
    switch (t.type) {
      case "DEFINIR": return this.parseDefinir();
      case "DIMENSION": return this.parseDimension();
      case "ESCRIBIR": return this.parseEscribir();
      case "LEER": return this.parseLeer();
      case "SI": return this.parseSi();
      case "SEGUN": return this.parseSegun();
      case "MIENTRAS": return this.parseMientras();
      case "REPETIR": return this.parseRepetir();
      case "PARA": return this.parsePara();
      case "IDENT": return this.parseAssignOrCall();
      default:
        throw new PseudoError(`No se reconoce la instrucción '${t.value ?? t.type}'`, t.line);
    }
  }

  parseDefinir() {
    const startTok = this.advance(); // DEFINIR
    const names = [];
    do {
      names.push(this.expect("IDENT", "Se esperaba un nombre de variable").value);
    } while (this.at("COMMA") && this.advance());
    this.expect("COMO", "Falta 'Como' (ej: Definir x Como Entero)");
    const typeTok = this.cur();
    if (!TYPE_TOKENS.has(typeTok.type)) throw new PseudoError(`Tipo de dato inválido: '${typeTok.value}'`, typeTok.line);
    this.advance();
    return { type: "Definir", names, varType: normalizeType(typeTok.type), line: startTok.line };
  }

  parseDimension() {
    const startTok = this.advance(); // DIMENSION
    const decls = [];
    do {
      const name = this.expect("IDENT", "Se esperaba un nombre de variable").value;
      this.expect("LBRACKET", "Se esperaba '[' (ej: Dimension v[10])");
      const dims = [this.parseExpr()];
      while (this.at("COMMA") && this.advance()) dims.push(this.parseExpr());
      this.expect("RBRACKET", "Falta ']'");
      decls.push({ name, dims });
    } while (this.at("COMMA") && this.advance());
    let varType = "Entero";
    if (this.at("COMO")) {
      this.advance();
      const typeTok = this.cur();
      if (!TYPE_TOKENS.has(typeTok.type)) throw new PseudoError(`Tipo de dato inválido: '${typeTok.value}'`, typeTok.line);
      this.advance();
      varType = normalizeType(typeTok.type);
    }
    return { type: "Dimension", decls, varType, line: startTok.line };
  }

  parseEscribir() {
    const startTok = this.advance(); // ESCRIBIR
    let sinSaltar = false;
    if (this.at("SIN")) {
      this.advance();
      this.expect("SALTAR", "Se esperaba 'Saltar' luego de 'Sin'");
      sinSaltar = true;
    }
    const exprs = [];
    if (!this.atAny("EOF", "FINSI", "SINO", "FINPROCESO", "FINALGORITMO", "FINMIENTRAS", "FINPARA", "FINFUNCION", "FINSUBPROCESO", "FINSUBALGORITMO", "HASTA", "FINSEGUN")) {
      exprs.push(this.parseExpr());
      while (this.at("COMMA") && this.advance()) exprs.push(this.parseExpr());
    }
    return { type: "Escribir", exprs, sinSaltar, line: startTok.line };
  }

  parseLeer() {
    const startTok = this.advance(); // LEER
    const targets = [this.parseLValue()];
    while (this.at("COMMA") && this.advance()) targets.push(this.parseLValue());
    return { type: "Leer", targets, line: startTok.line };
  }

  parseLValue() {
    const nameTok = this.expect("IDENT", "Se esperaba un nombre de variable");
    const indices = [];
    while (this.at("LBRACKET")) {
      this.advance();
      indices.push(this.parseExpr());
      this.expect("RBRACKET", "Falta ']'");
    }
    return { name: nameTok.value, indices, line: nameTok.line };
  }

  parseSi() {
    const startTok = this.advance(); // SI
    const cond = this.parseExpr();
    this.expect("ENTONCES", "Falta 'Entonces' luego de la condición del Si");
    const thenBody = this.parseStatements(["SINO", "FINSI"]);
    let elseBody = [];
    if (this.at("SINO")) {
      this.advance();
      elseBody = this.parseStatements(["FINSI"]);
    }
    this.expect("FINSI", "Falta 'FinSi'");
    return { type: "Si", cond, thenBody, elseBody, line: startTok.line };
  }

  parseSegun() {
    const startTok = this.advance(); // SEGUN
    const expr = this.parseExpr();
    this.expect("HACER", "Falta 'Hacer' luego de 'Segun <expresion>'");
    const cases = [];
    let defaultBody = null;
    while (!this.atAny("FINSEGUN", "EOF")) {
      if (this.checkSeq("DE", "OTRO", "MODO")) {
        this.matchSeq("DE", "OTRO", "MODO");
        if (this.at("COLON")) this.advance();
        defaultBody = this.parseCaseBody();
        break;
      }
      const values = [this.parseExpr()];
      while (this.at("COMMA") && this.advance()) values.push(this.parseExpr());
      this.expect("COLON", "Falta ':' luego del valor del caso");
      const body = this.parseCaseBody();
      cases.push({ values, body });
      // Si lo que sigue no es DE-OTRO-MODO ni FINSEGUN, seguimos con otro caso (ya lo maneja el while)
    }
    this.expect("FINSEGUN", "Falta 'FinSegun'");
    return { type: "Segun", expr, cases, defaultBody, line: startTok.line };
  }

  // Cuerpo de un caso de "Segun": se detiene al llegar a FinSegun, a "De Otro Modo"
  // o a lo que parezca la etiqueta de otro caso (un literal seguido eventualmente de ':').
  parseCaseBody() {
    const stmts = [];
    while (!this.atAny("FINSEGUN", "EOF")) {
      if (this.checkSeq("DE", "OTRO", "MODO")) break;
      if (this.looksLikeCaseLabel()) break;
      stmts.push(this.parseStatement());
    }
    return stmts;
  }

  looksLikeCaseLabel() {
    const t = this.cur();
    if (t.type === "NUMBER" || t.type === "STRING" || t.type === "VERDADERO" || t.type === "FALSO") return true;
    if (t.type === "MINUS" && this.peek(1).type === "NUMBER") return true;
    if (t.type === "IDENT" && this.peek(1).type === "COLON") return true;
    return false;
  }

  parseMientras() {
    const startTok = this.advance(); // MIENTRAS
    const cond = this.parseExpr();
    this.expect("HACER", "Falta 'Hacer' luego de la condición del Mientras");
    const body = this.parseStatements(["FINMIENTRAS"]);
    this.expect("FINMIENTRAS", "Falta 'FinMientras'");
    return { type: "Mientras", cond, body, line: startTok.line };
  }

  parseRepetir() {
    const startTok = this.advance(); // REPETIR
    const body = this.parseStatements(["HASTA"]);
    this.expect("HASTA", "Falta 'Hasta Que <condicion>'");
    this.expect("QUE", "Falta 'Que' luego de 'Hasta'");
    const cond = this.parseExpr();
    return { type: "Repetir", body, cond, line: startTok.line };
  }

  parsePara() {
    const startTok = this.advance(); // PARA
    const varName = this.expect("IDENT", "Se esperaba el nombre de la variable contadora").value;
    if (this.at("ASSIGN")) this.advance();
    else this.expect("EQ", "Se esperaba '<-' o '=' (ej: Para i <- 1 Hasta 10)");
    const from = this.parseExpr();
    this.expect("HASTA", "Falta 'Hasta' (ej: Para i <- 1 Hasta 10)");
    const to = this.parseExpr();
    let step = null;
    if (this.at("CON")) {
      this.advance();
      this.expect("PASO", "Se esperaba 'Paso' luego de 'Con'");
      step = this.parseExpr();
    }
    this.expect("HACER", "Falta 'Hacer' luego del rango del Para");
    const body = this.parseStatements(["FINPARA"]);
    this.expect("FINPARA", "Falta 'FinPara'");
    return { type: "Para", varName, from, to, step, body, line: startTok.line };
  }

  parseAssignOrCall() {
    const nameTok = this.advance(); // IDENT
    const indices = [];
    while (this.at("LBRACKET")) {
      this.advance();
      indices.push(this.parseExpr());
      this.expect("RBRACKET", "Falta ']'");
    }
    if (this.at("ASSIGN") || this.at("EQ")) {
      this.advance();
      const expr = this.parseExpr();
      return { type: "Assign", name: nameTok.value, indices, expr, line: nameTok.line };
    }
    if (this.at("LPAREN")) {
      const args = this.parseArgList();
      return { type: "CallStatement", name: nameTok.value, args, line: nameTok.line };
    }
    throw new PseudoError(`Se esperaba '<-' (asignación) o '(' (llamada) luego de '${nameTok.value}'`, nameTok.line);
  }

  parseArgList() {
    this.expect("LPAREN");
    const args = [];
    if (!this.at("RPAREN")) {
      args.push(this.parseExpr());
      while (this.at("COMMA") && this.advance()) args.push(this.parseExpr());
    }
    this.expect("RPAREN", "Falta ')' al cerrar los argumentos");
    return args;
  }

  // ---------------- Expresiones ----------------
  parseExpr() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.at("O")) {
      const line = this.advance().line;
      const right = this.parseAnd();
      left = { type: "Logical", op: "O", left, right, line };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.at("Y")) {
      const line = this.advance().line;
      const right = this.parseNot();
      left = { type: "Logical", op: "Y", left, right, line };
    }
    return left;
  }

  parseNot() {
    if (this.at("NO")) {
      const line = this.advance().line;
      const operand = this.parseNot();
      return { type: "Not", operand, line };
    }
    return this.parseRel();
  }

  parseRel() {
    let left = this.parseAdd();
    while (this.atAny("EQ", "NE", "LT", "GT", "LE", "GE")) {
      const opTok = this.advance();
      const right = this.parseAdd();
      left = { type: "Compare", op: opTok.type, left, right, line: opTok.line };
    }
    return left;
  }

  parseAdd() {
    let left = this.parseMul();
    while (this.atAny("PLUS", "MINUS")) {
      const opTok = this.advance();
      const right = this.parseMul();
      left = { type: "Binary", op: opTok.type, left, right, line: opTok.line };
    }
    return left;
  }

  parseMul() {
    let left = this.parsePow();
    while (this.atAny("TIMES", "DIVIDE", "MOD", "DIV", "PERCENT")) {
      const opTok = this.advance();
      const right = this.parsePow();
      left = { type: "Binary", op: opTok.type, left, right, line: opTok.line };
    }
    return left;
  }

  parsePow() {
    const left = this.parseUnary();
    if (this.at("POWER")) {
      const line = this.advance().line;
      const right = this.parsePow(); // asociativo a la derecha
      return { type: "Binary", op: "POWER", left, right, line };
    }
    return left;
  }

  parseUnary() {
    if (this.atAny("MINUS", "PLUS")) {
      const opTok = this.advance();
      const operand = this.parseUnary();
      return { type: "Unary", op: opTok.type, operand, line: opTok.line };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.cur();
    if (t.type === "NUMBER") { this.advance(); return { type: "Number", value: t.value, line: t.line }; }
    if (t.type === "STRING") { this.advance(); return { type: "String", value: t.value, line: t.line }; }
    if (t.type === "VERDADERO") { this.advance(); return { type: "Bool", value: true, line: t.line }; }
    if (t.type === "FALSO") { this.advance(); return { type: "Bool", value: false, line: t.line }; }
    if (t.type === "LPAREN") {
      this.advance();
      const e = this.parseExpr();
      this.expect("RPAREN", "Falta ')'");
      return e;
    }
    if (t.type === "IDENT") {
      this.advance();
      if (this.at("LPAREN")) {
        const args = this.parseArgList();
        return { type: "Call", name: t.value, args, line: t.line };
      }
      const indices = [];
      while (this.at("LBRACKET")) {
        this.advance();
        indices.push(this.parseExpr());
        this.expect("RBRACKET", "Falta ']'");
      }
      return { type: "Var", name: t.value, indices, line: t.line };
    }
    throw new PseudoError(`Se esperaba una expresión y se encontró '${t.value ?? t.type}'`, t.line);
  }
}

function normalizeType(tt) {
  if (tt === "NUMERICO") return "Real";
  if (tt === "BOOLEANO") return "Logico";
  const map = { ENTERO: "Entero", REAL: "Real", CADENA: "Cadena", CARACTER: "Caracter", LOGICO: "Logico" };
  return map[tt] || tt;
}

function parse(tokens) {
  const p = new Parser(tokens);
  return p.parseProgram();
}


// ============================================================
// INTÉRPRETE — recorre el AST y ejecuta el programa.
// Implementado con generadores para poder "pausar" la ejecución
// cada vez que se necesita leer un dato del usuario, y para
// poder ejecutar paso a paso.
// ============================================================

const MAX_STEPS = 3_000_000; // protección contra bucles infinitos
const MAX_CALL_DEPTH = 500; // protección contra recursión infinita

function defaultValue(type) {
  switch (type) {
    case "Entero": case "Real": return 0;
    case "Cadena": case "Caracter": return "";
    case "Logico": return false;
    default: return 0;
  }
}

function toDisplay(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Verdadero" : "Falso";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    let s = value.toFixed(10);
    s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }
  if (Array.isArray(value)) return "[" + value.slice(1).map(toDisplay).join(", ") + "]";
  return String(value);
}

function toNumber(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

function truthy(value) {
  return value === true || value === 1 || value === "verdadero";
}

class Scope {
  constructor() { this.vars = new Map(); }
  key(name) { return name.toUpperCase(); }
  declare(name, box) { this.vars.set(this.key(name), box); }
  has(name) { return this.vars.has(this.key(name)); }
  get(name) { return this.vars.get(this.key(name)); }
}

// "box" de variable: { type, isArray, value, dims }
function makeScalarBox(type, value) {
  return { type, isArray: false, value: value !== undefined ? value : defaultValue(type) };
}
function makeArrayBox(type, dims) {
  // dims: lista de tamaños. Usamos indexación desde 1 (índice 0 se ignora).
  function build(depth) {
    const size = dims[depth];
    const arr = new Array(size + 1).fill(depth === dims.length - 1 ? defaultValue(type) : null);
    if (depth < dims.length - 1) {
      for (let k = 1; k <= size; k++) arr[k] = build(depth + 1);
    }
    return arr;
  }
  return { type, isArray: true, dims, value: build(0) };
}

class Interpreter {
  constructor(program) {
    this.program = program;
    this.globalScope = new Scope();
    this.steps = 0;
    this.callDepth = 0;
  }

  // ---------- Punto de entrada ----------
  * run() {
    const main = this.program.main;
    yield* this.execBlock(main.body, this.globalScope);
  }

  * execBlock(stmts, scope) {
    for (const stmt of stmts) {
      this.steps++;
      if (this.steps > MAX_STEPS) {
        throw new PseudoError("Se interrumpió la ejecución: parece haber un bucle infinito (se superó el número máximo de pasos).", stmt.line);
      }
      yield { kind: "line", line: stmt.line };
      yield* this.execStatement(stmt, scope);
    }
  }

  * execStatement(stmt, scope) {
    switch (stmt.type) {
      case "Definir": {
        for (const name of stmt.names) {
          scope.declare(name, makeScalarBox(stmt.varType));
        }
        return;
      }
      case "Dimension": {
        for (const decl of stmt.decls) {
          const dims = [];
          for (const dExpr of decl.dims) {
            const v = Math.trunc(toNumber(yield* this.evalExpr(dExpr, scope)));
            if (v <= 0) throw new PseudoError(`El tamaño del arreglo '${decl.name}' debe ser un entero positivo`, stmt.line);
            dims.push(v);
          }
          scope.declare(decl.name, makeArrayBox(stmt.varType, dims));
        }
        return;
      }
      case "Assign": {
        const value = yield* this.evalExpr(stmt.expr, scope);
        yield* this.assignTo(stmt.name, stmt.indices, value, scope, stmt.line);
        return;
      }
      case "Escribir": {
        let text = "";
        for (const e of stmt.exprs) {
          const v = yield* this.evalExpr(e, scope);
          text += toDisplay(v);
        }
        yield { kind: "output", text, newline: !stmt.sinSaltar };
        return;
      }
      case "Leer": {
        for (const target of stmt.targets) {
          if (!scope.has(target.name)) {
            throw new PseudoError(`La variable '${target.name}' no fue definida (usá Definir antes de Leer)`, target.line);
          }
          const box = scope.get(target.name);
          const raw = yield { kind: "input", name: target.name };
          const converted = this.convertInput(raw, box.type, target.name, target.line);
          yield* this.assignTo(target.name, target.indices, converted, scope, target.line);
        }
        return;
      }
      case "Si": {
        const cond = yield* this.evalExpr(stmt.cond, scope);
        if (truthy(cond)) yield* this.execBlock(stmt.thenBody, scope);
        else yield* this.execBlock(stmt.elseBody, scope);
        return;
      }
      case "Segun": {
        const val = yield* this.evalExpr(stmt.expr, scope);
        let matched = null;
        for (const c of stmt.cases) {
          for (const vExpr of c.values) {
            const cv = yield* this.evalExpr(vExpr, scope);
            if (this.looseEqual(val, cv)) { matched = c.body; break; }
          }
          if (matched) break;
        }
        if (matched) yield* this.execBlock(matched, scope);
        else if (stmt.defaultBody) yield* this.execBlock(stmt.defaultBody, scope);
        return;
      }
      case "Mientras": {
        let guard = 0;
        while (truthy(yield* this.evalExpr(stmt.cond, scope))) {
          yield* this.execBlock(stmt.body, scope);
          guard++;
          if (guard > MAX_STEPS) throw new PseudoError("Bucle 'Mientras' interrumpido: demasiadas iteraciones.", stmt.line);
        }
        return;
      }
      case "Repetir": {
        let guard = 0;
        do {
          yield* this.execBlock(stmt.body, scope);
          guard++;
          if (guard > MAX_STEPS) throw new PseudoError("Bucle 'Repetir' interrumpido: demasiadas iteraciones.", stmt.line);
        } while (!truthy(yield* this.evalExpr(stmt.cond, scope)));
        return;
      }
      case "Para": {
        const start = toNumber(yield* this.evalExpr(stmt.from, scope));
        const end = toNumber(yield* this.evalExpr(stmt.to, scope));
        const step = stmt.step ? toNumber(yield* this.evalExpr(stmt.step, scope)) : 1;
        if (step === 0) throw new PseudoError("El paso de un 'Para' no puede ser 0", stmt.line);
        if (!scope.has(stmt.varName)) scope.declare(stmt.varName, makeScalarBox("Entero", start));
        let i = start;
        let guard = 0;
        while (step > 0 ? i <= end : i >= end) {
          scope.get(stmt.varName).value = i;
          yield* this.execBlock(stmt.body, scope);
          i = scope.get(stmt.varName).value + step;
          guard++;
          if (guard > MAX_STEPS) throw new PseudoError("Bucle 'Para' interrumpido: demasiadas iteraciones.", stmt.line);
        }
        scope.get(stmt.varName).value = i;
        return;
      }
      case "CallStatement": {
        yield* this.callSubprocess(stmt.name, stmt.args, scope, stmt.line);
        return;
      }
      default:
        throw new PseudoError(`Instrucción no soportada: ${stmt.type}`, stmt.line);
    }
  }

  looseEqual(a, b) {
    if (typeof a === "number" || typeof b === "number") return toNumber(a) === toNumber(b);
    return a === b;
  }

  convertInput(raw, type, name, line) {
    if (typeof raw !== "string") return raw;
    const trimmed = raw.trim();
    switch (type) {
      case "Entero": {
        const v = parseInt(trimmed, 10);
        if (Number.isNaN(v)) throw new PseudoError(`Se esperaba un valor Entero para '${name}' y se ingresó '${raw}'`, line);
        return v;
      }
      case "Real": {
        const v = parseFloat(trimmed.replace(",", "."));
        if (Number.isNaN(v)) throw new PseudoError(`Se esperaba un valor Real para '${name}' y se ingresó '${raw}'`, line);
        return v;
      }
      case "Logico": {
        const low = trimmed.toLowerCase();
        if (low === "verdadero" || low === "true" || low === "v") return true;
        if (low === "falso" || low === "false" || low === "f") return false;
        throw new PseudoError(`Se esperaba Verdadero/Falso para '${name}' y se ingresó '${raw}'`, line);
      }
      default:
        return raw;
    }
  }

  * getArrayCell(name, indices, scope, line) {
    if (!scope.has(name)) throw new PseudoError(`La variable '${name}' no fue definida`, line);
    const box = scope.get(name);
    if (!box.isArray) {
      if (indices.length > 0) throw new PseudoError(`'${name}' no es un arreglo`, line);
      return null;
    }
    let container = box.value;
    const idxs = [];
    for (const idxExpr of indices) idxs.push(Math.trunc(toNumber(yield* this.evalExpr(idxExpr, scope))));
    for (let d = 0; d < idxs.length - 1; d++) {
      const idx = idxs[d];
      if (idx < 1 || idx >= container.length) throw new PseudoError(`Índice fuera de rango en '${name}'`, line);
      container = container[idx];
    }
    const lastIdx = idxs[idxs.length - 1];
    if (lastIdx < 1 || lastIdx >= container.length) throw new PseudoError(`Índice fuera de rango en '${name}'`, line);
    return { container, idx: lastIdx };
  }

  * assignTo(name, indices, value, scope, line) {
    if (!scope.has(name)) {
      if (indices.length > 0) throw new PseudoError(`El arreglo '${name}' no fue definido (usá Dimension antes)`, line);
      scope.declare(name, makeScalarBox(inferType(value), value));
      return;
    }
    const box = scope.get(name);
    if (box.isArray || indices.length > 0) {
      const cell = yield* this.getArrayCell(name, indices, scope, line);
      cell.container[cell.idx] = value;
    } else {
      box.value = value;
    }
  }

  // ---------- Expresiones ----------
  * evalExpr(node, scope) {
    switch (node.type) {
      case "Number": return node.value;
      case "String": return node.value;
      case "Bool": return node.value;
      case "Var": {
        if (!scope.has(node.name)) throw new PseudoError(`La variable '${node.name}' no fue definida`, node.line);
        const box = scope.get(node.name);
        if (box.isArray || node.indices.length > 0) {
          const cell = yield* this.getArrayCell(node.name, node.indices, scope, node.line);
          return cell.container[cell.idx];
        }
        return box.value;
      }
      case "Unary": {
        const v = toNumber(yield* this.evalExpr(node.operand, scope));
        return node.op === "MINUS" ? -v : v;
      }
      case "Not": {
        const v = yield* this.evalExpr(node.operand, scope);
        return !truthy(v);
      }
      case "Logical": {
        const l = truthy(yield* this.evalExpr(node.left, scope));
        if (node.op === "Y") { if (!l) return false; return truthy(yield* this.evalExpr(node.right, scope)); }
        else { if (l) return true; return truthy(yield* this.evalExpr(node.right, scope)); }
      }
      case "Compare": {
        const l = yield* this.evalExpr(node.left, scope);
        const r = yield* this.evalExpr(node.right, scope);
        return this.compare(node.op, l, r);
      }
      case "Binary": {
        const l = yield* this.evalExpr(node.left, scope);
        const r = yield* this.evalExpr(node.right, scope);
        return this.binaryOp(node.op, l, r, node.line);
      }
      case "Call": {
        return yield* this.callFunction(node.name, node.args, scope, node.line);
      }
      default:
        throw new PseudoError(`Expresión no soportada: ${node.type}`, node.line);
    }
  }

  compare(op, l, r) {
    if (typeof l === "string" || typeof r === "string") {
      const ls = typeof l === "string" ? l : toDisplay(l);
      const rs = typeof r === "string" ? r : toDisplay(r);
      switch (op) {
        case "EQ": return ls === rs;
        case "NE": return ls !== rs;
        case "LT": return ls < rs;
        case "GT": return ls > rs;
        case "LE": return ls <= rs;
        case "GE": return ls >= rs;
      }
    }
    const ln = toNumber(l), rn = toNumber(r);
    switch (op) {
      case "EQ": return ln === rn;
      case "NE": return ln !== rn;
      case "LT": return ln < rn;
      case "GT": return ln > rn;
      case "LE": return ln <= rn;
      case "GE": return ln >= rn;
    }
  }

  binaryOp(op, l, r, line) {
    if (op === "PLUS" && (typeof l === "string" || typeof r === "string")) {
      return toDisplay(l) + toDisplay(r);
    }
    const ln = toNumber(l), rn = toNumber(r);
    switch (op) {
      case "PLUS": return ln + rn;
      case "MINUS": return ln - rn;
      case "TIMES": return ln * rn;
      case "DIVIDE":
        if (rn === 0) throw new PseudoError("División por cero", line);
        return ln / rn;
      case "POWER": return Math.pow(ln, rn);
      case "MOD": case "PERCENT":
        if (rn === 0) throw new PseudoError("División por cero (Mod)", line);
        return ln % rn;
      case "DIV":
        if (rn === 0) throw new PseudoError("División por cero (Div)", line);
        return Math.trunc(ln / rn);
      default:
        throw new PseudoError(`Operador no soportado: ${op}`, line);
    }
  }

  // ---------- Llamadas a funciones / subprocesos ----------
  * bindParams(params, args, callerScope, calleeScope, line) {
    if (params.length !== args.length) {
      throw new PseudoError(`Se esperaban ${params.length} argumento(s) y se recibieron ${args.length}`, line);
    }
    for (let k = 0; k < params.length; k++) {
      const param = params[k];
      const argNode = args[k];
      if (param.byRef) {
        if (argNode.type !== "Var") throw new PseudoError(`El parámetro '${param.name}' es por referencia: se debe pasar una variable`, line);
        if (!callerScope.has(argNode.name)) throw new PseudoError(`La variable '${argNode.name}' no fue definida`, line);
        if (argNode.indices.length > 0) {
          // referenciar una celda de arreglo: usamos una caja intermedia sincronizada
          const cell = yield* this.getArrayCell(argNode.name, argNode.indices, callerScope, line);
          const box = { type: "Entero", isArray: false, value: cell.container[cell.idx] };
          calleeScope.declare(param.name, box);
          // se sincroniza al final de la llamada (ver callSubprocess/callFunction)
          box.__syncBack = () => { cell.container[cell.idx] = box.value; };
        } else {
          calleeScope.declare(param.name, callerScope.get(argNode.name)); // alias directo
        }
      } else {
        const value = yield* this.evalExpr(argNode, callerScope);
        calleeScope.declare(param.name, makeScalarBox(inferType(value), Array.isArray(value) ? value : value));
        if (Array.isArray(value)) calleeScope.get(param.name).isArray = true;
      }
    }
  }

  * callFunction(name, args, callerScope, line) {
    const fn = this.program.functions[name.toUpperCase()];
    if (!fn) throw new PseudoError(`No existe la función '${name}'`, line);
    this.callDepth++;
    if (this.callDepth > MAX_CALL_DEPTH) throw new PseudoError(`Se superó la profundidad máxima de llamadas (¿'${name}' se llama a sí misma sin caso base?)`, line);
    const scope = new Scope();
    yield* this.bindParams(fn.params, args, callerScope, scope, line);
    if (fn.retVar) scope.declare(fn.retVar, makeScalarBox("Real", 0));
    yield* this.execBlock(fn.body, scope);
    this.callDepth--;
    for (const p of fn.params) if (p.byRef) { const box = scope.get(p.name); if (box.__syncBack) box.__syncBack(); }
    if (fn.retVar && scope.has(fn.retVar)) return scope.get(fn.retVar).value;
    return 0;
  }

  * callSubprocess(name, args, callerScope, line) {
    const sp = this.program.subprocesses[name.toUpperCase()];
    if (!sp) throw new PseudoError(`No existe el subproceso '${name}'`, line);
    this.callDepth++;
    if (this.callDepth > MAX_CALL_DEPTH) throw new PseudoError(`Se superó la profundidad máxima de llamadas (¿'${name}' se llama a sí mismo sin caso base?)`, line);
    const scope = new Scope();
    yield* this.bindParams(sp.params, args, callerScope, scope, line);
    yield* this.execBlock(sp.body, scope);
    this.callDepth--;
    for (const p of sp.params) if (p.byRef) { const box = scope.get(p.name); if (box.__syncBack) box.__syncBack(); }
  }
}

function inferType(value) {
  if (typeof value === "boolean") return "Logico";
  if (typeof value === "number") return Number.isInteger(value) ? "Entero" : "Real";
  return "Cadena";
}


  return { tokenize, parse, Interpreter, PseudoError, toDisplay, defaultValue };
})();
