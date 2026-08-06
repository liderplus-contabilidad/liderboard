# Rol de pagos — las fórmulas del libro del contador

Ingeniería inversa de la hoja `GENERAL` de
`.context/ROL_DE_PAGOS_03-2026_CULTURA_MANOR_OK (1).xls` (HOTEL BOUTIQUE CULTURA MANOR,
MARZO 2026), extraída leyendo las **fórmulas** del archivo, no sus valores. Es la fuente
de la que sale el motor de cálculo de `lib/payroll/`.

El libro tiene 8 hojas y 653 fórmulas solo en `GENERAL`. Qué es cada una:

| Hoja                   | Qué es                                                                                                        | Fórmulas |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| `GENERAL`              | **La nómina.** Todo lo que este documento describe.                                                           | 653      |
| `INDIVIDUAL`           | El comprobante de un empleado, por `VLOOKUP` sobre `GENERAL` (§10).                                           | 139      |
| `ASIENTOS`             | El asiento contable, leído de las filas `SUBTOTAL` de `GENERAL`.                                              | 147      |
| `ANTICIPO`             | Control de anticipos; referencia `GENERAL` y arrastra `#REF!`.                                                | 212      |
| `IESS`                 | Volcado del portal del IESS, sin fórmulas.                                                                    | 0        |
| `H.E.`                 | **Vacía.**                                                                                                    | 0        |
| `REPORTE HORAS EXTRAS` | **Vacía** (solo el marco `A2:L56`).                                                                           | 0        |
| `OTROS`                | Muerta: «REPORTE DE PRODUCTOS AL 31 DE AGOSTO DEL 2010» — jabón, shampoo y rinse. Nada que ver con la nómina. | 48       |

Este documento cubre **la nómina** (`GENERAL`) y **el rol individual** (`INDIVIDUAL`), que
es lo que la pantalla de detalle del empleado reproduce. Que las dos hojas de horas extras
estén vacías es un dato, no una omisión: es parte de §11.1.

---

## 0. Advertencia que gobierna todo lo demás

**El libro NO es una especificación estable: la misma columna trae fórmulas distintas en
filas distintas.** No es ruido, es evidencia de que el contador edita celdas a mano cada
mes. Comparando las seis filas de empleado del archivo (15, 16, 28, 29, 35, 36) contra la
fila plantilla vacía (7):

| Columna                   | Fila 7 (plantilla)      | Fila 15                 | Fila 16             | Filas 28-29         | Filas 35-36            |
| ------------------------- | ----------------------- | ----------------------- | ------------------- | ------------------- | ---------------------- |
| `L` valor extras 25%      | `…*0.25*I`              | `…*0.25*I`              | **`…*0.15*I` `*0`** | `…*0.25*I`          | `…*0.25*I`             |
| `M` total horas extras    | `J+K+L`                 | **`(J+K+L)*0`**         | `J+K+L`             | **`(J+K+L)*0`**     | `J+K+L`                |
| `N` décimo IV             | **`810`** `/360*E` `*0` | `CT→482`, **`TP→470`**  | `CT→482`, `TP→482`  | `CT→482`, `TP→482`  | `CT→482`, `TP→482`     |
| `O` décimo III            | `…/12` **`*0`**         | `…/12`                  | `…/12`              | `…/12`              | `…/12`                 |
| `AS` XIII provisión       | `…/12`                  | `…/12` **`*0`**         | `…/12` **`*0`**     | `…/12` **`*0`**     | `…/12` **`*0`**        |
| `AT` XIV provisión        | **`846`** `/360*E`      | **`470`** `/360*E` `*0` | `470` `/360*E` `*0` | `470` `/360*E` `*0` | **otra fórmula**, `*0` |
| `AI` desc. tiempo parcial | —                       | `((D/30*3)*50%)*0`      | constante `0`       | constante `0`       | constante `0`          |
| `G` horas 50 % (cantidad) | —                       | `11/2`                  | constante `0`       | `52/2`, `26/2`      | **`-1*0`**, **`0/2`**  |

`AT` en las filas 35-36 no es una constante distinta sino una fórmula entera distinta
—`ROUND((G+N+O+Q+P+R+S+T+U)/12,2)*0`, que ni siquiera es un décimo cuarto—, y las
cantidades de horas de `G` llegan escritas como divisiones a medio borrar (`-1*0`, `0/2`).
Todo eso da cero y no mueve ninguna cifra, pero mide bien cuánta edición manual hay debajo.

Tres clases de deriva, y hay que tratarlas distinto:

1. **Interruptores `*0`.** Multiplicar por cero es cómo el contador APAGA un concepto sin
   borrar la fórmula. No son constantes: son **banderas** y el motor debe exponerlas como
   tales (§6), no hornear el cero.
2. **Constantes rancias.** `810` y `846` en la plantilla, `470` en la rama `TP` de la fila
   15, son SBU de años anteriores que quedaron en filas que nadie recalculó. El valor
   vigente en 2026 es **482** (§3).
3. **Erratas.** `0.15` en la fila 16 contra `0.25` en las otras tres; el rótulo de `I` dice
   «HORAS EXTRAS 15%» mientras el de `L` dice «VALOR GANADO EXTRAS 25%». Esa columna está
   genuinamente rota en el archivo y necesita que el contador la resuelva (§11).

**Consecuencia de diseño:** «seguir cada fórmula del Excel» no puede significar copiar la
fórmula de cada fila. Significa adoptar UNA versión canónica —la que comparten las filas
vivas— y **parametrizar** lo que legítimamente varía. Este documento fija esa versión
canónica.

