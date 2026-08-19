import { describe, expect, it } from "vitest";
import {
  employeeFormFrom,
  emptyEmployeeForm,
  toEmployeeLine,
  toEmployeePatch,
  validateEmployeeForm,
  type EmployeeFormValues,
} from "./employee-form";
import type { PayrollEmployeeLine } from "./types";

function form(overrides: Partial<EmployeeFormValues> = {}): EmployeeFormValues {
  return {
    ...emptyEmployeeForm(),
    name: "MORALES MENA SILVIA JIMENA",
    idCard: "1002030405",
    role: "Camarera",
    ...overrides,
  };
}

/** Una ficha guardada, la de MORALES tal como el rol real de marzo 2026 la trae. */
function storedLine(overrides: Partial<PayrollEmployeeLine> = {}): PayrollEmployeeLine {
  return {
    id: "e1",
    periodId: "p1",
    name: "MORALES MENA SILVIA JIMENA",
    role: "CAMARERA DE PISOS",
    area: "HOSPEDAJE",
    baseSalary: 487.21,
    contractType: "CT",
    idCard: "1002030405",
    hireDate: "2025-10-01",
    sectorCode: "1608551004134",
    hasReserveFund: false,
    accumulatesReserveFund: false,
    provisionsThirteenth: false,
    provisionsFourteenth: false,
    days: 30,
    ...overrides,
  };
}

describe("emptyEmployeeForm", () => {
  it("nace con los defaults del rol: 30 días y el SBU vigente", () => {
    const values = emptyEmployeeForm();
    expect(values.days).toBe(30);
    expect(values.baseSalary).toBe(482);
  });

  it("nace a tiempo completo, sin fondo de reserva y sin provisiones", () => {
    const values = emptyEmployeeForm();
    expect(values.contractType).toBe("CT");
    expect(values.reserveFund).toBe("sin-derecho");
    expect(values.provisionsThirteenth).toBe(false);
    expect(values.provisionsFourteenth).toBe(false);
  });

  it("devuelve un objeto nuevo en cada llamada", () => {
    expect(emptyEmployeeForm()).not.toBe(emptyEmployeeForm());
  });
});

describe("validateEmployeeForm · un formulario correcto", () => {
  it("no señala ningún campo", () => {
    expect(validateEmployeeForm(form())).toEqual({});
  });

  it("acepta una ficha sin fecha de ingreso ni código sectorial", () => {
    expect(validateEmployeeForm(form({ hireDate: "", sectorCode: "" }))).toEqual({});
  });
});

describe("validateEmployeeForm · la ficha", () => {
  it("exige el nombre", () => {
    expect(validateEmployeeForm(form({ name: "" })).name).toBeTruthy();
  });

  it("un nombre de solo espacios está vacío", () => {
    expect(validateEmployeeForm(form({ name: "   " })).name).toBeTruthy();
  });

  it("exige el cargo", () => {
    expect(validateEmployeeForm(form({ role: "  " })).role).toBeTruthy();
  });

  it("exige la cédula", () => {
    expect(validateEmployeeForm(form({ idCard: "" })).idCard).toBeTruthy();
  });

  it("la cédula son diez dígitos: ni nueve, ni once, ni letras", () => {
    expect(validateEmployeeForm(form({ idCard: "100203040" })).idCard).toBeTruthy();
    expect(validateEmployeeForm(form({ idCard: "10020304050" })).idCard).toBeTruthy();
    expect(validateEmployeeForm(form({ idCard: "10020304OS" })).idCard).toBeTruthy();
    expect(validateEmployeeForm(form({ idCard: "1002030405" })).idCard).toBeUndefined();
  });

  it("una cédula con espacios alrededor sigue siendo válida", () => {
    expect(validateEmployeeForm(form({ idCard: " 1002030405 " })).idCard).toBeUndefined();
  });

  // Registrar dos veces a la misma persona duplica su sueldo en los totales del período sin que
  // nada en pantalla lo delate: dos filas con nombres tecleados distinto se leen como dos personas.
  it("rechaza una cédula que el período ya tiene, nombrando a quien la tiene", () => {
    const error = validateEmployeeForm(form({ idCard: "1002030405" }), {
      existing: [{ name: "MORALES MENA SILVIA JIMENA", idCard: "1002030405" }],
    }).idCard;
    expect(error).toContain("MORALES MENA SILVIA JIMENA");
  });

  it("otra cédula del mismo período no estorba", () => {
    expect(
      validateEmployeeForm(form({ idCard: "1002030405" }), {
        existing: [{ name: "VEGA GARCIA MARIANA DE JESUS", idCard: "0908070605" }],
      }),
    ).toEqual({});
  });
});

