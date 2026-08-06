import { describe, expect, it } from "vitest";
import {
  emptyEmployeeForm,
  toEmployeeLine,
  validateEmployeeForm,
  type EmployeeFormValues,
} from "./employee-form";

function form(overrides: Partial<EmployeeFormValues> = {}): EmployeeFormValues {
  return {
    ...emptyEmployeeForm(),
    name: "MORALES MENA SILVIA JIMENA",
    idCard: "1002030405",
    role: "Camarera",
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

  // `null` es «se reconocen todas», que es lo que hace un empleado nuevo del que nadie recortó
  // nada. Un cero por defecto apagaría las horas extras sin que nadie lo pidiera.
  it("no recorta las horas extras por defecto", () => {
    expect(emptyEmployeeForm().approvedOvertime).toBeNull();
  });

  it("devuelve un objeto nuevo en cada llamada", () => {
    expect(emptyEmployeeForm()).not.toBe(emptyEmployeeForm());
  });
});

describe("validateEmployeeForm · un formulario correcto", () => {
  it("no señala ningún campo", () => {
    expect(validateEmployeeForm(form())).toEqual({});
  });

  it("acepta los ajustes del mes enteros vacíos", () => {
    expect(validateEmployeeForm(form({ approvedOvertime: null }))).toEqual({});
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

describe("validateEmployeeForm · los ajustes del mes", () => {
  // Los tres estados de `approvedOvertime` (§6): `null` todas, `0` ninguna, un número ese importe.
  it("admite los tres estados del importe aprobado", () => {
    expect(validateEmployeeForm(form({ approvedOvertime: null })).approvedOvertime).toBeUndefined();
    expect(validateEmployeeForm(form({ approvedOvertime: 0 })).approvedOvertime).toBeUndefined();
    expect(
      validateEmployeeForm(form({ approvedOvertime: 16.75 })).approvedOvertime,
    ).toBeUndefined();
  });

  it("no admite un importe aprobado negativo", () => {
    expect(validateEmployeeForm(form({ approvedOvertime: -1 })).approvedOvertime).toBeTruthy();
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

  // `0` en el importe aprobado es el `*0` del libro: apaga las horas extras. Es una decisión
  // tecleada y tiene que sobrevivir aunque no haya ninguna hora capturada todavía.
  it("adjunta la captura cuando se recortan las horas extras a cero", () => {
    expect(toEmployeeLine(form({ approvedOvertime: 0 })).capture?.approvedOvertime).toBe(0);
  });

  it("adjunta la captura cuando se enciende una provisión de décimos", () => {
    expect(toEmployeeLine(form({ provisionsThirteenth: true })).capture).toMatchObject({
      provisionsThirteenth: true,
      provisionsFourteenth: false,
    });
  });

  // El alta ya no captura las cantidades de horas —se teclean en la ficha, junto al importe que
  // producen—, así que salen de aquí en CERO y no en nulo: nadie trabajó horas que no se declararon.
  it("las horas extras nacen en cero, que es lo que valen sin declarar", () => {
    const capture = toEmployeeLine(form({ approvedOvertime: 0 })).capture;
    expect(capture?.overtimeHours50).toBe(0);
    expect(capture?.overtimeHours100).toBe(0);
    expect(capture?.overtimeHours25).toBe(0);
  });

  it("no declara un PAGADO que nadie tecleó: el alta nace sin conciliar", () => {
    expect(toEmployeeLine(form({ approvedOvertime: 0 })).capture?.paid).toBeNull();
  });
});