---

## 1. Las variables

Nombres de columna del libro → identificadores propuestos para el motor. `IN` = lo teclea
el usuario, `CALC` = lo deriva el motor, `FICHA` = viene de la ficha del empleado.

### Identidad y ficha

| Col  | Rótulo del libro   | Clase | Identificador            | Notas                                                                                                                     |
| ---- | ------------------ | ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `A`  | `No.`              | IN    | —                        | Ordinal. En el archivo real una fila trae `"1-"`: nunca se parsea, solo distingue fila de empleado de encabezado de área. |
| `B`  | `EMPLEADO`         | FICHA | `name`                   |                                                                                                                           |
| `C`  | `CARGO`            | FICHA | `role`                   |                                                                                                                           |
| `D`  | `SUELDO BASE`      | FICHA | `baseSalary`             | Base de TODO.                                                                                                             |
| `E`  | `DIAS`             | IN    | `days`                   | Días pagados del mes. Default 30.                                                                                         |
| `BB` | `TC`               | FICHA | `contractType`           | `"CT"` \| `"TP"`. Parte a la mitad el décimo IV.                                                                          |
| `BA` | `FR`               | FICHA | `hasReserveFund`         | `"S"` \| `"N"` — ¿tiene derecho a fondo de reserva?                                                                       |
| `AZ` | `AC FR`            | FICHA | `accumulatesReserveFund` | `"S"` \| `"N"` — ¿lo ACUMULA en el IESS en vez de cobrarlo mensual?                                                       |
| `BC` | `FECHA INGRESO`    | FICHA | `hireDate`               | Serial Excel.                                                                                                             |
| `BD` | `CÉDULA`           | FICHA | `idCard`                 |                                                                                                                           |
| `BE` | `NÚMERO DE CUENTA` | FICHA | —                        | No se lee hoy.                                                                                                            |
| `BF` | `CODIGO SECTORIAL` | FICHA | `sectorCode`             |                                                                                                                           |

### Ingresos

| Col | Rótulo                         | Clase | Identificador        |
| --- | ------------------------------ | ----- | -------------------- |
| `F` | `SUELDO UNIFICADO`             | CALC  | `unifiedSalary`      |
| `G` | `HORAS EXTRAS 50%` (cantidad)  | IN    | `overtimeHours50`    |
| `H` | `HORAS EXTRAS 100%` (cantidad) | IN    | `overtimeHours100`   |
| `I` | `HORAS EXTRAS 15%` (cantidad)  | IN    | `overtimeHours25`    |
| `J` | `VALOR GANADO EXTRAS 50%`      | CALC  | `overtimePay50`      |
| `K` | `VALOR GANADO EXTRAS 100%`     | CALC  | `overtimePay100`     |
| `L` | `VALOR GANADO EXTRAS 25%`      | CALC  | `overtimePay25`      |
| `M` | `TOTAL HORAS EXTRAS`           | CALC  | `overtimeTotal`      |
| `N` | `DECIMO IV MENSUAL`            | CALC  | `fourteenthMonthly`  |
| `O` | `DECIMO III MENSUAL`           | CALC  | `thirteenthMonthly`  |
| `P` | `VACACIONES - MENSUAL`         | IN    | `vacationPay`        |
| `Q` | `SEGURO PRIVADO`               | IN    | `privateInsurance`   |
| `R` | `VIATICOS/VIVIENDA`            | IN    | `allowances`         |
| `S` | `COMISION FIJA POR VTAS.`      | IN    | `fixedCommission`    |
| `T` | `COMISION VARIABLE`            | IN    | `variableCommission` |
| `U` | `FONDO DE RESERVA`             | CALC  | `reserveFundPaid`    |
| `V` | `BONO CUMPLIMIENTO`            | IN    | `bonus`              |
| `W` | `TOTAL INGRESO`                | CALC  | `grossIncome`        |

### Egresos

| Col       | Rótulo                                    | Clase   | Identificador            |
| --------- | ----------------------------------------- | ------- | ------------------------ |
| `X`       | `APORTES AL IESS`                         | CALC    | `iessEmployee`           |
| `Y`       | `PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS` | IN      | `iessLoans`              |
| `Z`       | `LICENCIA SIN SUELDO`                     | IN      | `unpaidLeave`            |
| `AA`      | `ANTICIPO SUELDO`                         | IN      | `salaryAdvance`          |
| `AB`      | `PRESTAMOS EMPRESARIALES`                 | IN      | `companyLoans`           |
| `AC`      | `IMPUESTO RENTA`                          | IN      | `incomeTax`              |
| `AD`      | `ALMUERZOS`                               | IN      | `meals`                  |
| `AE`      | `MULTAS`                                  | IN      | `fines`                  |
| `AF`      | `CONSUMO LOCALES EMPLEADO`                | IN      | `inHouseConsumption`     |
| `AG`      | `CONTRIBUCION SOLIDARIA`                  | IN      | `solidarityContribution` |
| `AH`      | `OTROS`                                   | IN      | `otherDeductions`        |
| `AI`      | `DESCUENTO TIEMPO PACIAL` (sic)           | IN/CALC | `partTimeDeduction`      |
| `AJ`–`AM` | _(sin rótulo)_                            | IN      | —                        | Cuatro columnas anónimas, siempre 0, **pero dentro de `SUM(X:AN)`**. |
| `AN`      | `Descuento PERMISO MEDICO`                | IN/CALC | `medicalLeaveDeduction`  |
| `AO`      | `TOTAL EGRESOS`                           | CALC    | `totalDeductions`        |
| `AP`      | `LIQUIDO A RECIBIR`                       | CALC    | `netPay`                 |