describe("validateEmployeeForm · el sueldo base", () => {
  it("es obligatorio", () => {
    expect(validateEmployeeForm(form({ baseSalary: null })).baseSalary).toBeTruthy();
  });

  // Con sueldo base en cero todo el rol del empleado cae a cero —unificado, décimo tercero, aporte
  // al IESS— y la fila queda en la nómina sumando nada. Es un error de captura, no un caso.
  it("no admite cero ni negativos", () => {
    expect(validateEmployeeForm(form({ baseSalary: 0 })).baseSalary).toBeTruthy();
    expect(validateEmployeeForm(form({ baseSalary: -487.21 })).baseSalary).toBeTruthy();
  });

  it("admite un sueldo por debajo del SBU: un contrato parcial lo tiene", () => {
    expect(validateEmployeeForm(form({ baseSalary: 241, contractType: "TP" }))).toEqual({});
  });
});

describe("validateEmployeeForm · los días trabajados", () => {
  it("son obligatorios", () => {
    expect(validateEmployeeForm(form({ days: null })).days).toBeTruthy();
  });

  it("van de 0 a 31", () => {
    expect(validateEmployeeForm(form({ days: -1 })).days).toBeTruthy();
    expect(validateEmployeeForm(form({ days: 32 })).days).toBeTruthy();
    expect(validateEmployeeForm(form({ days: 0 })).days).toBeUndefined();
    expect(validateEmployeeForm(form({ days: 31 })).days).toBeUndefined();
  });

  it("son un número entero de días", () => {
    expect(validateEmployeeForm(form({ days: 15.5 })).days).toBeTruthy();
  });
});

describe("validateEmployeeForm · la fecha de ingreso", () => {
  it("es opcional", () => {
    expect(validateEmployeeForm(form({ hireDate: "" })).hireDate).toBeUndefined();
  });

  it("acepta una fecha real", () => {
    expect(validateEmployeeForm(form({ hireDate: "2024-03-01" })).hireDate).toBeUndefined();
  });

  it("rechaza un día que ese mes no tiene", () => {
    expect(validateEmployeeForm(form({ hireDate: "2026-02-30" })).hireDate).toBeTruthy();
  });

  it("rechaza lo que no es una fecha", () => {
    expect(validateEmployeeForm(form({ hireDate: "01/03/2024" })).hireDate).toBeTruthy();
  });
});

describe("validateEmployeeForm · varios errores a la vez", () => {
  // La pantalla tiene que poder señalar CADA campo que falla, no rendirse en el primero.
  it("señala todos los campos que fallan", () => {
    const errors = validateEmployeeForm(form({ name: "", idCard: "abc", baseSalary: 0, days: 99 }));
    expect(Object.keys(errors).sort()).toEqual(["baseSalary", "days", "idCard", "name"]);
  });
});

