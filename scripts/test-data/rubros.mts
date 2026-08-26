/**
 * Los tres rubros del set de datos de prueba: tres empresas distintas, cada una con su PROPIO
 * plan de cuentas — distinta profundidad (5, 3 y 6 niveles), distintos nombres y distintos
 * centros de costo — todas colgando de las mismas dos raíces que la app entiende, `4` (ingresos)
 * y `5` (costos y gastos).
 *
 * El árbol se declara por ANIDAMIENTO, sin códigos: el generador los numera por posición y luego
 * los formatea según la convención de cada sistema contable (`4.1.1.1` en los formatos propios,
 * `4.1.01.01` en MicroPlus, `4.01.01.02` en Dingoo). Escribir el código a mano aquí sería
 * declararlo tres veces y dejar que las tres versiones se contradigan.
 *
 * `weight` es el peso relativo de una hoja dentro de su raíz — la única cifra que se declara.
 * Un peso NEGATIVO es una cuenta de contrapartida (descuentos sobre ventas, retenciones
 * asumidas); un peso `0` es una cuenta que existe en el plan pero nunca se mueve, que es lo que
 * traen los archivos reales.
 */

export interface AccountSpec {
  name: string;
  /** Solo hojas. Peso relativo dentro de su raíz; negativo = contrapartida, 0 = siempre en cero. */
  weight?: number;
  /**
   * El número que el plan le da a esta cuenta, cuando NO es su posición entre las hermanas — un
   * plan real salta códigos (`5.3` cuelga `5.3.02` y `5.3.03`, sin `5.3.01`, porque esa rama no
   * existe en esta empresa). Una LISTA son varios segmentos de golpe, que es cómo se escribe un
   * nivel que el informe se salta: `4.1.01.01` cuelga directamente de `4.1`.
   */
  segment?: number | number[];
  children?: AccountSpec[];
}

export interface Rubro {
  slug: string;
  company: string;
  /** Dirección y RUC: solo MicroPlus y Dingoo los imprimen en su preámbulo. */
  address: string;
  ruc: string;
  /** Centros de costo del modo «centros», SIN incluir `SIN CENTRO DE COSTO` (lo añade el generador). */
  centers: string[];
  /** Ingreso del mes promedio del primer año, antes de estacionalidad. */
  baseIncome: number;
  /** Multiplicador por mes (enero…diciembre) sobre `baseIncome`. */
  season: number[];
  /** Crecimiento anual compuesto entre los años generados. */
  growth: number;
  /** Gasto fijo mensual como fracción de `baseIncome` — lo que no depende de la venta. */
  fixedRatio: number;
  /** Gasto variable como fracción del ingreso del propio mes. */
  variableRatio: number;
  income: AccountSpec;
  expense: AccountSpec;
}

/**
 * Hotelería: 5 niveles, con una cadena redundante (`4.1.1.1` → `4.1.1.1.1`, un solo hijo con el
 * mismo nombre) y hojas a distinta profundidad — las dos cosas que traen los exports reales.
 */
const HOTELERIA: Rubro = {
  slug: "rubro-a-hoteleria",
  company: "ANDINA HOTELES Y TURISMO S.A.",
  address: "PICHINCHA / QUITO / LA MARISCAL / AV. AMAZONAS Y JORGE WASHINGTON",
  ruc: "1792541963001",
  centers: ["C. C. QUITO", "C. C. GALAPAGOS", "C. C. CUENCA", "C. C. MANTA", "C. C. TOURS"],
  baseIncome: 62_000,
  season: [1.35, 1.3, 1.1, 0.85, 0.75, 0.8, 1.25, 1.3, 0.85, 0.8, 0.9, 1.25],
  growth: 1.08,
  fixedRatio: 0.55,
  variableRatio: 0.38,
  income: {
    name: "INGRESOS",
    children: [
      {
        name: "INGRESOS DE ACTIVIDADES ORDINARIAS",
        children: [
          {
            name: "VENTA DE HOSPEDAJE",
            children: [
              {
                name: "VENTA DE HOSPEDAJE TARIFA 0%",
                children: [{ name: "Venta de Hospedaje Tarifa 0%", weight: 34 }],
              },
              {
                name: "VENTA DE HOSPEDAJE TARIFA 15%",
                children: [
                  { name: "Habitaciones Sencillas", weight: 12 },
                  { name: "Habitaciones Dobles", weight: 16 },
                  { name: "Suites", weight: 6 },
                ],
              },
            ],
          },
          {
            name: "VENTA DE ALIMENTOS Y BEBIDAS",
            children: [
              { name: "Venta de Alimentos Tarifa 0%", weight: 0 },
              {
                name: "VENTA DE ALIMENTOS Y BEBIDAS TARIFA 15%",
                children: [
                  { name: "Venta de Alimentos", weight: 9 },
                  { name: "Venta de Bebidas", weight: 4 },
                  { name: "Venta de Desayunos", weight: 3 },
                ],
              },
            ],
          },
          { name: "Venta de Servicios de Tours", weight: 5 },
          { name: "Rebajas y Descuentos sobre Ventas", weight: -1.5 },
        ],
      },
      {
        name: "OTROS INGRESOS",
        children: [
          { name: "Fletes", weight: 0.6 },
          { name: "Multas y Recargos", weight: 0.4 },
          { name: "Comisiones sobre Tours", weight: 1.2 },
        ],
      },
      {
        name: "INGRESOS FINANCIEROS",
        children: [{ name: "Intereses Ganados", weight: 0.3 }],
      },
    ],
  },
  expense: {
    name: "COSTOS Y GASTOS",
    children: [
      {
        name: "COSTO DE VENTAS",
        children: [
          {
            name: "COSTO DE ALIMENTOS Y BEBIDAS",
            children: [
              { name: "Costo de Alimentos", weight: 7 },
              { name: "Costo de Bebidas", weight: 3 },
            ],
          },
          {
            name: "COSTO DE SERVICIOS DE HOSPEDAJE",
            children: [
              { name: "Lavandería y Lencería", weight: 4 },
              { name: "Amenities de Habitación", weight: 2.5 },
            ],
          },
          { name: "Costo de Tours", weight: 3 },
        ],
      },
      {
        name: "GASTOS",
        children: [
          {
            name: "GASTOS DE ADMINISTRACIÓN",
            children: [
              {
                name: "GASTOS DE PERSONAL",
                children: [
                  { name: "Sueldos y Salarios", weight: 22 },
                  { name: "Beneficios Sociales", weight: 5 },
                  { name: "Aporte Patronal IESS", weight: 3 },
                ],
              },
              {
                name: "SERVICIOS BÁSICOS",
                children: [
                  { name: "Energía Eléctrica", weight: 4 },
                  { name: "Agua Potable", weight: 1.5 },
                  { name: "Internet y Telefonía", weight: 1.2 },
                ],
              },
              { name: "Honorarios Profesionales", weight: 3 },
              { name: "Arriendos", weight: 8 },
            ],
          },
          {
            name: "GASTOS DE VENTAS",
            children: [
              {
                name: "COMISIONES",
                children: [
                  { name: "Comisiones Booking", weight: 5 },
                  { name: "Comisiones Expedia", weight: 2 },
                  { name: "Comisiones Tarjetas de Crédito", weight: 1.8 },
                ],
              },
              { name: "Publicidad y Marketing", weight: 2.5 },
              {
                name: "GASTOS NO DEDUCIBLES",
                children: [
                  { name: "Otros Gastos No Deducibles", weight: 1.4 },
                  { name: "Retenciones Asumidas", weight: -0.4 },
                ],
              },
            ],
          },
          {
            name: "GASTOS FINANCIEROS",
            children: [
              { name: "Intereses Bancarios", weight: 2.2 },
              { name: "Servicios Bancarios", weight: 0.8 },
            ],
          },
          { name: "Gastos de Operaciones Descontinuadas", weight: 0 },
        ],
      },
    ],
  },
};