### Provisión patronal y conciliación

| Col  | Rótulo                  | Clase | Identificador         |
| ---- | ----------------------- | ----- | --------------------- |
| `AS` | `XIII`                  | CALC  | `thirteenthProvision` |
| `AT` | `XIV`                   | CALC  | `fourteenthProvision` |
| `AU` | `PATRONAL`              | CALC  | `iessEmployer`        |
| `AV` | `VACACION`              | CALC  | `vacationProvision`   |
| `AW` | `ACUMULA FONDO RESERVA` | CALC  | `reserveFundAccrued`  |
| `AX` | `PROVISION`             | CALC  | `totalProvision`      |
| `AY` | `COSTO TOTAL`           | CALC  | `employerCost`        |
| `BG` | `NÓMINA`                | CALC  | —                     | Espejo de `B`.   |
| `BH` | `LIQUIDO A RECIBIR`     | CALC  | —                     | Espejo de `AP`.  |
| `BZ` | `PAGADO`                | IN    | `paid`                | Tecleado a mano. |
| `CA` | `DIFERENCIA X PAGAR`    | CALC  | `difference`          |

---

## 2. Las seis bases de cálculo

Lo más sutil del libro: **cada derivación suma un subconjunto DISTINTO de los ingresos.**
Ninguna usa `W`. Escribirlas como «el sueldo» o «el total» sería el error que separa el
motor del archivo al centavo.

| Base               | Columnas que suma       | Quién la usa                                                  |
| ------------------ | ----------------------- | ------------------------------------------------------------- |
| **Aportable**      | `F+M+P+Q+R+S+T`         | `X` IESS personal, `AU` patronal, `U` fondo de reserva pagado |
| **Décimo III**     | `F+M+Q+R+S+T`           | `O` — Aportable **menos `P`**                                 |
| **FR acumulado**   | `F+M+P+R+S+T`           | `AW` — Aportable **menos `Q`**                                |
| **Vacaciones**     | `F+M+N+P+R+S+T`         | `AV` — Aportable **menos `Q` más `N`**                        |
| **XIII provisión** | `F+M+N+O+P+Q+R+S+T`     | `AS` — Aportable **más `N` y `O`**                            |
| **Total ingreso**  | `F+M+N+O+P+Q+R+S+T+U+V` | `W` — todas, incluidos `U` y `V`                              |

Leído al derecho: `V` (bono) queda fuera de TODAS las bases y solo entra al total. `U`
(fondo de reserva) igual. `P` (vacaciones) sale del décimo III. `Q` (seguro privado) sale
del fondo de reserva acumulado y de vacaciones, pero entra al IESS.

---

## 3. Constantes y parámetros del período

| Símbolo                | Valor 2026 | Origen         | De dónde sale en el libro | Identificador           |
| ---------------------- | ---------- | -------------- | ------------------------- | ----------------------- |
| SBU                    | `482`      | **Ley**        | Rama `CT` de `N`          | `unifiedBasicSalary`    |
| Aporte personal IESS   | `9.45 %`   | **Ley**        | `X`                       | `iessEmployeeRate`      |
| Aporte patronal IESS   | `12.15 %`  | **Ley**        | `AU`                      | `iessEmployerRate`      |
| Fondo de reserva       | `8.33 %`   | **Ley**        | `AW`                      | `reserveFundRate`       |
| Recargo suplementario  | `× 1.5`    | **Ley**        | `J`                       | `overtimeMultiplier50`  |
| Recargo extraordinario | `× 2`      | **Ley**        | `K`                       | `overtimeMultiplier100` |
| Tercera clase          | `× 0.25`   | **en disputa** | `L` (una fila usa `0.15`) | `overtimeMultiplier25`  |
| Días base del mes      | `30`       | convención     | `D/30*E` en `F`           | `monthlyDays`           |
| Horas de la jornada    | `8`        | convención     | `D/30/8` en `J`,`K`,`L`   | `dailyHours`            |
| Días base del año      | `360`      | convención     | `SBU/360*E` en `N`        | `yearlyDays`            |

**Son parámetros del PERÍODO, no del empleado**, y cambian por año (el SBU sube cada enero;
las tasas del IESS, rara vez). Guardarlos junto al período es lo que permite que marzo de
2026 siga cuadrando cuando 2027 traiga otro SBU.

**La columna «Origen» es una distinción de la firma, no una etiqueta decorativa.** Hay cifras
fijadas por LEY —iguales para todos, cambian solo por decreto— y hay decisiones
DISCRECIONALES de gerencia o acuerdos con cada empleado, que varían caso por caso. **Solo las
primeras son parámetros.** Por eso el importe reconocido de horas extras NO está en esta
tabla: se teclea por empleado y por mes (§6) y **no tiene ni debe tener valor por defecto**,
porque «esa variación no es calculada, sino manual». Confundir las dos cosas produciría un
default que el rol real contradice todos los meses.

La firma nombra también un **20 % ligado a la comisión variable**, y **no entra en esta
tabla**: confirmaron que se aplica a mano, fuera de la app, y que aquí llega el importe ya
calculado (§11.5). Es la misma frontera que el importe de horas extras — lo que se teclea no
es un parámetro.

---

## 4. Las fórmulas, una por una

Fórmula del libro literal → lectura → dependencias. `ROUND(x,2)` es el `ROUND` de Excel
(medio hacia afuera del cero), no `Math.round` (§9).

### Sueldo unificado — `F`