describe("toEmployeeLine", () => {
  it("traslada la ficha campo por campo, sin espacios de sobra", () => {
    const line = toEmployeeLine(
      form({
        name: "  MORALES MENA SILVIA JIMENA  ",
        idCard: " 1002030405 ",
        role: " Camarera ",
        area: "HOSPEDAJE",
        sectorCode: " C1 20 05 ",
        baseSalary: 487.21,
        days: 30,
        contractType: "TP",
        hireDate: "2024-03-01",
      }),
    );
    expect(line).toMatchObject({
      name: "MORALES MENA SILVIA JIMENA",
      idCard: "1002030405",
      role: "Camarera",
      area: "HOSPEDAJE",
      sectorCode: "C1 20 05",
      baseSalary: 487.21,
      days: 30,
      contractType: "TP",
      hireDate: "2024-03-01",
    });
  });

  it("una fecha de ingreso vacía se guarda como ausente, no como cadena vacía", () => {
    expect(toEmployeeLine(form({ hireDate: "" })).hireDate).toBeNull();
  });

  it("desdobla el modo del fondo de reserva en sus dos banderas", () => {
    expect(toEmployeeLine(form({ reserveFund: "sin-derecho" }))).toMatchObject({
      hasReserveFund: false,
      accumulatesReserveFund: false,
    });
    expect(toEmployeeLine(form({ reserveFund: "mensual" }))).toMatchObject({
      hasReserveFund: true,
      accumulatesReserveFund: false,
    });
    expect(toEmployeeLine(form({ reserveFund: "acumula" }))).toMatchObject({
      hasReserveFund: true,
      accumulatesReserveFund: true,
    });
  });

  // Misma regla que `copyRoster`: sin captura, `capture` queda AUSENTE en vez de en ceros. Es lo
  // que distingue «este mes no trae nada» de «este mes trae ceros», y lo que hace que un empleado
  // recién dado de alta se lea igual que uno copiado del mes anterior.
  it("no adjunta captura cuando nadie tocó la sección del mes", () => {
    expect(toEmployeeLine(form()).capture).toBeUndefined();
  });

  // El alta ya NO tiene nada del mes que guardar: el importe aprobado se teclea en la pantalla del
  // empleado, junto a las horas que recorta. Así que la captura queda ausente SIEMPRE, encienda lo
  // que encienda el formulario.
  it("tampoco adjunta captura al encender una provisión: las provisiones son de la ficha", () => {
    const line = toEmployeeLine(form({ provisionsThirteenth: true, provisionsFourteenth: true }));
    expect(line.capture).toBeUndefined();
    expect(line.provisionsThirteenth).toBe(true);
    expect(line.provisionsFourteenth).toBe(true);
  });

  // Sin captura no hay `PAGADO`, y eso es lo que hace que un alta nazca «sin conciliar» en vez de
  // cuadrada contra un cero que nadie transfirió.
  it("no declara un PAGADO que nadie tecleó: el alta nace sin conciliar", () => {
    expect(toEmployeeLine(form()).capture).toBeUndefined();
  });
});

describe("employeeFormFrom · la ficha guardada, de vuelta al formulario", () => {
  it("siembra los diez campos de ficha", () => {
    const values = employeeFormFrom(
      storedLine({
        hasReserveFund: true,
        accumulatesReserveFund: true,
        provisionsThirteenth: true,
      }),
    );
    expect(values).toEqual({
      name: "MORALES MENA SILVIA JIMENA",
      idCard: "1002030405",
      role: "CAMARERA DE PISOS",
      area: "HOSPEDAJE",
      baseSalary: 487.21,
      days: 30,
      contractType: "CT",
      reserveFund: "acumula",
      hireDate: "2025-10-01",
      sectorCode: "1608551004134",
      provisionsThirteenth: true,
      provisionsFourteenth: false,
    });
  });

  // El formulario habla en texto y la ficha en `null`: sembrar `null` pondría la palabra en el
  // campo de fecha.
  it("una fecha de ingreso ausente se siembra vacía, no como `null`", () => {
    expect(employeeFormFrom(storedLine({ hireDate: null })).hireDate).toBe("");
  });

  it("siembra `days` y `baseSalary` aunque la edición no los pinte", () => {
    // Es lo que permite UNA sola validación para los dos modos: sin ellos, editar señalaría dos
    // campos obligatorios que el diálogo ni siquiera enseña.
    const values = employeeFormFrom(storedLine({ days: 15, baseSalary: 600 }));
    expect(validateEmployeeForm(values)).toEqual({});
  });
});