/** Restaurante: plan PLANO, 3 niveles, muchas hojas en el nivel 2 y 3 — el extremo opuesto. */
const RESTAURANTE: Rubro = {
  slug: "rubro-b-restaurante",
  company: "SABOR COSTEÑO ALIMENTOS CIA. LTDA.",
  address: "GUAYAS / GUAYAQUIL / TARQUI / AV. FRANCISCO DE ORELLANA Y JUSTINO CORNEJO",
  ruc: "0993018472001",
  centers: ["C. C. MATRIZ", "C. C. SUCURSAL NORTE", "C. C. DELIVERY"],
  baseIncome: 28_000,
  season: [0.95, 0.85, 0.95, 1.0, 1.05, 1.0, 1.05, 1.05, 0.95, 1.0, 1.05, 1.3],
  growth: 1.12,
  fixedRatio: 0.57,
  variableRatio: 0.4,
  income: {
    name: "INGRESOS OPERACIONALES",
    children: [
      {
        name: "VENTAS DE ALIMENTOS",
        children: [
          { name: "Platos a la Carta", weight: 30 },
          { name: "Menú Ejecutivo", weight: 22 },
          { name: "Servicio a Domicilio", weight: 14 },
          { name: "Devoluciones y Descuentos en Ventas", weight: -2 },
        ],
      },
      {
        name: "VENTAS DE BEBIDAS",
        children: [
          { name: "Bebidas sin Alcohol", weight: 9 },
          { name: "Bebidas con Alcohol", weight: 11 },
          { name: "Café y Postres", weight: 6 },
        ],
      },
      { name: "Ingresos por Eventos", weight: 7 },
      {
        name: "OTROS INGRESOS",
        children: [
          { name: "Alquiler de Salón", weight: 2 },
          { name: "Intereses Ganados", weight: 0.4 },
        ],
      },
    ],
  },
  expense: {
    name: "COSTOS Y GASTOS",
    children: [
      {
        name: "COSTO DE VENTAS",
        children: [
          { name: "Compra de Materia Prima", weight: 26 },
          { name: "Compra de Bebidas", weight: 8 },
          { name: "Descuentos en Compras", weight: -1.2 },
        ],
      },
      {
        name: "GASTOS OPERACIONALES",
        children: [
          { name: "Sueldos y Beneficios", weight: 24 },
          { name: "Arriendo del Local", weight: 9 },
          { name: "Servicios Básicos", weight: 4 },
          { name: "Gas y Combustibles", weight: 2.5 },
          { name: "Publicidad en Redes", weight: 2 },
          { name: "Mantenimiento de Equipos", weight: 1.5 },
          { name: "Gastos No Deducibles", weight: 1 },
        ],
      },
      {
        name: "GASTOS FINANCIEROS",
        children: [
          { name: "Comisiones de Tarjetas", weight: 2.4 },
          { name: "Intereses de Préstamos", weight: 1.8 },
        ],
      },
      { name: "Depreciaciones", weight: 3 },
    ],
  },
};