```
F = ROUND(D/30*E, 2)
```

Sueldo base prorrateado por días trabajados. Con `E=30` es el sueldo base entero.
Depende de: `baseSalary`, `days`.

### Valor de las horas extras — `J`, `K`, `L`

```
J = ROUND(((D/30/8) * 1.5)  * G, 2)
K = ROUND(((D/30/8) * 2)    * H, 2)
L = ROUND(((D/30/8) * 0.25) * I, 2)
```

El valor hora es `D/30/8` — **sale del sueldo BASE (`D`), no del unificado (`F`)**: a
quien trabajó medio mes su hora extra se le paga a tarifa completa.

Los factores son inconsistentes entre sí y hay que decirlo: `1.5` y `2` son multiplicadores
TOTALES (hora + recargo), `0.25` es solo el RECARGO. Ver §11.

### Total de horas extras — `M`

```
M = (J + K + L)          ← forma canónica (fila plantilla)
M = (J + K + L) * 0      ← forma apagada (3 de las 4 filas vivas)
```

**Es un interruptor, no una fórmula.** Ver §6.

### Décimo cuarto mensualizado — `N`

```
N = IF(TC="CT", ROUND(SBU/360*E, 2),
                ROUND(SBU/360*E/2, 2))
```

Con `SBU=482` y `E=30` da `40.17`. Contrato parcial (`TP`) cobra la mitad. Depende de:
`contractType`, `days`, `unifiedBasicSalary`.

### Décimo tercero mensualizado — `O`

```
O = ROUND((F + M + Q + R + S + T) / 12, 2)
```

Un doceavo de la base Décimo III (§2). Depende de esa base.

### Fondo de reserva pagado — `U`

```
U = IF(FR="S", IF(AC_FR="S", 0,
                             ROUND((F+M+P+Q+R+S+T)/12, 2)),
                0)
```

Dos banderas encadenadas: solo cobra quien tiene derecho (`FR="S"`) **y** no lo acumula
(`AC FR="N"`). Ver §7.

Ojo: aquí es `/12`, mientras que su gemelo `AW` usa `×0.0833`. **No dan lo mismo** (§8).

### Total ingreso — `W`

```
W = F + N + M + P + Q + R + S + T + U + O + V
```

**Sin `ROUND`.** De ahí salen los `569.5500000000001` del archivo (§9).

### Aportes al IESS (personal) — `X`

```
X = ROUND((F + M + Q + P + R + S + T) * 0.0945, 2)
```

Base Aportable × 9,45 %.

### Total egresos — `AO`

```
AO = SUM(X:AN)
```

Un rango, no una lista: barre `X`…`AN` **incluidas las cuatro columnas sin rótulo
`AJ`–`AM`**. Un motor que sume concepto por concepto tiene que decidir qué hace con ellas.
Sin `ROUND`.

### Líquido a recibir — `AP`

```
AP = W - AO
```

Sin `ROUND`. Es la resta de dos sumas sin redondear, y por eso llega con ruido de coma
flotante (`457.69000000000005`).

### Provisión XIII — `AS`

```
AS = ROUND((F + M + N + P + O + Q + R + S + T) / 12, 2) * 0
```

Apagada en las cuatro filas vivas: los décimos ya se mensualizaron en `N` y `O`, así que
provisionarlos otra vez los contaría dos veces. Ver §6.

### Provisión XIV — `AT`

```
AT = IF(TC="CT", ROUND(470/360*E, 2), ROUND(470/360*E/2, 2)) * 0
```

Apagada por la misma razón. El `470` es rancio (§0).

### Aporte patronal — `AU`

```
AU = ROUND((F + M + Q + P + R + S + T) * 0.1215, 2)
```

La MISMA base que `X`, otra tasa.

### Provisión de vacaciones — `AV`

```
AV = ROUND((F + M + N + P + R + S + T) / 24, 2)
```

Un veinticuatroavo: 15 días de vacaciones al año = medio sueldo mensual al año.

### Fondo de reserva acumulado — `AW`

```
AW = IF(FR="S", IF(AC_FR="S", ROUND((F+M+P+R+S+T) * 0.0833, 2), 0),
                0)
```

El espejo de `U`: cobra el patrono cuando el empleado ACUMULA. Ver §7 y §8.

### Provisión total y costo empresa — `AX`, `AY`

```
AX = SUM(AS:AW)     ← XIII + XIV + patronal + vacaciones + FR acumulado
AY = AX + W
```

Ambas sin `ROUND`.

### Diferencia — `CA`

```
CA = BH - BZ        (BH = AP)
```

Líquido menos pagado. Cero ⇒ conciliado. Es lo que `employeeReconciliationStatus` ya
implementa en `lib/payroll/period-detail.ts`, con la comparación al centavo que el ruido
de `AP` obliga.

---

## 5. Orden de evaluación

El grafo no tiene ciclos. Un solo recorrido en este orden basta:

```
1.  F                    ← D, E
2.  J, K, L              ← D, G, H, I
3.  M                    ← J, K, L        [interruptor]
4.  N                    ← TC, E, SBU
5.  O                    ← F, M, Q, R, S, T
6.  U                    ← FR, AC FR, F, M, P, Q, R, S, T
7.  W                    ← F, M, N, O, P, Q, R, S, T, U, V
8.  X                    ← F, M, P, Q, R, S, T
9.  AO                   ← X …  AN
10. AP                   ← W, AO
11. AS, AT, AU, AV, AW   ← bases + banderas
12. AX                   ← AS … AW
13. AY                   ← AX, W
14. CA                   ← AP, PAGADO
```

