// ============================================================
// INTÉRPRETE — recorre el AST y ejecuta el programa.
// Implementado con generadores para poder "pausar" la ejecución
// cada vez que se necesita leer un dato del usuario, y para
// poder ejecutar paso a paso.
// ============================================================
const { PseudoError } = require("./lexer");

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

module.exports = { Interpreter, Scope, toDisplay, defaultValue };