/**
 * Clínica: el PLAN REAL DE MICROPLUS, transcrito de un export de la firma — 7 niveles, ~230
 * cuentas y el volumen más alto del set.
 *
 * Es el único rubro cuyo árbol no se inventó, y por dos motivos. Uno, que ningún plan sintético
 * reproduce lo que este trae: códigos SALTADOS (`5.3` cuelga `5.3.02` y `5.3.03`, sin `5.3.01`;
 * `5.3.03` salta del `.12` al `.14`), un nivel que el informe se salta entero (`4.1.01.01` cuelga
 * directamente de `4.1`), cadenas de un solo hijo con el mismo nombre, ramas enteras declaradas y
 * nunca movidas, y cuentas de relleno rotuladas `xxxxx`. Dos, que el predeterminado «Costos y
 * gastos» reparte por los diecisiete rubros que la hoja de este cliente declara
 * (`DECLARED_ANNEX_ROWS`), y sin un archivo con ESTOS códigos esa vista no se puede abrir ni ver.
 *
 * Los NOMBRES y los CÓDIGOS son los del plan; las CIFRAS y la empresa siguen siendo sintéticas —un
 * plan de cuentas es una plantilla del sistema contable, no el dato de un cliente—. Los pesos
 * reparten el gasto con las proporciones del anexo real (27 % honorarios médicos, 15 % medicinas,
 * 14 % nómina administrativa…), así que la lectura que sale se parece a la que la firma revisa.
 *
 * **Las doce ramas en cero son deliberadas**: `5.2.03`, `5.2.04`, `5.2.05`, `5.3.03.02`, `.03`,
 * `.05`, `.08`, `.10`, `.15`, `.16`, `.18` y `.20` existen en el plan y no se mueven, que es
 * exactamente lo que hace que los diecisiete rubros del anexo sumen el gasto entero y su «Otros»
 * salga en cero.
 *
 * Lo único que NO se reproduce es el punto final de tres cuentas SIN hijas (`5.3.03.10.01`,
 * `5.5.01.02.13`, `5.5.01.02.20`, que el archivo marca como padre sin serlo): el generador se
 * compromete a no emitir avisos al cargar, y ese marcador contradictorio produce uno —el que
 * `microplus.fixtures.ts` ya cubre aparte—.
 */