Todos los `IN` (`P`, `Q`, `R`, `S`, `T`, `V`, `Y`…`AN`) son hojas del grafo: nada los
deriva.

---

## 6. Los interruptores `*0`

Cuatro columnas aparecen multiplicadas por cero en algunas filas. **Cada una tiene que ser
una entrada explícita del motor, no un cero horneado**, porque el contador la decide por
empleado y por mes.

| Columna                       | Entrada del motor      | Tipo             | Estado en marzo 2026                        |
| ----------------------------- | ---------------------- | ---------------- | ------------------------------------------- |
| `M` total horas extras        | `approvedOvertime`     | importe o `null` | **`0`** en 15, 28, 29; `null` en 16, 35, 36 |
| `AS` XIII provisión           | `provisionsThirteenth` | booleano         | apagado en los 6                            |
| `AT` XIV provisión            | `provisionsFourteenth` | booleano         | apagado en los 6                            |
| `AI` descuento tiempo parcial | —                      | —                | apagado / constante 0                       |

**`approvedOvertime` es un IMPORTE que se teclea, no un porcentaje que la app calcule**, y
llegar ahí costó dos modelos equivocados. El rol se presenta a Gerencia antes de pagarse y lo
reconocido puede ser todo o una parte, según la ocupación del mes y los acuerdos con cada
empleado — pero la firma fue explícita en las dos cosas que lo definen: «más que un porcentaje
predeterminado no sería como tal» y **«esa variación no es calculada, sino manual»**. Así que
la app no deriva la cifra de nada: la recibe. `null` es «todo lo trabajado», `0` es el `*0`
del libro, y cualquier otro número es exactamente lo que cuenta.

Es también lo más fiel al Excel, donde `M` es una celda que el contador edita a mano.

**Su valor no hace falta transcribirlo ni leer fórmulas para recuperarlo: se DEDUCE de los
valores.** Si `M ≠ J+K+L`, entonces `M` es el importe reconocido; si coinciden, no hubo
recorte y va `null`. Es lo que usa el fixture de oro y lo que usará el importador, y coincide
fila por fila con lo que dicen las fórmulas.

El caso de `M` es el más grave y no es un tecnicismo: `M` es el ÚNICO camino por el que las
horas extras llegan a algo. `W` suma `M`, no `J+K+L`; la base aportable suma `M`; el décimo
III suma `M`. Con `M=0` las horas extras se calculan, se muestran en su fila y **no tocan
nada**. La camarera de la fila 15 tiene 5,5 horas al 50 % valoradas en `16,75` — y su total
ingreso es `567,98`, que no las incluye. El rol individual sin embargo SÍ las imprime
(§10).

---

## 7. Fondo de reserva: las dos banderas

`FR` (`BA`) y `AC FR` (`AZ`) no son lo mismo y el libro las cruza:

| `FR` | `AC FR`        | `U` (ingreso del empleado) | `AW` (provisión del patrono) |
| ---- | -------------- | -------------------------- | ---------------------------- |
| `N`  | _(cualquiera)_ | `0`                        | `0`                          |
| `S`  | `N`            | `base_aportable / 12`      | `0`                          |
| `S`  | `S`            | `0`                        | `base_FR_acumulado × 8.33 %` |

O sea: quien no tiene derecho no genera nada; quien lo cobra mensual lo recibe como
ingreso; quien lo acumula en el IESS lo genera como costo patronal sin verlo en su líquido.

**Ninguna de las dos ramas vivas se ejercita en el archivo de marzo 2026**: los cuatro
empleados traen `FR="N"`. El motor las implementa a ciegas contra la fórmula, y los tests
las cubren con casos sintéticos — pero **hay que verificarlas con un mes real** antes de
confiar en ellas.

---

## 8. `/12` contra `× 0.0833` — dos centavos de diferencia

`U` divide entre 12; `AW` multiplica por `0.0833`. No es lo mismo:

```
487.21 / 12      = 40.6008…  → ROUND → 40.60
487.21 * 0.0833  = 40.5847…  → ROUND → 40.58
```

Dos centavos. Como las dos ramas son excluyentes (§7) nunca se contradicen en el mismo
empleado, pero el motor **no debe unificarlas**: el que las unifique elige un valor que el
archivo del contador no dice, y ahí empieza el descuadre.

---

## 9. Redondeo y coma flotante

Dos reglas distintas conviviendo, y las dos importan:

- **Las derivaciones redondean a 2:** `F`, `J`, `K`, `L`, `N`, `O`, `U`, `X`, `AS`, `AT`,
  `AU`, `AV`, `AW`.
- **Los totales NO redondean:** `W`, `AO`, `AP`, `AX`, `AY`, `M`, `CA`. Por eso el archivo
  guarda literalmente `457.69000000000005`, `569.5500000000001`, `81.00999999999999`.

Reproducir esto exige dos decisiones:

1. `ROUND` de Excel redondea **medio hacia afuera del cero**; `Math.round` de JS redondea
   **medio hacia +∞**. Difieren solo en negativos (`ROUND(-0.005,2)` = `-0.01`,
   `Math.round(-0.5)` = `-0`). Casi todo aquí es positivo, pero un descuento mal tecleado
   puede volverse negativo, así que el helper del motor debe implementar la regla de Excel.
2. **No redondear los totales a propósito.** Redondearlos «para que se vea limpio» haría
   que el motor difiera del archivo, y rompería la comparación con `PAGADO`, que ya está
   resuelta con la regla al centavo de `sameToTheCentavo` en `period-detail.ts`.

