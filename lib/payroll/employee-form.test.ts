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

/** A stored record, MORALES' as the real March 2026 rol brings it. */
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

  // Registering the same person twice duplicates their salary in the período's totals with nothing on
  // screen giving it away: two rows with names typed differently read as two people.
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

  // With a base salary of zero the employee's whole rol falls to zero —unified, décimo tercero, IESS
  // contribution— and the row is left in the nómina adding up nothing. It is a capture error, not a
  // case.
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
  // The screen has to be able to point at EVERY field that fails, not give up at the first.
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

  // Same rule as `copyRoster`: with no capture, `capture` is left ABSENT instead of at zeros. It is
  // what tells «this month brings nothing» from «this month brings zeros», and what makes a freshly
  // added employee read the same as one copied from the previous month.
  it("no adjunta captura cuando nadie tocó la sección del mes", () => {
    expect(toEmployeeLine(form()).capture).toBeUndefined();
  });

  // The creation form no longer has anything of the month to store: the approved amount is typed on
  // the employee's screen, next to the hours it trims. So the capture is ALWAYS absent, whatever the
  // form switches on.
  it("tampoco adjunta captura al encender una provisión: las provisiones son de la ficha", () => {
    const line = toEmployeeLine(form({ provisionsThirteenth: true, provisionsFourteenth: true }));
    expect(line.capture).toBeUndefined();
    expect(line.provisionsThirteenth).toBe(true);
    expect(line.provisionsFourteenth).toBe(true);
  });

  // With no capture there is no `PAGADO`, and that is what makes a new employee born «unreconciled»
  // instead of squared against a zero nobody transferred.
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

  // The form speaks in text and the record in `null`: seeding `null` would put the word in the date
  // field.
  it("una fecha de ingreso ausente se siembra vacía, no como `null`", () => {
    expect(employeeFormFrom(storedLine({ hireDate: null })).hireDate).toBe("");
  });

  it("siembra `days` y `baseSalary` aunque la edición no los pinte", () => {
    // It is what allows ONE single validation for both modes: without them, editing would point at
    // two required fields the dialog does not even show.
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
   * `reserve-fund.ts`'s asymmetry with a real case: MORALES brings `(FR=N, AC FR=S)`, which reads as
   * «not entitled» and would come back as `(N, N)`. Saving any other field cannot correct a file
   * nobody asked to have corrected — the figures would not move, but the downloaded Excel would stop
   * matching the one that came in.
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

  // Without `selfId` —a CREATION— the comparison cannot skip any duplicate, not even when the nómina
  // arrives with no `id`, which is how several callers write it.
  it("sin `selfId` sigue atrapando el duplicado aunque la nómina no traiga `id`", () => {
    const errors = validateEmployeeForm(form({ idCard: "1002030405" }), {
      existing: [{ name: "MORALES MENA SILVIA JIMENA", idCard: "1002030405" }],
    });
    expect(errors.idCard).toBeTruthy();
  });
});
