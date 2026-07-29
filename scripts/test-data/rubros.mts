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
    name: "Ingresos",
    children: [
      {
        name: "Ingresos de Actividades Ordinarias",
        children: [
          {
            name: "Venta de Hospedaje",
            children: [
              {
                name: "Venta de Hospedaje Tarifa 0%",
                children: [{ name: "Venta de Hospedaje Tarifa 0%", weight: 34 }],
              },
              {
                name: "Venta de Hospedaje Tarifa 15%",
                children: [
                  { name: "Habitaciones Sencillas", weight: 12 },
                  { name: "Habitaciones Dobles", weight: 16 },
                  { name: "Suites", weight: 6 },
                ],
              },
            ],
          },
          {
            name: "Venta de Alimentos y Bebidas",
            children: [
              { name: "Venta de Alimentos Tarifa 0%", weight: 0 },
              {
                name: "Venta de Alimentos y Bebidas Tarifa 15%",
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
        name: "Otros Ingresos",
        children: [
          { name: "Fletes", weight: 0.6 },
          { name: "Multas y Recargos", weight: 0.4 },
          { name: "Comisiones sobre Tours", weight: 1.2 },
        ],
      },
      {
        name: "Ingresos Financieros",
        children: [{ name: "Intereses Ganados", weight: 0.3 }],
      },
    ],
  },
  expense: {
    name: "Costos y Gastos",
    children: [
      {
        name: "Costo de Ventas",
        children: [
          {
            name: "Costo de Alimentos y Bebidas",
            children: [
              { name: "Costo de Alimentos", weight: 7 },
              { name: "Costo de Bebidas", weight: 3 },
            ],
          },
          {
            name: "Costo de Servicios de Hospedaje",
            children: [
              { name: "Lavandería y Lencería", weight: 4 },
              { name: "Amenities de Habitación", weight: 2.5 },
            ],
          },
          { name: "Costo de Tours", weight: 3 },
        ],
      },
      {
        name: "Gastos",
        children: [
          {
            name: "Gastos de Administración",
            children: [
              {
                name: "Gastos de Personal",
                children: [
                  { name: "Sueldos y Salarios", weight: 22 },
                  { name: "Beneficios Sociales", weight: 5 },
                  { name: "Aporte Patronal IESS", weight: 3 },
                ],
              },
              {
                name: "Servicios Básicos",
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
            name: "Gastos de Ventas",
            children: [
              {
                name: "Comisiones",
                children: [
                  { name: "Comisiones Booking", weight: 5 },
                  { name: "Comisiones Expedia", weight: 2 },
                  { name: "Comisiones Tarjetas de Crédito", weight: 1.8 },
                ],
              },
              { name: "Publicidad y Marketing", weight: 2.5 },
              {
                name: "Gastos No Deducibles",
                children: [
                  { name: "Otros Gastos No Deducibles", weight: 1.4 },
                  { name: "Retenciones Asumidas", weight: -0.4 },
                ],
              },
            ],
          },
          {
            name: "Gastos Financieros",
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
    name: "Ingresos Operacionales",
    children: [
      {
        name: "Ventas de Alimentos",
        children: [
          { name: "Platos a la Carta", weight: 30 },
          { name: "Menú Ejecutivo", weight: 22 },
          { name: "Servicio a Domicilio", weight: 14 },
          { name: "Devoluciones y Descuentos en Ventas", weight: -2 },
        ],
      },
      {
        name: "Ventas de Bebidas",
        children: [
          { name: "Bebidas sin Alcohol", weight: 9 },
          { name: "Bebidas con Alcohol", weight: 11 },
          { name: "Café y Postres", weight: 6 },
        ],
      },
      { name: "Ingresos por Eventos", weight: 7 },
      {
        name: "Otros Ingresos",
        children: [
          { name: "Alquiler de Salón", weight: 2 },
          { name: "Intereses Ganados", weight: 0.4 },
        ],
      },
    ],
  },
  expense: {
    name: "Costos y Gastos",
    children: [
      {
        name: "Costo de Ventas",
        children: [
          { name: "Compra de Materia Prima", weight: 26 },
          { name: "Compra de Bebidas", weight: 8 },
          { name: "Descuentos en Compras", weight: -1.2 },
        ],
      },
      {
        name: "Gastos Operacionales",
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
        name: "Gastos Financieros",
        children: [
          { name: "Comisiones de Tarjetas", weight: 2.4 },
          { name: "Intereses de Préstamos", weight: 1.8 },
        ],
      },
      { name: "Depreciaciones", weight: 3 },
    ],
  },
};

/** Clínica: 6 niveles, el plan más profundo y el de mayor volumen de cuentas. */
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
  baseIncome: 145_000,
  season: [1.05, 1.1, 1.15, 1.1, 1.0, 0.95, 0.9, 0.9, 0.95, 1.05, 1.1, 1.0],
  growth: 1.06,
  fixedRatio: 0.52,
  variableRatio: 0.36,
  income: {
    name: "Ingresos",
    children: [
      {
        name: "Ingresos por Servicios de Salud",
        children: [
          {
            name: "Consulta Externa",
            children: [
              {
                name: "Consulta Medicina General",
                children: [
                  {
                    name: "Consulta Presencial",
                    children: [
                      { name: "Consulta Presencial Particular", weight: 11 },
                      { name: "Consulta Presencial Seguros", weight: 8 },
                    ],
                  },
                  { name: "Teleconsulta", weight: 2.5 },
                ],
              },
              {
                name: "Consulta Especializada",
                children: [
                  { name: "Cardiología", weight: 6 },
                  { name: "Pediatría", weight: 5 },
                  { name: "Traumatología", weight: 4.5 },
                ],
              },
            ],
          },
          {
            name: "Hospitalización",
            children: [
              {
                name: "Habitación y Estancia",
                children: [
                  { name: "Habitación Estándar", weight: 9 },
                  { name: "Habitación Privada", weight: 7 },
                ],
              },
              {
                name: "Quirófano",
                children: [
                  { name: "Cirugía Ambulatoria", weight: 8 },
                  { name: "Cirugía Mayor", weight: 13 },
                ],
              },
            ],
          },
          {
            name: "Servicios de Diagnóstico",
            children: [
              {
                name: "Laboratorio Clínico",
                children: [
                  { name: "Exámenes de Rutina", weight: 7 },
                  { name: "Exámenes Especializados", weight: 4 },
                ],
              },
              {
                name: "Imagenología",
                children: [
                  { name: "Radiografía", weight: 3.5 },
                  { name: "Ecografía", weight: 4 },
                  { name: "Tomografía", weight: 5 },
                ],
              },
            ],
          },
          { name: "Descuentos y Devoluciones en Servicios", weight: -2.5 },
        ],
      },
      {
        name: "Otros Ingresos",
        children: [
          { name: "Arriendo de Consultorios", weight: 2 },
          { name: "Intereses Ganados", weight: 0.5 },
        ],
      },
    ],
  },
  expense: {
    name: "Costos y Gastos",
    children: [
      {
        name: "Costo de Servicios de Salud",
        children: [
          {
            name: "Honorarios Médicos",
            children: [
              { name: "Honorarios Medicina General", weight: 9 },
              {
                name: "Honorarios Especialistas",
                children: [
                  {
                    name: "Honorarios Cirugía",
                    children: [
                      { name: "Honorarios Cirujano", weight: 8 },
                      { name: "Honorarios Anestesiólogo", weight: 4 },
                    ],
                  },
                  { name: "Honorarios Consulta Especializada", weight: 7 },
                ],
              },
            ],
          },
          {
            name: "Insumos y Medicamentos",
            children: [
              { name: "Medicamentos", weight: 11 },
              { name: "Material de Curación", weight: 5 },
              { name: "Reactivos de Laboratorio", weight: 4 },
              { name: "Descuentos en Compras de Insumos", weight: -1.5 },
            ],
          },
        ],
      },
      {
        name: "Gastos",
        children: [
          {
            name: "Gastos de Personal Administrativo",
            children: [
              { name: "Sueldos Administrativos", weight: 15 },
              { name: "Beneficios Sociales", weight: 4 },
              { name: "Aporte Patronal", weight: 2.5 },
            ],
          },
          {
            name: "Gastos Generales",
            children: [
              {
                name: "Servicios Básicos",
                children: [
                  { name: "Energía Eléctrica", weight: 3.5 },
                  { name: "Agua Potable", weight: 1.2 },
                  { name: "Oxígeno Medicinal", weight: 2.8 },
                ],
              },
              { name: "Mantenimiento de Equipos Médicos", weight: 3 },
              { name: "Seguros y Pólizas", weight: 2.2 },
              { name: "Gestión de Desechos Hospitalarios", weight: 1.4 },
            ],
          },
          {
            name: "Gastos No Operativos",
            children: [
              { name: "Gastos No Deducibles", weight: 1.2 },
              { name: "Multas y Sanciones", weight: 0 },
            ],
          },
        ],
      },
      {
        name: "Gastos Financieros",
        children: [
          { name: "Intereses de Préstamos", weight: 2.6 },
          { name: "Comisiones Bancarias", weight: 0.9 },
        ],
      },
    ],
  },
};

export const RUBROS: Rubro[] = [HOTELERIA, RESTAURANTE, CLINICA];