---

## 10. El rol individual (`INDIVIDUAL`) y su inconsistencia

La hoja `INDIVIDUAL` es el comprobante de un empleado, resuelto con
`VLOOKUP($D$5, GENERAL!$A$6:$BH$37, n, FALSE)` sobre el número de fila que se teclea en
`D5`. Es lo que la pantalla de detalle reproduce, y su orden de conceptos es exactamente el
del diseño:

| Fila  | Concepto                    | Cantidad | Valor |
| ----- | --------------------------- | -------- | ----- |
| 9     | `SUELDO UNIFICADO`          | —        | `F`   |
| 10    | `VALOR GANADO EXTRAS 50%`   | `G`      | `J`   |
| 11    | `VALOR GANADO EXTRAS 100%`  | `H`      | `K`   |
| 12    | `VALOR GANADO EXTRAS 25%`   | `I`      | `L`   |
| 13    | `DECIMO IV SUELDO-MENSUAL`  | —        | `N`   |
| 14    | `DECIMO III SUELDO-MENSUAL` | —        | `O`   |
| 15–19 | `P`, `Q`, `R`, `S`, `T`     | —        | ídem  |
| 20    | `FONDO DE RESERVA`          | `(*)`    | `U`   |
| 21    | `BONO CUMPLIMIENTO`         | `(*)`    | `V`   |
| 22    | `TOTAL DE INGRESOS`         | —        | `W`   |
| 24–40 | egresos `X` … `AN`          | —        | ídem  |

**El comprobante imprime `J`, `K`, `L`, pero el total que imprime es `W`, que suma `M`.**
Con el interruptor de `M` apagado (§6), el rol individual le muestra al empleado `16,75` de
horas extras dentro de una lista cuyo total no las contiene. No es un error de lectura: es
lo que el archivo hace, y el prototipo del diseño lo reprodujo tal cual (captura del
diseño: `16,75` en I-02 y `567,98` de total).

---

## 11. Preguntas abiertas para el contador

Ninguna se puede resolver leyendo el archivo. **La 1 y la 5 ya están resueltas** —y las dos
terminaron en lo mismo: lo que se teclea no es un parámetro—. Las tres que quedan van
dirigidas a **Pauli**, que es quien lleva este hotel.

1. **¿Las horas extras entran o no al rol?** ✅ **RESUELTA.** Con los SEIS empleados a la
   vista aparece un patrón que con cuatro no se veía:

   | Empleado         | Fila | Horas         | Valor   | ¿Apagado? | Líquido  | Pagado   | Dif.     |
   | ---------------- | ---- | ------------- | ------- | --------- | -------- | -------- | -------- |
   | MORALES          | 15   | 5,5 al 50 %   | `16,75` | sí (`M`)  | `457,69` | `457,69` | `0`      |
   | VEGA             | 16   | 140 al «15 %» | `0`     | sí (`L`)  | `516,83` | `558,54` | `−41,71` |
   | SANDOVAL COLIMBA | 28   | 26 al 50 %    | `79,41` | sí (`M`)  | `523,37` | `523,37` | `0`      |
   | ACOSTA           | 29   | 13 al 50 %    | `39,51` | sí (`M`)  | `520,99` | `520,99` | `0`      |
   | SANDOVAL ACOSTA  | 35   | ninguna       | `0`     | **no**    | `521,94` | `521,94` | `0`      |
   | SORIA CHALA      | 36   | ninguna       | `0`     | **no**    | `321,94` | `321,94` | `0`      |

   **Los cuatro que tenían horas extras las tienen apagadas; los dos que no tenían
   conservan la fórmula sana.** Seis de seis. En marzo 2026 **ninguna hora extra llegó a
   ningún total**, y `135,67` calculados no se sumaron ni se pagaron. A los tres con horas
   en `G`, `PAGADO` coincide con `LÍQUIDO` al centavo, y las dos hojas que el libro reserva
   para esto —`H.E.` y `REPORTE HORAS EXTRAS`— están vacías.

   La firma lo confirmó: el `*0` es **deliberado**, y la regla detrás es más ancha de lo que
   el archivo deja ver.

   > **Rolando:** «son valores que multiplicamos por cero para que en este mes no vayan
   > valores, pero para el siguiente a veces evitamos o no dependiendo el empleado y
   > dependiendo si hace o no hace horas extras».
   >
   > **Lis:** «el Rol de Pagos en primera instancia se presenta a Gerencia para aprobación;
   > esta aprobación puede ser que se pague la totalidad de horas extras **o solo un
   > porcentaje conforme a la ocupación de ese mes** dentro del hotel — por eso existe esa
   > modificación».

   Y una precisión posterior de la firma, que es la que fijó el modelo definitivo:

   > «Más que un porcentaje predeterminado no sería como tal, dado que en muchas ocasiones eso
   > varía por temas de gerencia y acuerdos entre empleado. […] **Esa variación no es
   > calculada, sino manual.**»

   Tres consecuencias:

   1. Es una decisión **por empleado y por mes**, no un descuido. La entrada se queda, y la
      pantalla tiene que dejar moverla en vez de esconderla.
   2. **No es binaria ni es un porcentaje: es un IMPORTE que se teclea.** El modelo correcto
      es `approvedOvertime: number | null` — `null` es todo lo trabajado, `0` es el `*0` del
      libro, y cualquier otro número es lo que se reconoció. La app no deriva la cifra de
      nada.
   3. Como no se calcula, **no hay parámetro ni valor por defecto de período**. Lo que sí es
      fijo y por Ley vive en §3, separado a propósito.

   El camino hasta aquí es la lección: primero un booleano (que el archivo validaba, porque en
   marzo solo hay 0 % y 100 %), después una fracción (que la firma corrigió), y solo entonces
   el importe. **Ningún dato del archivo habría descartado los dos primeros** — los descartó
   preguntar.

