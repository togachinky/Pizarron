const { tokenize, PseudoError } = require("./lexer");
const { parse } = require("./parser");
const { Interpreter } = require("./interpreter");

function runProgram(source, inputs = []) {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const interp = new Interpreter(ast);
  const gen = interp.run();
  let output = "";
  let result = gen.next();
  let inputIdx = 0;
  let guard = 0;
  while (!result.done) {
    guard++;
    if (guard > 5_000_000) throw new Error("test guard triggered (posible loop)");
    const ev = result.value;
    if (ev.kind === "output") {
      output += ev.text + (ev.newline ? "\n" : "");
      result = gen.next();
    } else if (ev.kind === "input") {
      const val = inputs[inputIdx++];
      result = gen.next(val);
    } else if (ev.kind === "line") {
      result = gen.next();
    } else {
      result = gen.next();
    }
  }
  return output;
}

function test(name, source, inputs, expectedContains) {
  try {
    const out = runProgram(source, inputs);
    const ok = expectedContains.every((s) => out.includes(s));
    console.log(`${ok ? "OK  " : "FAIL"} - ${name}`);
    if (!ok) {
      console.log("  --- salida obtenida ---");
      console.log(out.split("\n").map((l) => "  " + l).join("\n"));
    }
  } catch (e) {
    console.log(`ERROR - ${name}: ${e.message}${e.line ? " (línea " + e.line + ")" : ""}`);
  }
}

// -------------------- TESTS --------------------

test("Hola mundo", `
Proceso HolaMundo
    Escribir "Hola, mundo!"
FinProceso
`, [], ["Hola, mundo!"]);

test("Suma de dos numeros", `
Proceso Suma
    Definir a, b, c Como Entero
    Escribir "Ingrese el primer numero:"
    Leer a
    Escribir "Ingrese el segundo numero:"
    Leer b
    c <- a + b
    Escribir "El resultado es: ", c
FinProceso
`, ["4", "5"], ["El resultado es: 9"]);

test("Par o impar (Si)", `
Proceso ParImpar
    Definir n Como Entero
    Leer n
    Si n Mod 2 = 0 Entonces
        Escribir n, " es par"
    SiNo
        Escribir n, " es impar"
    FinSi
FinProceso
`, ["7"], ["7 es impar"]);

test("Para (tabla del 5)", `
Proceso Tabla
    Definir i Como Entero
    Para i <- 1 Hasta 5 Hacer
        Escribir "5 x ", i, " = ", 5*i
    FinPara
FinProceso
`, [], ["5 x 1 = 5", "5 x 5 = 25"]);

test("Para con paso negativo", `
Proceso Cuenta
    Definir i Como Entero
    Para i <- 5 Hasta 1 Con Paso -1 Hacer
        Escribir i
    FinPara
FinProceso
`, [], ["5", "4", "3", "2", "1"]);

test("Mientras", `
Proceso Fact
    Definir n, f Como Entero
    n <- 5
    f <- 1
    Mientras n > 1 Hacer
        f <- f * n
        n <- n - 1
    FinMientras
    Escribir "Factorial: ", f
FinProceso
`, [], ["Factorial: 120"]);

test("Repetir", `
Proceso RepetirTest
    Definir x Como Entero
    x <- 0
    Repetir
        x <- x + 1
        Escribir x
    Hasta Que x >= 3
FinProceso
`, [], ["1", "2", "3"]);

test("Segun", `
Proceso SegunTest
    Definir n Como Entero
    Leer n
    Segun n Hacer
        1: Escribir "uno"
        2,3: Escribir "dos o tres"
        De Otro Modo:
            Escribir "otro"
    FinSegun
FinProceso
`, ["3"], ["dos o tres"]);

test("Arreglos (Dimension + Para)", `
Proceso Arreglo
    Definir i, suma Como Entero
    Dimension notas[5] Como Entero
    Para i <- 1 Hasta 5 Hacer
        notas[i] <- i * 2
    FinPara
    suma <- 0
    Para i <- 1 Hasta 5 Hacer
        suma <- suma + notas[i]
    FinPara
    Escribir "Suma: ", suma
FinProceso
`, [], ["Suma: 30"]);

test("Funcion con retorno", `
Funcion resultado = Cuadrado(x)
    resultado <- x * x
FinFuncion

Proceso UsaFuncion
    Definir n Como Entero
    n <- Cuadrado(6)
    Escribir "Cuadrado: ", n
FinProceso
`, [], ["Cuadrado: 36"]);

test("SubProceso por referencia", `
SubProceso Incrementar(ref x)
    x <- x + 1
FinSubProceso

Proceso UsaSub
    Definir a Como Entero
    a <- 10
    Incrementar(a)
    Incrementar(a)
    Escribir "a = ", a
FinProceso
`, [], ["a = 12"]);

test("Cadenas y concatenacion", `
Proceso Concat
    Definir nombre Como Cadena
    nombre <- "Mundo"
    Escribir "Hola, " + nombre + "!"
FinProceso
`, [], ["Hola, Mundo!"]);

test("Logico Y/O/No", `
Proceso Logica
    Definir a, b Como Logico
    a <- Verdadero
    b <- Falso
    Si a Y No b Entonces
        Escribir "Caso1 OK"
    FinSi
    Si a O b Entonces
        Escribir "Caso2 OK"
    FinSi
FinProceso
`, [], ["Caso1 OK", "Caso2 OK"]);

test("Recursion (factorial recursivo)", `
Funcion r = Fact(n)
    Si n <= 1 Entonces
        r <- 1
    SiNo
        r <- n * Fact(n-1)
    FinSi
FinFuncion

Proceso Rec
    Escribir Fact(6)
FinProceso
`, [], ["720"]);

test("Escribir Sin Saltar", `
Proceso SinSaltar
    Escribir Sin Saltar "Hola "
    Escribir "Mundo"
FinProceso
`, [], ["Hola Mundo"]);

// Este caso debe lanzar PseudoError (no debe imprimir "OK")
try {
  runProgram(`
Proceso ErrTest
    Escribir x
FinProceso
`, []);
  console.log("FAIL - Error: variable no definida (no lanzó error)");
} catch (e) {
  console.log(`OK   - Error: variable no definida -> "${e.message}" (línea ${e.line})`);
}

console.log("\nListo.");