const CLINICA: Rubro = {
  slug: "rubro-c-clinica",
  company: "CENTRO MEDICO SAN RAFAEL S.A.",
  address: "AZUAY / CUENCA / EL BATAN / AV. DE LAS AMERICAS Y REMIGIO CRESPO",
  ruc: "0190385274001",
  centers: [
    "C. C. CONSULTA EXTERNA",
    "C. C. HOSPITALIZACION",
    "C. C. LABORATORIO",
    "C. C. IMAGENOLOGIA",
    "C. C. QUIROFANO",
    "C. C. ADMINISTRACION",
  ],
  baseIncome: 240_000,
  season: [1.05, 1.1, 1.15, 1.1, 1.0, 0.95, 0.9, 0.9, 0.95, 1.05, 1.1, 1.0],
  growth: 1.06,
  // El anexo real mide 77,7 % de gasto sobre ingreso; esta mezcla lo deja en ese entorno.
  fixedRatio: 0.32,
  variableRatio: 0.45,
  income: {
    name: "INGRESOS",
    children: [
      {
        name: "INGRESOS DE ACTIVIDADES ORDINARIAS",
        children: [
          {
            // El informe no imprime el nivel `4.1.01`: esta cuenta cuelga de `4.1` con dos
            // segmentos de golpe, que es lo que `segment` en lista escribe.
            name: "VENTA DE BIENES 0% Y 12%",
            segment: [1, 1],
            children: [
              { name: "Ventas Bienes Tarifa   0%.", weight: 8 },
              { name: "Ventas Bienes Tarifa 12%.", weight: 2 },
            ],
          },
          {
            name: "VENTA DE SERVICIOS TARIFA 0% Y 12%",
            segment: [2, 1],
            children: [
              { name: "Ventas de Servicios Tarifa 0%.", weight: 85 },
              { name: "Ventas de Servicios Tarifa 12%.", weight: 3 },
            ],
          },
          {
            name: "DESCUENTOS - DEVOLUCIONES EN VENTAS",
            segment: [3, 1],
            children: [
              { name: "Devoluciones en Ventas", weight: -0.4 },
              { name: "Rebaja y/o Descuentos en Ventas", weight: -1.2 },
              { name: "Contratos de Construcción", weight: 0 },
              { name: "Subvenciones del Gobierno", weight: 0 },
              { name: "Ingresos por Dividendos", weight: 0 },
              { name: "Otros Ingresos de Actividades Ordinarias", weight: 0.6 },
            ],
          },
          {
            name: "OTROS INGRESOS",
            segment: [4, 1],
            children: [{ name: "Otros Ingresos", weight: 0.8 }],
          },
        ],
      },
      {
        name: "OTROS INGRESOS DE ACTIVIDADES ORDINARIAS",
        children: [
          {
            name: "VENTA DE ACTIVOS FIJOS",
            children: [
              {
                name: "VENTA DE ACTIVOS FIJOS",
                children: [{ name: "Venta de Activos Fijos", weight: 0 }],
              },
            ],
          },
        ],
      },
      {
        name: "OTROS INGRESOS FINANCIEROS",
        children: [
          {
            name: "OTROS INGRESOS FINANCIEROS",
            children: [
              {
                name: "OTROS INGRESOS FINANCIEROS",
                // El plan no declara `4.3.01.01.01`: su única hija es la `.02`.
                children: [{ name: "Intereses Financieros", segment: 2, weight: 0.2 }],
              },
            ],
          },
        ],
      },
    ],
  },
  expense: {
    name: "COSTOS Y GASTOS",
    children: [
      {
        name: "COSTOS DE VENTAS",
        segment: 2,
        children: [
          {
            name: "COSTOS DE VENTAS MEDICINAS E INSUMOS",
            children: [
              {
                // Rubro del anexo.
                name: "COSTOS DE VENTAS MEDICINAS E INSUMOS",
                children: [
                  { name: "Costo de ventas medicamentos 0%", weight: 9.5 },
                  { name: "Costo de ventas insumos medicos 0% y 12%", weight: 5.5 },
                  { name: "xxxxxx", weight: 0 },
                ],
              },
              {
                // Rubro del anexo.
                name: "COSTO ALIMENTACION",
                children: [
                  { name: "Costo Alimentacion, Viveres, Pacientes , Empleados", weight: 0.5 },
                  { name: "Costo Insumos Cafetería Pacientes", weight: 0.2 },
                ],
              },
            ],
          },
          {
            // Rubro del anexo, y de los que tienen NIETOS.
            name: "MANO DE OBRA DIRECTA / FARMACIA/ LABORATORIO/MANO DE OBRA DIRECTA",
            children: [
              {
                name: "SUELDOS Y SALARIOS Y DEMAS REMUNERACIONES / FARMACIA/ LABORATORIO/MANO DE OBRA DIRECTA",
                children: [
                  { name: "Sueldos y Salarios", weight: 1.6 },
                  { name: "Horas Extras", weight: 0.15 },
                  { name: "Comisiones Ventas", weight: 0 },
                  { name: "Bono de Empresa", weight: 0.05 },
                  { name: "Seguro Privado", weight: 0 },
                  { name: "Bono Representacion", weight: 0 },
                ],
              },
              {
                name: "APORTES A LA SEGURIDAD SOCIAL (Incluído Fondo Res / FARMACIA/ LABORATORIO/MANO DE OBRA DIRECTA",
                children: [
                  { name: "Aporte Patronal", weight: 0.22 },
                  { name: "Fondos De Reserva", weight: 0.18 },
                ],
              },
              {
                name: "BENEFICIOS SOCIALES E INDEMNIZACIONES  FARMACIA/ LABORATORIO/MANO DE OBRA DIRECTA",
                children: [
                  { name: "Décimo Tercer Sueldo", weight: 0.15 },
                  { name: "Décimo Cuarto Sueldo", weight: 0.12 },
                  { name: "Vacaciones", weight: 0.08 },
                  { name: "xxxxxxxxxxx", weight: 0 },
                ],
              },
              {
                name: "GASTO PLANES DE BENEFICIOS A EMPLEADOS / FARMACIA/ LABORATORIO/MANO DE OBRA DIRECTA",
                children: [
                  { name: "Refrigerio - Comedor Empleados", weight: 0.35 },
                  { name: "Capacitación", weight: 0.05 },
                  { name: "Uniformes Personal", weight: 0.1 },
                  { name: "Jubilación Patronal", weight: 0.2 },
                  { name: "Desahucio", weight: 0.1 },
                  { name: "Gasto Bono Tiempo de Servicio", weight: 0.05 },
                ],
              },
              {
                name: "XXXXXXXXXXX / FARMACIA/ LABORATORIO/MANO DE OBRA DIRECTA",
                children: [{ name: "xxxxxxxxxxx", weight: 0 }],
              },
            ],
          },
          {
            // Fuera del anexo: existe y no se mueve.
            name: "(-) DESCUENTO EN COMPRAS",
            children: [
              {
                name: "DESCUENTO EN COMPRAS",
                children: [{ name: "Descuento en Compras", weight: 0 }],
              },
            ],
          },
          {
            name: "OTROS GASTOS DIRECTOS",
            children: [
              {
                name: "HONORARIOS MEDICOS-PLANTA",
                children: [
                  { name: "Honorarios Médicos-Planta", weight: 0 },
                  { name: "Honorarios de Imagenología-Planta", weight: 0 },
                  { name: "Honorarios Enfermeria-Planta", weight: 0 },
                  { name: "Honorarios Profesionales Laboratorio-Planta", weight: 0 },
                  { name: "Honorarios Fisioterapia-Planta", weight: 0 },
                  { name: "Honorarios Prof. Farmacia-Bioquímico-Planta", weight: 0 },
                  { name: "Honorarios Profesionales Otros-Planta", weight: 0 },
                ],
              },
            ],
          },
          {
            name: "OTROS GASTOS DIRECTOS",
            children: [
              {
                name: "OTROS GASTOS-PLANTA",
                children: [{ name: "Servicios Prestados-Planta", weight: 0 }],
              },
            ],
          },
        ],
      },
      {
        name: "COSTOS INDIRECTOS",
        segment: 3,
        children: [
          {
            // Rubro del anexo, y el más hondo: sus cuentas están tres niveles por debajo.
            name: "MANO DE OBRA INDIRECTA /ADMISIONES / CAJA / INFORMACION/MANO DE OBRA INDIRECTA",
            segment: 2,
            children: [
              {
                name: "MANO DE OBRA INDIRECTA /ADMISIONES / CAJA / INFORMACION/MANO DE OBRA INDIRECTA",
                children: [
                  {
                    name: "SUELDOS, SALARIOS Y DEMAS REMUNERACIONES / ADMISIONES / CAJA / INFORMACION/MANO DE OBRA INDIRECTA",
                    children: [
                      { name: "Sueldos y Salarios", weight: 1.7 },
                      { name: "Horas Extras", weight: 0.15 },
                      { name: "Comisiones Ventas", weight: 0 },
                      { name: "Bono Empresa", weight: 0.05 },
                      { name: "Seguro Privado", weight: 0 },
                      { name: "Bono Movilización", weight: 0 },
                    ],
                  },
                  {
                    name: "APORTES A LA SEGURIDAD SOCIAL (Incluído Fondo Res / ADMISIONES / CAJA / INFORMACION/MANO DE OBRA INDIRECTA",
                    children: [
                      { name: "Aporte Patronal", weight: 0.24 },
                      { name: "Fondos De Reserva", weight: 0.16 },
                    ],
                  },
                  {
                    name: "BENEFICIOS SOCIALES E INDEMNIZACIONES / ADMISIONES / CAJA / INFORMACION/MANO DE OBRA INDIRECTA",
                    children: [
                      { name: "Décimo Tercer Sueldo", weight: 0.18 },
                      { name: "Décimo Cuarto Sueldo", weight: 0.14 },
                      { name: "Vacaciones", weight: 0.1 },
                      { name: "xxxxxxxxxxxx", weight: 0 },
                    ],
                  },
                  {
                    name: "GASTO POR BENEFICIOS A EMPLEADOS /ADMISIONES / CAJA / INFORMACION/MANO DE OBRA INDIRECTA",
                    children: [
                      { name: "Refrigerio - Comedor Empleados", weight: 0.5 },
                      { name: "Capacitación", weight: 0.06 },
                      { name: "Uniformes Personal", weight: 0.12 },
                      { name: "Jubilación Patronal", weight: 0.2 },
                      { name: "Desahucio", weight: 0.05 },
                      { name: "Gasto Bono Tiempo de Servicio", weight: 0.05 },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: "OTROS GASTOS INDIRECTOS",
            segment: 3,
            children: [
              {
                // Rubro del anexo: el 27 % del gasto.
                name: "HONORARIOS MEDICOS",
                children: [
                  { name: "Honorarios Medicos-Externos", weight: 14 },
                  { name: "Honorarios de Imagenologia-Externos", weight: 3.5 },
                  { name: "Honorarios Enfermeria-Externos", weight: 3.2 },
                  { name: "Honorarios Profesionales Laboratorio-Externos", weight: 2.6 },
                  { name: "Honorarios Fisioterapia-Externos", weight: 1.3 },
                  { name: "Honorarios Prof. Farmacia-Bioquímico-Externos", weight: 1.4 },
                  { name: "Honorarios Profesionales Otros-Externos", weight: 1.4 },
                ],
              },
              {
                name: "REMUNERACIONES A OTROS TRABAJADORES AUTONOMOS",
                children: [
                  { name: "Trabajos Ocasionales", weight: 0 },
                  { name: "Honorarios a Extranjeros  por Servicios Ocasionale", weight: 0 },
                ],
              },
              {
                name: "SEGURIDAD Y SALUD OCUPACIONAL",
                children: [
                  { name: "Dotación de Equipos de Seguridad y Salud Ocupacio", weight: 0 },
                  { name: "Servicios Médicos", weight: 0 },
                ],
              },
              {
                // Rubro del anexo. El plan salta el `.06`.
                name: "MANTENIMIENTO Y REPARACIONES",
                children: [
                  { name: "Mantenimiento y Reparaciones de Edificio e Instala", weight: 1.1 },
                  { name: "Mantenimiento y Reparaciones Máquinaria y Equipos", weight: 0.6 },
                  { name: "Mantenimiento y Reparaciones Equipos Medicos", weight: 0.9 },
                  { name: "Mantenimiento y Reparaciones de Equipos de Computa", weight: 0.35 },
                  { name: "Mantenimiento y Reparaciones de Programas y Softwa", weight: 0.25 },
                  { name: "Mantenimiento y Reparaciones de Vehículo", segment: 7, weight: 0.3 },
                  {
                    name: "Mantenimiento y Reparaciones de Repuestos y Herram",
                    segment: 8,
                    weight: 0.15,
                  },
                  {
                    name: "Mantenimiento y Reparaciones de Sistema Contra Inc",
                    segment: 9,
                    weight: 0.15,
                  },
                  {
                    name: "Mantenimiento y Reparacion Muebles y Enseres",
                    segment: 10,
                    weight: 0.1,
                  },
                ],
              },
              {
                name: "COMISIONES A TERCEROS",
                children: [{ name: "Comisiones a terceros", weight: 0 }],
              },
              {
                // Rubro del anexo.
                name: "PROMOCION Y PUBLICIDAD",
                children: [
                  { name: "Promoción y Publicidad", weight: 1.5 },
                  { name: "Prensa", weight: 0.4 },
                  { name: "Radio", weight: 0.35 },
                  { name: "Imprenta", weight: 0.45 },
                  { name: "Manejo de redes", weight: 0.6 },
                  { name: "Hon. Prof. Plataforma Digital", weight: 0.4 },
                  { name: "No deducible Redes", weight: 0.1 },
                ],
              },
              {
                // Rubro del anexo.
                name: "COMBUSTIBLES",
                children: [
                  { name: "Combustibles - Gasolina- Diesel", weight: 0.08 },
                  { name: "Gas Domestico e Industrial", weight: 0.03 },
                ],
              },
              {
                name: "LUBRICANTES",
                children: [{ name: "Lubricantes", weight: 0 }],
              },
              {
                // Rubro del anexo.
                name: "SEGUROS Y REASEGUROS (Primas y Cesiones)",
                children: [
                  { name: "Seguros Contratados Instalaciones", weight: 0.4 },
                  { name: "Seguros Vehiculo-Ambulancia", weight: 0.25 },
                  { name: "Seguro de Responsabilidad Civil", weight: 0.3 },
                  { name: "Seguros Medicina Prepagada-Nómina", weight: 0.25 },
                  { name: "Seguros Medicina Prepagada", weight: 0.2 },
                ],
              },
              {
                name: "TRANSPORTE DE CARGA",
                children: [{ name: "GASTOS DE GESTION", weight: 0 }],
              },
              {
                // Rubro del anexo. El plan salta del `.10` al `.12`, y dentro cuelga solo la `.02`.
                name: "GASTOS DE VIAJE NACIONALES",
                segment: 12,
                children: [
                  {
                    name: "GASTOS DE VIAJE NACIONALES",
                    segment: 2,
                    children: [
                      { name: "Pasajes Aereos Nacionales", weight: 0.008 },
                      { name: "Movilización Interna en Viajes Nacionales", weight: 0.003 },
                      { name: "Alquiler Vehículo en Viajes Nacionales", weight: 0.002 },
                      { name: "Alimentación en Viajes Nacionales", weight: 0.003 },
                      { name: "Propinas en Viajes Nacionales", weight: 0.001 },
                      { name: "Atenciones Sociales en Viajes Nacionales", weight: 0.001 },
                      { name: "Taxi en Viajes Nacionales", weight: 0.001 },
                      { name: "Peajes y Parqueos en Viajes Nacionales", weight: 0.001 },
                    ],
                  },
                ],
              },
              {
                // Rubro del anexo, y el caso que obliga a forzar el rótulo: la hoja lo llama
                // «SERVICIOS BASICOS» y el plan «AGUA, ENERGIA, LUZ Y TELECOMUNICACIONES».
                name: "AGUA, ENERGIA, LUZ Y TELECOMUNICACIONES",
                segment: 14,
                children: [
                  { name: "Luz", weight: 0.6 },
                  { name: "Agua", weight: 0.2 },
                  { name: "Teléfono Convencional", weight: 0.12 },
                  { name: "Telefonía Celular", weight: 0.15 },
                  { name: "Internet", weight: 0.25 },
                  { name: "Datafast", weight: 0.1 },
                  { name: "Tv pagada - Directv", weight: 0.05 },
                  { name: "Tasa por Recolección de Basura", weight: 0.13 },
                ],
              },
              {
                name: "ARRENDAMIENTO OPERATIVO",
                segment: 15,
                children: [{ name: "Arriendo de Inmuebles", weight: 0 }],
              },
              {
                name: "SEGURIDAD",
                segment: 16,
                children: [
                  { name: "Monitoreo Alarma", weight: 0 },
                  { name: "Seguridad Privada", weight: 0 },
                ],
              },
              {
                // Rubro del anexo: veintiséis cuentas.
                name: "OTROS GASTOS",
                segment: 17,
                children: [
                  { name: "Suministros de Oficina", weight: 0.25 },
                  { name: "Fotocopias", weight: 0.05 },
                  { name: "Seguros", weight: 0.1 },
                  { name: "Fletes y embalajes", weight: 0.08 },
                  { name: "Otros Gastos", weight: 0.4 },
                  { name: "Servicios Prestados-Externos", weight: 0.6 },
                  { name: "Desalojos", weight: 0.03 },
                  { name: "Suministros de Aseo y Limpieza", weight: 0.35 },
                  { name: "Impuesto Aduana", weight: 0.05 },
                  { name: "Suministros Materiales", weight: 0.3 },
                  { name: "Alquiler de Equipos", weight: 0.2 },
                  { name: "Trabajo De Imprenta (Elaboración De  Comprobantes", weight: 0.07 },
                  { name: "Suministros De Computación (Cartuchos De Tinta, C", weight: 0.12 },
                  { name: "Matriculas  De Vehículos Ventas Y Administración", weight: 0.04 },
                  { name: "Suministro De Clinica", weight: 0.6 },
                  { name: "Oxigeno", weight: 0.55 },
                  { name: "Examen De Laboratorio", weight: 0.6 },
                  { name: "Servicios Para Clinica", weight: 0.5 },
                  { name: "Osteosintesis", weight: 0.6 },
                  { name: "Lavado De Ropa", weight: 0.35 },
                  { name: "Pintas De Sangre / Plasma", weight: 0.25 },
                  { name: "Suministros y Utensillos De Cocina", weight: 0.12 },
                  { name: "Servicio de Imagenología", weight: 0.5 },
                  { name: "Servicio de recolección de desechos peligrosos", weight: 0.15 },
                  { name: "Instrumental/Procedimientos-Quirúrgicos ", weight: 0.3 },
                  { name: "Suministros/Mantenimiento Dermatología", weight: 0.04 },
                ],
              },
              {
                name: "GASTOS 15% UTILIDADES",
                segment: 18,
                children: [{ name: "Gasto 15% Utilidades", weight: 0 }],
              },
              {
                // Rubro del anexo.
                name: "DEPRECIACIONES",
                segment: 19,
                children: [
                  { name: "Gasto Dep. Edificios", weight: 2.2 },
                  { name: "Gasto Dep. Muebles y Enseres", weight: 0.5 },
                  { name: "Gasto Dep. Vehículos, Equipo de Transporte", weight: 0.7 },
                  { name: "Gasto Dep. Maquinaria y Equipos", weight: 0.9 },
                  { name: "Gasto Dep. Sistema Contra Incendios", weight: 0.15 },
                  { name: "Gasto Dep. Equipos Medicos", weight: 2.0 },
                  { name: "Gasto Dep. Equipo de Oficina", weight: 0.25 },
                  { name: "Gasto Dep. Equipo de Computación", weight: 0.5 },
                  { name: "Gasto Dep. Equipo de Programas y Software", weight: 0.2 },
                  { name: "Gasto Dep. Repuestos y Herramientas", weight: 0.1 },
                ],
              },
              {
                name: "GASTO DETERIORO",
                segment: 20,
                children: [{ name: "Propiedades, Planta y Equipo", weight: 0 }],
              },
            ],
          },
        ],
      },
      {
        name: "GASTOS",
        segment: 5,
        children: [
          {
            name: "GASTOS ADMINISTRATIVOS",
            children: [
              {
                // Rubro del anexo, con nietos: el 14 % del gasto.
                name: "GASTOS NOMINA /ADMINISTRACION",
                children: [
                  {
                    name: "SUELDOS, SALARIOS Y DEMAS REMUNERACIONES / ADMINISTRACION",
                    children: [
                      { name: "Sueldos y Salarios", weight: 7.0 },
                      { name: "Horas Extras", weight: 0.5 },
                      { name: "Comisiones Ventas", weight: 0.1 },
                      { name: "Bono Empresa", weight: 0.3 },
                      { name: "Seguro Privado", weight: 0.15 },
                      { name: "Bono Movilización", weight: 0.2 },
                    ],
                  },
                  {
                    name: "APORTES A LA SEGURIDAD SOCIAL (Incluído Fondo Res / ADMINISTRACION",
                    children: [
                      { name: "Aporte Patronal", weight: 1.0 },
                      { name: "Fondos De Reserva", weight: 0.75 },
                    ],
                  },
                  {
                    name: "BENEFICIOS SOCIALES E INDEMNIZACIONES / ADMINISTRACION",
                    children: [
                      { name: "Décimo Tercer Sueldo", weight: 0.7 },
                      { name: "Décimo Cuarto Sueldo", weight: 0.5 },
                      { name: "Vacaciones", weight: 0.4 },
                      { name: "xxxxxxxxxxxxxxxxxxxx", weight: 0 },
                    ],
                  },
                  {
                    name: "GASTO PLANES DE BENEFICIOS A EMPLEADOS /ADMINISTRACION",
                    children: [
                      { name: "Refrigerio-Comedor Empleados", weight: 0.9 },
                      { name: "Capacitación", weight: 0.2 },
                      { name: "Uniformes Personal", weight: 0.25 },
                      { name: "Jubilación Patronal", weight: 0.4 },
                      { name: "Desahucio", weight: 0.15 },
                      { name: "Gasto Bono Tiempo de Servicio", weight: 0.1 },
                    ],
                  },
                ],
              },
              {
                // Rubro del anexo: veintisiete secciones, la rama más ancha del plan.
                name: "OTROS GASTOS OPERACIONALES",
                children: [
                  {
                    name: "HONORARIOS, COMISIONES Y DIETAS",
                    children: [
                      { name: "Honorarios Asesoria Contable", weight: 0.6 },
                      { name: "Honorarios Asesoria Legal", weight: 0.35 },
                      { name: "Honorarios Profesionales", weight: 0.4 },
                      { name: "Honorarios Médicos", weight: 0.25 },
                    ],
                  },
                  {
                    name: "REMUNERACIONES A OTROS TRABAJADORES AUTONOMOS",
                    children: [{ name: "Trabajos Ocasionales", weight: 0.15 }],
                  },
                  {
                    name: "SEGURIDAD Y SALUD OCUPACIONAL",
                    children: [
                      { name: "Dotación de Equipos de Seguridad y Salud Ocupacio", weight: 0.1 },
                      { name: "Servicios Médicos", weight: 0.1 },
                    ],
                  },
                  {
                    name: "MANTENIMIENTO Y REPARACIONES",
                    children: [
                      { name: "Mantenimiento Edificio", weight: 0.2 },
                      { name: "Mantenimiento y Reparacion de Vehiculos", weight: 0.15 },
                      { name: "Mantenimiento y Reparacion Maquinaria y equipos ", weight: 0.12 },
                      { name: "Mantenimiento y Reparacion Muebles y enseres", weight: 0.06 },
                      { name: "Mantenimiento y Reparacion Equipo de Computo", weight: 0.12 },
                    ],
                  },
                  {
                    name: "COMISIONES A TERCEROS",
                    children: [{ name: "xxxxx", weight: 0 }],
                  },
                  {
                    name: "PROMOCION Y PUBLICIDAD",
                    children: [{ name: "xxxxx", weight: 0 }],
                  },
                  {
                    name: "COMBUSTIBLES",
                    children: [{ name: "Combustibles", weight: 0.12 }],
                  },
                  {
                    name: "LUBRICANTES",
                    children: [{ name: "Lubricantes", weight: 0.03 }],
                  },
                  {
                    name: "SEGUROS Y REASEGUROS (Primas y Cesiones)",
                    children: [
                      { name: "Seguros Vehiculo", weight: 0.1 },
                      { name: "Seguros Salud", weight: 0.2 },
                      { name: "Seguro Permiso Ambiental", weight: 0.05 },
                    ],
                  },
                  {
                    name: "TRANSPORTE",
                    children: [
                      { name: "Transporte y Movilización", weight: 0.18 },
                      { name: "Peajes y Parqueos", weight: 0.04 },
                    ],
                  },
                  {
                    name: "GASTOS DE GESTION (Agasajos a socios, trabajadores",
                    children: [
                      { name: "Atenciones y agasajo a empleados", weight: 0.2 },
                      { name: "Atenciones a Clientes", weight: 0.08 },
                      { name: "Atenciones a Socios", weight: 0.05 },
                    ],
                  },
                  {
                    name: "GASTOS DE VIAJE NACIONALES",
                    children: [
                      { name: "Pasajes Aereos Nacionales", weight: 0.01 },
                      { name: "Movilización Interna en Viajes Nacionales", weight: 0.005 },
                      { name: "Alquiler Vehículo en Viajes Nacionales", weight: 0.003 },
                      { name: "Hospedaje en Viajes Nacionales", weight: 0.004 },
                      { name: "Alimentación en Viajes Nacionales", weight: 0.003 },
                      { name: "Propinas en Viajes Nacionales", weight: 0.002 },
                      { name: "Atenciones Sociales en Viajes Nacionales", weight: 0.001 },
                      { name: "Taxis en Viajes Nacionales", weight: 0.001 },
                      { name: "Peajes y Parqueos en Viajes Nacionales", weight: 0.001 },
                    ],
                  },
                  { name: "GASTOS DE VIAJE INTERNACIONALES", weight: 0 },
                  {
                    name: "AGUA, ENERGIA, LUZ Y TELECOMUNICACIONES",
                    children: [
                      { name: "Agua potable", weight: 0.06 },
                      { name: "Luz", weight: 0.15 },
                      { name: "Telefono Convencional", weight: 0.05 },
                      { name: "Internet", weight: 0.1 },
                      { name: "Tv Pagada - Directv", weight: 0.02 },
                    ],
                  },
                  {
                    name: "NOTARIOS Y REGISTRADORES DE LA PROPIEDAD O MERCANT",
                    children: [
                      { name: "Notarios y Registradores", weight: 0.08 },
                      { name: "Gastos Legales", weight: 0.1 },
                    ],
                  },
                  {
                    name: "IMPUESTOS, CONTRIBUCIONES Y OTROS",
                    children: [
                      { name: "1.5% Sobre Activos", weight: 0.3 },
                      { name: "Contribución Superintendencia de Compañías", weight: 0.12 },
                      { name: "Afiliaciones y cuotas", weight: 0.06 },
                      { name: "Impuestos Municipio( patentes, prediales, permisos", weight: 0.25 },
                      { name: "Permiso Funcionamiento-Bomberos-Ministerios", weight: 0.08 },
                      { name: "Contribución 1x1000", weight: 0.05 },
                      { name: "Contribucion a terceros (tasa basura y bomberos)", weight: 0.06 },
                      { name: "Recoleccion de basura y desechos", weight: 0.1 },
                      { name: "Donanciones y Contribuciones", weight: 0.04 },
                    ],
                  },
                  {
                    name: "ARRENDAMIENTO OPERATIVO",
                    children: [
                      { name: "Arriendo de Inmuebles", weight: 0.9 },
                      { name: "Alquiler de Equipos", weight: 0.15 },
                      { name: "Expensas Comunales", weight: 0.05 },
                    ],
                  },
                  {
                    name: "SEGURIDAD",
                    children: [{ name: "Monitoreo", weight: 0.12 }],
                  },
                  { name: "XX", segment: 20, weight: 0 },
                  {
                    // El plan salta el `.21`, y esta cuelga otro nivel antes de sus cuentas.
                    name: "OTROS GASTOS",
                    segment: 22,
                    children: [
                      {
                        name: "OTROS GASTOS",
                        children: [
                          { name: "Suministros de Oficina", weight: 0.12 },
                          { name: "Fotocopias", weight: 0.02 },
                          { name: "Materiales y Utiles de Limpieza", weight: 0.1 },
                          { name: "Suscripciones (Revistas-Periódicos)", weight: 0.01 },
                          { name: "Anuncios y publicaciones prensa", weight: 0.02 },
                          { name: "Botiquin - Medicinas", weight: 0.03 },
                          { name: "Fletes y embalajes", weight: 0.02 },
                          { name: "Otros Gastos", weight: 0.08 },
                          { name: "Varios", weight: 0.04 },
                          { name: "Servicios prestados", weight: 0.1 },
                          { name: "Impuesto Aduana", weight: 0.01 },
                          { name: "Suministros y Materiales", weight: 0.08 },
                          {
                            name: "Suministros Materiales para Laboratorio-Producció",
                            weight: 0.06,
                          },
                          { name: "Alimentacion, Viveres", weight: 0.09 },
                          { name: "Servicio de Lavandería", weight: 0.12 },
                          { name: "Suministros de Aseo y Limpieza", weight: 0.09 },
                        ],
                      },
                    ],
                  },
                  {
                    name: "XXXXXXXXXXXXX",
                    segment: 23,
                    children: [{ name: "xxxxxxxxxxx", weight: 0 }],
                  },
                  {
                    name: "DEPRECIACIONES",
                    segment: 24,
                    children: [{ name: "xxxxxx", weight: 0 }],
                  },
                  {
                    name: "GASTO DETERIORO",
                    segment: 25,
                    children: [
                      { name: "Gasto Provision Cuentas Incobrables", weight: 0.3 },
                      { name: "Inventarios", weight: 0.05 },
                      { name: "Propiedades, Planta y Equipo", weight: 0.05 },
                    ],
                  },
                  {
                    name: "IVA QUE SE CARGA AL GASTO",
                    segment: 26,
                    children: [{ name: "Iva que se carga al gasto", weight: 0.35 }],
                  },
                  {
                    name: "GASTO IMPUESTO A LA RENTA (ACTIVOS Y PASIVOS DIFER",
                    segment: 27,
                    children: [{ name: "Gasto Impuesto a la Renta Corriente", weight: 0.3 }],
                  },
                ],
              },
            ],
          },
          {
            name: "GASTOS NO OPERACIONALES",
            children: [
              {
                // Rubro del anexo.
                name: "GASTOS FINANCIEROS",
                children: [
                  {
                    name: "INTERESES FINANCIEROS",
                    children: [
                      { name: "Intereses Entidades Financieras", weight: 1.4 },
                      { name: "Seguro Desgravamen Prestamos Bancarios", weight: 0.15 },
                    ],
                  },
                  {
                    name: "COSTOS BANCARIOS",
                    children: [
                      { name: "Comisiones Bancarias", weight: 0.12 },
                      { name: "Gastos Bancarios", weight: 0.1 },
                      { name: "Gastos Comisiones T/C", weight: 0.15 },
                      { name: "Contribución SOLCA", weight: 0.03 },
                      { name: "Gastos Comisiones xxxxx", weight: 0 },
                      { name: "Comision por consumo T/C", weight: 0.05 },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: "OTROS GASTOS NO OPERACIONALES",
            children: [
              {
                // Rubro del anexo, el más pequeño.
                name: "GASTOS NO DEDUCIBLES",
                children: [
                  { name: "Intereses y Multas (SRI-IESS-ATS-ATM)", weight: 0.02 },
                  { name: "Gastos no Deducibles Retenciones Asumidas", weight: 0.015 },
                  { name: "Gastos no Seguro Salud IESS", weight: 0.01 },
                  { name: "Gastos no Deducibles Comisiones y mas", weight: 0.005 },
                  { name: "Gastos no Deducibles Taxis, Bus", weight: 0.005 },
                  { name: "Gastos no Deducibles Varios", weight: 0.01 },
                  { name: "Gasto no deducible Redes sociales", weight: 0.003 },
                  { name: "Gasto no Deducible Alimentacion - Viveres", weight: 0.002 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

export const RUBROS: Rubro[] = [HOTELERIA, RESTAURANTE, CLINICA];