2. **¿La tercera clase de hora extra es 15 % o 25 %?** ⏳ Abierta. El rótulo de la cantidad
   dice 15 %, el del valor dice 25 %, la fórmula usa `0.25` en tres filas y `0.15` en una.
   Además `0.25` es solo el recargo mientras `1.5` y `2` son el total: si `0.25` fuera del
   mismo tipo que los otros dos, debería ser `1.25`. Se aplica moviendo un número
   (`overtimeMultiplier25`), sin tocar ninguna fórmula.
3. **¿De dónde sale el `+41,71` de VEGA?** ⏳ Abierta, y la respuesta a §11.1 la vuelve más
   interesante: si las horas extras pueden pagarse parciales, este podría ser justo ese
   caso. Pero los números no cuadran solos — `41,71` es el **98,9 %** de sus 140 horas al
   15 % (`42,18`), ni el 100 % ni una fracción redonda, y al 25 % sería el 59,3 %. Es la
   única diferencia del mes: los otros cinco cuadran en cero.
4. **¿Qué son `AJ`–`AM`?** ⏳ Abierta. Cuatro columnas de egreso sin rótulo, siempre `0`,
   dentro de `SUM(X:AN)`. Si son descuentos reservados hay que nombrarlas; si son basura hay
   que sacarlas del rango.
5. **¿A qué se aplica el 20 % de la comisión variable?** ✅ **RESUELTA: a nada, dentro de la
   app.** La firma confirmó que «el 20 % de comisión es igual manual» — el porcentaje se
   aplica fuera y a `T` llega el importe ya calculado.

   El archivo lo respaldaba sin poder demostrarlo: no hay ninguna fórmula con `20 %` ni `0.2`
   en las 8 hojas —las únicas coincidencias están en `OTROS`, la hoja muerta de 2010— y las
   columnas `S` (comisión fija) y `T` (comisión variable) están **vacías en los seis
   empleados**, así que marzo 2026 nunca ejercita una comisión.

   **Nada que implementar, y algo que NO implementar**: añadir un cálculo del 20 % crearía una
   segunda definición de «comisión» que puede separarse de la del contador al centavo, que es
   exactamente el riesgo que este motor existe para evitar. Queda anotado en el tipo para que
   nadie lo «arregle» más adelante.

   Es el mismo patrón que §11.1: lo que se teclea no es un parámetro. De los tres números que
   la firma nombró como de Ley, solo dos lo son a efectos del motor —el 9,45 % y el 12,15 %—;
   el tercero es un importe.

   Nota aparte, sin resolver: la lista de la firma no menciona el **8,33 %** del fondo de
   reserva, que también es de Ley y sí está en el libro y en el motor. Probablemente sea una
   omisión de la enumeración y no una discrepancia, pero conviene confirmarlo.

---

## 12. Datos de oro para los tests

Los seis empleados de `MARZO 2026`, tal como el archivo los calcula. El motor tiene que
reproducir estas cifras al centavo, ruido de coma flotante incluido. Están volcados en
`lib/payroll/engine/golden.fixtures.ts` como dato estático, porque el `.xls` vive en
`.context/` y está fuera de git.

Parámetros: `SBU=482`, `personal=9.45 %`, `patronal=12.15 %`, `FR=8.33 %`.
Los seis: `E=30`, `TC="CT"`, `FR="N"`.

|                        | MORALES              | VEGA                 | SANDOVAL COLIMBA    | ACOSTA              | SANDOVAL ACOSTA | SORIA CHALA          |
| ---------------------- | -------------------- | -------------------- | ------------------- | ------------------- | --------------- | -------------------- |
| Fila                   | 15                   | 16                   | 28                  | 29                  | 35              | 36                   |
| `D` sueldo base        | `487.21`             | `482.04`             | `488.66`            | `486.25`            | `487.21`        | `487.21`             |
| `G` horas 50 %         | `5.5`                | `0`                  | `26`                | `13`                | `0`             | `0`                  |
| `I` horas 25 %         | —                    | `140`                | —                   | —                   | —               | —                    |
| `M` apagado            | sí                   | no                   | sí                  | sí                  | no              | no                   |
| `AZ` AC FR             | `S`                  | `N`                  | `N`                 | `N`                 | `N`             | `N`                  |
| `Y` quirografario      | `64.25`              | —                    | —                   | —                   | —               | —                    |
| `AA` anticipo          | —                    | —                    | —                   | —                   | —               | `200`                |
| **`F` unificado**      | `487.21`             | `482.04`             | `488.66`            | `486.25`            | `487.21`        | `487.21`             |
| **`J` valor 50 %**     | `16.75`              | `0`                  | `79.41`             | `39.51`             | `0`             | `0`                  |
| **`L` valor 25 %**     | `0`                  | `0` _(errata)_       | `0`                 | `0`                 | `0`             | `0`                  |
| **`M` total extras**   | `0`                  | `0`                  | `0`                 | `0`                 | `0`             | `0`                  |
| **`N` décimo IV**      | `40.17`              | `40.17`              | `40.17`             | `40.17`             | `40.17`         | `40.17`              |
| **`O` décimo III**     | `40.6`               | `40.17`              | `40.72`             | `40.52`             | `40.6`          | `40.6`               |
| **`U` fondo reserva**  | `0`                  | `0`                  | `0`                 | `0`                 | `0`             | `0`                  |
| **`W` total ingreso**  | `567.98`             | `562.38`             | `569.5500000000001` | `566.9399999999999` | `567.98`        | `567.98`             |
| **`X` IESS personal**  | `46.04`              | `45.55`              | `46.18`             | `45.95`             | `46.04`         | `46.04`              |
| **`AO` total egresos** | `110.28999999999999` | `45.55`              | `46.18`             | `45.95`             | `46.04`         | `246.04`             |
| **`AP` líquido**       | `457.69000000000005` | `516.83`             | `523.3700000000001` | `520.9899999999999` | `521.94`        | `321.94000000000005` |
| **`AU` patronal**      | `59.2`               | `58.57`              | `59.37`             | `59.08`             | `59.2`          | `59.2`               |
| **`AV` vacaciones**    | `21.97`              | `21.76`              | `22.03`             | `21.93`             | `21.97`         | `21.97`              |
| **`AX` provisión**     | `81.17`              | `80.33`              | `81.4`              | `81.00999999999999` | `81.17`         | `81.17`              |
| **`AY` costo total**   | `649.15`             | `642.71`             | `650.95`            | `647.9499999999999` | `649.15`        | `649.15`             |
| `BZ` pagado            | `457.69`             | `558.54`             | `523.37`            | `520.99`            | `521.94`        | `321.94`             |
| **`CA` diferencia**    | `0`                  | `-41.70999999999992` | `0`                 | `0`                 | `0`             | `0`                  |

