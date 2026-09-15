// ============================================================
// EJEMPLOS — programas de muestra para el menú "Ejemplos"
// ============================================================
window.EXAMPLES = [
  {
    title: "Hola, mundo",
    desc: "El programa más simple posible.",
    code: `Proceso HolaMundo
    Escribir "Hola, mundo!"
FinProceso
`,
  },
  {
    title: "Suma de dos números",
    desc: "Leer, operar y mostrar un resultado.",
    code: `Proceso Suma
    Definir a, b, c Como Entero

    Escribir "Ingrese el primer numero: "
    Leer a
    Escribir "Ingrese el segundo numero: "
    Leer b

    c <- a + b
    Escribir "El resultado es: ", c
FinProceso
`,
  },
  {
    title: "Par o impar",
    desc: "Estructura condicional Si / SiNo.",
    code: `Proceso ParImpar
    Definir n Como Entero

    Escribir "Ingrese un numero entero: "
    Leer n

    Si n Mod 2 = 0 Entonces
        Escribir n, " es par"
    SiNo
        Escribir n, " es impar"
    FinSi
FinProceso
`,
  },
  {
    title: "Tabla de multiplicar",
    desc: "Bucle Para, sencillo y clásico.",
    code: `Proceso TablaDeMultiplicar
    Definir n, i Como Entero

    Escribir "¿Tabla de qué numero querés ver? "
    Leer n

    Para i <- 1 Hasta 10 Hacer
        Escribir n, " x ", i, " = ", n * i
    FinPara
FinProceso
`,
  },
  {
    title: "Menú con Según",
    desc: "Estructura de selección múltiple.",
    code: `Proceso MenuSegun
    Definir opcion Como Entero

    Escribir "1) Saludar"
    Escribir "2) Despedirse"
    Escribir "3) Salir"
    Escribir "Elegí una opcion: "
    Leer opcion

    Segun opcion Hacer
        1: Escribir "Hola! Que tengas un buen dia."
        2: Escribir "Chau, nos vemos pronto."
        3: Escribir "Cerrando el programa..."
        De Otro Modo:
            Escribir "Opcion invalida."
    FinSegun
FinProceso
`,
  },
  {
    title: "Promedio con Mientras",
    desc: "Bucle controlado por condición, con centinela.",
    code: `Proceso PromedioConCentinela
    Definir nota, suma, cantidad, promedio Como Real

    suma <- 0
    cantidad <- 0

    Escribir "Ingresá notas una por una. Ingresá -1 para terminar."
    Leer nota

    Mientras nota <> -1 Hacer
        suma <- suma + nota
        cantidad <- cantidad + 1
        Escribir "Siguiente nota (-1 para terminar): "
        Leer nota
    FinMientras

    Si cantidad > 0 Entonces
        promedio <- suma / cantidad
        Escribir "Promedio: ", promedio
    SiNo
        Escribir "No se ingresó ninguna nota."
    FinSi
FinProceso
`,
  },
  {
    title: "Adivinar el número (Repetir)",
    desc: "Bucle Repetir...Hasta Que.",
    code: `Proceso Adivinar
    Definir secreto, intento Como Entero

    secreto <- 7

    Repetir
        Escribir "Adiviná el numero secreto (1 al 10): "
        Leer intento
        Si intento < secreto Entonces
            Escribir "Es mas grande..."
        SiNo
            Si intento > secreto Entonces
                Escribir "Es mas chico..."
            FinSi
        FinSi
    Hasta Que intento = secreto

    Escribir "Exacto! El numero era ", secreto
FinProceso
`,
  },
  {
    title: "Arreglos: notas de un curso",
    desc: "Dimension, carga y recorrido de un arreglo.",
    code: `Proceso NotasDelCurso
    Definir i, cantidad Como Entero
    Definir suma, promedio Como Real

    cantidad <- 5
    Dimension notas[5] Como Real

    Para i <- 1 Hasta cantidad Hacer
        Escribir "Nota del alumno ", i, ": "
        Leer notas[i]
    FinPara

    suma <- 0
    Para i <- 1 Hasta cantidad Hacer
        suma <- suma + notas[i]
    FinPara

    promedio <- suma / cantidad
    Escribir "El promedio del curso es: ", promedio
FinProceso
`,
  },
  {
    title: "Función: es primo",
    desc: "Función con valor de retorno y lógica booleana.",
    code: `Funcion esPrimo = EsPrimo(n)
    Definir i Como Entero
    esPrimo <- Verdadero

    Si n < 2 Entonces
        esPrimo <- Falso
    SiNo
        Para i <- 2 Hasta n - 1 Hacer
            Si n Mod i = 0 Entonces
                esPrimo <- Falso
            FinSi
        FinPara
    FinSi
FinFuncion

Proceso ProbarPrimos
    Definir n Como Entero

    Escribir "Ingrese un numero: "
    Leer n

    Si EsPrimo(n) Entonces
        Escribir n, " es primo"
    SiNo
        Escribir n, " no es primo"
    FinSi
FinProceso
`,
  },
  {
    title: "SubProceso por referencia",
    desc: "Parámetros 'ref' que modifican al llamador.",
    code: `SubProceso Intercambiar(ref x, ref y)
    Definir temp Como Entero
    temp <- x
    x <- y
    y <- temp
FinSubProceso

Proceso UsarIntercambio
    Definir a, b Como Entero
    a <- 3
    b <- 9

    Escribir "Antes: a=", a, " b=", b
    Intercambiar(a, b)
    Escribir "Despues: a=", a, " b=", b
FinProceso
`,
  },
  {
    title: "Recursión: factorial",
    desc: "Una función que se llama a sí misma.",
    code: `Funcion r = Factorial(n)
    Si n <= 1 Entonces
        r <- 1
    SiNo
        r <- n * Factorial(n - 1)
    FinSi
FinFuncion

Proceso CalcularFactorial
    Definir n Como Entero
    Escribir "Ingrese un numero: "
    Leer n
    Escribir n, "! = ", Factorial(n)
FinProceso
`,
  },
];