describe("toEmployeePatch · lo que una edición escribe", () => {
  it("no escribe `days` ni `baseSalary`: los dos se editan en la pantalla del mes", () => {
    const patch = toEmployeePatch(employeeFormFrom(storedLine({ days: 15 })), storedLine());
    expect(patch).not.toHaveProperty("days");
    expect(patch).not.toHaveProperty("baseSalary");
  });

  it("no escribe `capture`: una edición de ficha no toca el mes", () => {
    expect(toEmployeePatch(employeeFormFrom(storedLine()), storedLine())).not.toHaveProperty(
      "capture",
    );
  });

  it("escribe los campos de identidad recortados", () => {
    const values = employeeFormFrom(storedLine());
    const patch = toEmployeePatch(
      { ...values, name: "  ANA TORRES  ", role: " Cajera " },
      storedLine(),
    );
    expect(patch.name).toBe("ANA TORRES");
    expect(patch.role).toBe("Cajera");
  });

  it("escribe las dos provisiones, que son de la ficha", () => {
    const values = employeeFormFrom(storedLine());
    const patch = toEmployeePatch({ ...values, provisionsFourteenth: true }, storedLine());
    expect(patch.provisionsThirteenth).toBe(false);
    expect(patch.provisionsFourteenth).toBe(true);
  });

  /**
   * La asimetría de `reserve-fund.ts` con un caso real: MORALES trae `(FR=N, AC FR=S)`, que se lee
   * «sin derecho» y volvería como `(N, N)`. Guardar cualquier otro campo no puede corregir un
   * archivo que nadie pidió corregir — las cifras no se moverían, pero el Excel descargado dejaría
   * de coincidir con el que entró.
   */
  it("NO reescribe las banderas del fondo de reserva si el modo no cambió", () => {
    const line = storedLine({ hasReserveFund: false, accumulatesReserveFund: true });
    const patch = toEmployeePatch({ ...employeeFormFrom(line), role: "Otro" }, line);
    expect(patch).not.toHaveProperty("hasReserveFund");
    expect(patch).not.toHaveProperty("accumulatesReserveFund");
  });

  it("SÍ las reescribe cuando el modo cambia", () => {
    const line = storedLine();
    const patch = toEmployeePatch({ ...employeeFormFrom(line), reserveFund: "acumula" }, line);
    expect(patch.hasReserveFund).toBe(true);
    expect(patch.accumulatesReserveFund).toBe(true);
  });
});

describe("validateEmployeeForm · la cédula al EDITAR", () => {
  it("la cédula propia no se acusa de duplicada", () => {
    const values = employeeFormFrom(storedLine());
    const errors = validateEmployeeForm(values, {
      existing: [{ id: "e1", name: "MORALES MENA SILVIA JIMENA", idCard: "1002030405" }],
      selfId: "e1",
    });
    expect(errors.idCard).toBeUndefined();
  });

  it("la de OTRO empleado sí, nombrándolo", () => {
    const values = employeeFormFrom(storedLine({ idCard: "0908070605" }));
    const errors = validateEmployeeForm(values, {
      existing: [
        { id: "e1", name: "MORALES MENA SILVIA JIMENA", idCard: "1002030405" },
        { id: "e2", name: "VEGA GARCIA MARIANA DE JESUS", idCard: "0908070605" },
      ],
      selfId: "e1",
    });
    expect(errors.idCard).toContain("VEGA GARCIA MARIANA DE JESUS");
  });

  // Sin `selfId` —un ALTA— la comparación no puede saltarse ningún duplicado, ni siquiera cuando
  // la nómina llega sin `id`, que es como la escriben varios llamadores.
  it("sin `selfId` sigue atrapando el duplicado aunque la nómina no traiga `id`", () => {
    const errors = validateEmployeeForm(form({ idCard: "1002030405" }), {
      existing: [{ name: "MORALES MENA SILVIA JIMENA", idCard: "1002030405" }],
    });
    expect(errors.idCard).toBeTruthy();
  });
});