**Fíjate en `CA`.** El líquido de MORALES es `457.69000000000005` y lo pagado `457.69`: la
resta da `5,7e-14`, pero el archivo guarda `0` exacto. Excel colapsa a cero una resta
despreciable frente a sus operandos. A VEGA no la colapsa —su diferencia es real y conserva
su propio ruido, `-41.70999999999992`—, así que el motor no puede redondear esta columna ni
dejarla cruda: colapsa por debajo del centavo y respeta el resto (§9).

Verificaciones a mano que valen la pena tener escritas (MORALES, fila 15):

- `F` = `ROUND(487.21/30*30, 2)` = `487.21`
- `J` = `ROUND((487.21/30/8)*1.5*5.5, 2)` = `ROUND(16.7477…, 2)` = `16.75`
- `N` = `ROUND(482/360*30, 2)` = `ROUND(40.1666…, 2)` = `40.17`
- `O` = `ROUND(487.21/12, 2)` = `ROUND(40.6008…, 2)` = `40.60`
- `W` = `487.21 + 40.17 + 0 + 40.60` = `567.98` — **sin las horas extras**
- `X` = `ROUND(487.21 × 0.0945, 2)` = `ROUND(46.0413…, 2)` = `46.04`
- `AU` = `ROUND(487.21 × 0.1215, 2)` = `ROUND(59.1960…, 2)` = `59.20`
- `AV` = `ROUND((487.21+40.17)/24, 2)` = `ROUND(21.9741…, 2)` = `21.97`
- `AP` = `567.98 − 110.28999999999999` = `457.69000000000005`

### Estado de la verificación

Las fórmulas canónicas de §4, con los parámetros de §3 y las banderas de §6, están
implementadas en `lib/payroll/engine/` y verificadas contra el archivo: **reproducen las 20
columnas derivadas (`F`, `J`, `K`, `L`, `M`, `N`, `O`, `U`, `W`, `X`, `AO`, `AP`, `AS`,
`AT`, `AU`, `AV`, `AW`, `AX`, `AY`, `CA`) en los seis empleados, exactas al bit** — 120
valores. El ruido de coma flotante (`569.5500000000001`, `457.69000000000005`,
`81.00999999999999`) sale solo de no redondear los totales (§9); no hay ninguna tolerancia
en esas comparaciones.

Los módulos:

| Archivo         | Qué es                                                                   |
| --------------- | ------------------------------------------------------------------------ |
| `round.ts`      | El `ROUND` de Excel: medio hacia afuera del cero, con el ajuste de §9.   |
| `parameters.ts` | Los diez parámetros del período, con sus valores de 2026.                |
| `bases.ts`      | Las seis bases de §2, una función por base, con su `Pick` como firma.    |
| `compute.ts`    | Las derivaciones en el orden de §5, con las banderas de §6 como entrada. |
| `types.ts`      | Entrada, salida y banderas; cada campo nombra su columna.                |

Las banderas que hubo que darle a cada fila son justamente las de §6, y son la prueba de que
son banderas y no fórmulas. No van transcritas a mano: el fixture las DEDUCE del archivo
(`M ≠ J+K+L` ⇒ apagado) y coinciden fila por fila con lo que dicen las fórmulas.

**Lo que sigue SIN verificar contra datos reales**, implementado contra la fórmula y cubierto
solo con casos sintéticos:

- **Las dos ramas del fondo de reserva** (§7): los seis empleados traen `FR="N"`, así que `U`
  y `AW` dan `0` por la única rama que se ejercita.
- **El contrato `TP`**: los seis son `CT`, así que la mitad del décimo cuarto nunca se probó
  contra el libro. Y la rama `TP` es justo donde el archivo tiene su constante rancia (`470`
  en la fila 15 contra `482` en las demás), así que ni el propio archivo se pone de acuerdo.
- **Los días parciales**: los seis traen `E=30`.
- **Las provisiones de décimos encendidas** (`AS`, `AT`): apagadas en los seis.
