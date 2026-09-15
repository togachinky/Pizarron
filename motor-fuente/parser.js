// ============================================================
// PARSER — convierte los tokens en un árbol de sintaxis (AST)
// ============================================================
const { PseudoError } = require("./lexer");

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

module.exports = { parse, Parser };
