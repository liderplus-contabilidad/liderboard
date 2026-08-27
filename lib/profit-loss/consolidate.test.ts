import { describe, expect, it } from "vitest";
import {
  CONSOLIDATED_CLIENT_ID,
  canConsolidate,
  consolidateClients,
  consolidatedCenterId,
  selectContributions,
  type ClientContribution,
} from "./consolidate";
import { buildAccountTree, computeRollups } from "./derive";
import type { AccountRow, CellEdit, Frequency, PygDataset } from "./types";

type AccountInput = { code: string; name: string; values: number[] };

function months(...values: number[]): number[] {
  return Array.from({ length: 12 }, (_, index) => values[index] ?? 0);
}

function dataset(
  id: string,
  clientId: string,
  year: number,
  accounts: AccountInput[],
  overrides: Partial<PygDataset> = {},
): PygDataset {
  return {
    id,
    clientId,
    fileName: `${id}.xlsx`,
    uploadedAt: 0,
    companyName: clientId.toUpperCase(),
    periodLabel: `Ene–Dic ${year}`,
    year,
    baseFrequency: "mensual" as Frequency,
    role: "single",
    accounts: accounts.map((a) => ({ code: a.code, name: a.name, values: a.values })),
    resultFromFile: [],
    warnings: [],
    ...overrides,
  };
}

function client(
  name: string,
  datasets: PygDataset[],
  loadedMonthsByYear: Record<number, number[]>,
  edits: CellEdit[] = [],
): ClientContribution {
  return { clientId: name.toLowerCase(), name, datasets, edits, loadedMonthsByYear };
}

/** January–March loaded, the rest not. */
const Q1 = { 2026: [0, 1, 2] };

/** What the engine reads of an account after the rollups — leaf or parent, indistinctly. */
function valueOf(accounts: AccountRow[], code: string, month: number): number | undefined {
  const { roots } = buildAccountTree(accounts);
  const find = (nodes: ReturnType<typeof computeRollups>): number | undefined => {
    for (const node of nodes) {
      if (node.code === code) {
        return node.values[month];
      }
      const inner = find(node.children);
      if (inner !== undefined) {
        return inner;
      }
    }
    return undefined;
  };
  return find(computeRollups(roots));
}

describe("canConsolidate", () => {
  const withData = client("Dingoo", [dataset("d", "dingoo", 2026, [])], Q1);

  it("needs two clients WITH data", () => {
    expect(canConsolidate([])).toBe(false);
    expect(canConsolidate([withData])).toBe(false);
    expect(canConsolidate([withData, client("Vacío", [], {})])).toBe(false);
    expect(canConsolidate([withData, client("Manor", [dataset("m", "manor", 2026, [])], Q1)])).toBe(
      true,
    );
  });
});

describe("selectContributions", () => {
  const a = client("A", [dataset("a", "a", 2026, [])], Q1);
  const b = client("B", [dataset("b", "b", 2026, [])], Q1);
  const vacio = client("Vacío", [], {});

  it("ninguno marcado es TODOS, no ninguno", () => {
    expect(selectContributions([a, b], []).map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("marcar deja dentro solo a los marcados", () => {
    expect(selectContributions([a, b], ["b"]).map((c) => c.name)).toEqual(["B"]);
  });

  it("nunca ofrece un cliente sin datos, ni marcado", () => {
    expect(selectContributions([a, b, vacio], ["vacío"]).map((c) => c.name)).toEqual(["A", "B"]);
  });
});

describe("consolidateClients", () => {
  it("suma solo los clientes seleccionados", () => {
    const of = (name: string, value: number) =>
      client(
        name,
        [
          dataset(name, name, 2026, [
            { code: "4", name: "INGRESOS", values: months(value) },
            { code: "4.1", name: "Ventas", values: months(value) },
          ]),
        ],
        { 2026: [0] },
      );
    const todos = [of("A", 100), of("B", 40), of("C", 7)];

    const dos = consolidateClients(selectContributions(todos, ["a", "c"]));
    expect(dos.contributors).toEqual(["A", "C"]);
    expect(valueOf(dos.datasets[0].accounts, "4.1", 0)).toBe(107);

    // Marking just one is legitimate: it gives that client, not an empty screen.
    const uno = consolidateClients(selectContributions(todos, ["b"]));
    expect(uno.contributors).toEqual(["B"]);
    expect(valueOf(uno.datasets[0].accounts, "4.1", 0)).toBe(40);
  });

  it("recalcula los avisos de cobertura sobre los que quedaron dentro", () => {
    const accounts = [{ code: "4", name: "INGRESOS", values: months(1, 1, 1, 1) }];
    const todos = [
      client("A", [dataset("a", "a", 2026, accounts)], { 2026: [0, 1, 2, 3] }),
      client("B", [dataset("b", "b", 2026, accounts)], { 2026: [0, 1, 2, 3] }),
      client("Atrasado", [dataset("z", "z", 2026, accounts)], { 2026: [0] }),
    ];

    // With the late one inside, there is a gap…
    expect(consolidateClients(selectContributions(todos, [])).warnings).toEqual([
      "Feb–Abr 2026: 2 de 3 clientes con datos (falta Atrasado).",
    ]);
    // …and leaving it out, the consolidado is complete and warns about nothing.
    expect(consolidateClients(selectContributions(todos, ["a", "b"])).warnings).toEqual([]);
  });

  it("sums the leaves two clients share", () => {
    const result = consolidateClients([
      client(
        "Dingoo",
        [
          dataset("d26", "dingoo", 2026, [
            { code: "4", name: "INGRESOS", values: months(100) },
            { code: "4.1", name: "Ventas", values: months(100) },
          ]),
        ],
        Q1,
      ),
      client(
        "Manor",
        [
          dataset("m26", "manor", 2026, [
            { code: "4", name: "INGRESOS", values: months(40) },
            { code: "4.1", name: "Ventas", values: months(40) },
          ]),
        ],
        Q1,
      ),
    ]);

    expect(result.contributors).toEqual(["Dingoo", "Manor"]);
    expect(result.datasets).toHaveLength(1);
    expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(140);
    expect(valueOf(result.datasets[0].accounts, "4", 0)).toBe(140);
  });

  it("unions two systems' charts of accounts into sibling branches", () => {
    const result = consolidateClients([
      client(
        "Dingoo",
        [
          dataset("d", "dingoo", 2026, [
            { code: "4", name: "INGRESOS", values: months(7200) },
            { code: "4.1.01.01.01", name: "Ventas", values: months(7200) },
          ]),
        ],
        Q1,
      ),
      client(
        "MicroPlus",
        [
          dataset("m", "microplus", 2026, [
            { code: "4", name: "INGRESOS", values: months(4800) },
            { code: "4.1.1.1.1", name: "Ventas", values: months(4800) },
          ]),
        ],
        Q1,
      ),
    ]);

    const { accounts } = result.datasets[0];
    // Two different rows: neither numbering fuses with the other…
    expect(valueOf(accounts, "4.1.01.01.01", 0)).toBe(7200);
    expect(valueOf(accounts, "4.1.1.1.1", 0)).toBe(4800);
    // …and the root they both share balances all the same.
    expect(valueOf(accounts, "4", 0)).toBe(12000);
  });

  it("folds each client's adjustments in before summing", () => {
    const edit: CellEdit = {
      datasetId: "d",
      code: "4.1",
      monthIndex: 0,
      value: 500,
      updatedAt: 0,
    };
    const result = consolidateClients([
      client(
        "Dingoo",
        [
          dataset("d", "dingoo", 2026, [
            { code: "4", name: "INGRESOS", values: months(100) },
            { code: "4.1", name: "Ventas", values: months(100) },
          ]),
        ],
        Q1,
        [edit],
      ),
      client(
        "Manor",
        [
          dataset("m", "manor", 2026, [
            { code: "4", name: "INGRESOS", values: months(40) },
            { code: "4.1", name: "Ventas", values: months(40) },
          ]),
        ],
        Q1,
      ),
    ]);

    expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(540);
  });

  it("sums a client's cost centers with everyone else's, in one pass", () => {
    const centers = ["norte", "sur"].map((centerId) =>
      dataset(
        `c-${centerId}`,
        "grupo",
        2026,
        [
          { code: "4", name: "INGRESOS", values: months(10) },
          { code: "4.1", name: "Ventas", values: months(10) },
        ],
        { role: "center", centerId },
      ),
    );
    const result = consolidateClients([
      client("Grupo", centers, Q1),
      client(
        "Manor",
        [
          dataset("m", "manor", 2026, [
            { code: "4", name: "INGRESOS", values: months(5) },
            { code: "4.1", name: "Ventas", values: months(5) },
          ]),
        ],
        Q1,
      ),
    ]);

    expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(25);
    // The consolidado is presented as a single statement: it inherits nobody's centers.
    expect(result.datasets[0].role).toBe("single");
    expect(result.datasets[0].centerId).toBeUndefined();
    expect(result.datasets[0].clientId).toBe(CONSOLIDATED_CLIENT_ID);
  });

  it("gives each year its own synthetic dataset", () => {
    const result = consolidateClients([
      client(
        "Dingoo",
        [
          dataset("d25", "dingoo", 2025, [{ code: "4", name: "INGRESOS", values: months(1) }]),
          dataset("d26", "dingoo", 2026, [{ code: "4", name: "INGRESOS", values: months(2) }]),
        ],
        { 2025: [0], 2026: [0] },
      ),
      client(
        "Manor",
        [dataset("m26", "manor", 2026, [{ code: "4", name: "INGRESOS", values: months(3) }])],
        { 2026: [0] },
      ),
    ]);

    expect(result.datasets.map((d) => d.year)).toEqual([2025, 2026]);
    expect(result.datasets.map((d) => d.id)).toEqual([
      `${CONSOLIDATED_CLIENT_ID}-2025`,
      `${CONSOLIDATED_CLIENT_ID}-2026`,
    ]);
    expect(valueOf(result.datasets[1].accounts, "4", 0)).toBe(5);
  });

  describe("cobertura", () => {
    const accounts = [{ code: "4", name: "INGRESOS", values: months(1, 1, 1, 1, 1, 1) }];
    const ahead = (name: string) =>
      client(name, [dataset(name, name, 2026, accounts)], { 2026: [0, 1, 2, 3, 4, 5] });
    const behind = (name: string) =>
      client(name, [dataset(name, name, 2026, accounts)], { 2026: [0, 1, 2] });

    it("is the UNION of what the clients loaded", () => {
      const result = consolidateClients([ahead("A"), behind("B")]);
      expect(result.loadedMonthsByYear[2026]).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("groups consecutive partial months into ONE warning naming who is missing", () => {
      const result = consolidateClients([
        ahead("A"),
        ahead("B"),
        ahead("C"),
        behind("Manor"),
        behind("Ambato"),
      ]);

      expect(result.warnings).toEqual([
        "Abr–Jun 2026: 3 de 5 clientes con datos (faltan Manor y Ambato).",
      ]);
    });

    it("says nothing when every client covers every month", () => {
      expect(consolidateClients([ahead("A"), ahead("B")]).warnings).toEqual([]);
    });

    it("breaks the run when the months are not consecutive", () => {
      const result = consolidateClients([
        client("A", [dataset("a", "a", 2026, accounts)], { 2026: [0, 1, 2, 3] }),
        client("B", [dataset("b", "b", 2026, accounts)], { 2026: [1] }),
      ]);

      // January and March are missing the same ones, but February both of them do have: an «Ene–Mar»
      // span would say February is incomplete too.
      expect(result.warnings).toEqual([
        "Ene 2026: 1 de 2 clientes con datos (falta B).",
        "Mar–Abr 2026: 1 de 2 clientes con datos (falta B).",
      ]);
    });

    it("treats a year one client does not have at all as a gap", () => {
      const result = consolidateClients([
        client("A", [dataset("a", "a", 2025, accounts)], { 2025: [0] }),
        client("B", [dataset("b", "b", 2026, accounts)], { 2026: [0] }),
      ]);

      expect(result.warnings).toEqual([
        "Ene 2025: 1 de 2 clientes con datos (falta B).",
        "Ene 2026: 1 de 2 clientes con datos (falta A).",
      ]);
    });
  });

  describe("frecuencia base", () => {
    const accounts = [{ code: "4", name: "INGRESOS", values: months(1) }];
    const monthly = (name: string) =>
      client(name, [dataset(name, name, 2026, accounts)], { 2026: [0] });
    const annual = (name: string) =>
      client(
        name,
        [
          dataset(name, name, 2026, [{ code: "4", name: "INGRESOS", values: [12] }], {
            baseFrequency: "anual",
          }),
        ],
        { 2026: [0] },
      );

    it("leaves out the odd one and says so", () => {
      const result = consolidateClients([monthly("A"), monthly("B"), annual("Legado")]);

      expect(result.contributors).toEqual(["A", "B"]);
      expect(result.excluded).toEqual([
        { name: "Legado", reason: "su estado es anual y el resto es mensual" },
      ]);
      expect(result.warnings.at(-1)).toBe(
        "«Legado» quedó fuera del consolidado: su estado es anual y el resto es mensual.",
      );
    });

    it("takes the majority's frequency, not the first client's", () => {
      // Alphabetically «Anual» comes first; the majority leads all the same.
      const result = consolidateClients([annual("Anual"), monthly("B"), monthly("C")]);
      expect(result.contributors).toEqual(["B", "C"]);
      expect(result.datasets[0].baseFrequency).toBe("mensual");
    });

    it("consolidates an entirely annual space rather than emptying it", () => {
      const result = consolidateClients([annual("A"), annual("B")]);
      expect(result.contributors).toEqual(["A", "B"]);
      expect(result.datasets[0].baseFrequency).toBe("anual");
      expect(result.excluded).toEqual([]);
    });

    it("consolida al único que sobrevive en vez de vaciarse", () => {
      // «Two are needed» decides whether the consolidado is OFFERED, not what whoever is already in
      // can look at.
      const result = consolidateClients([monthly("A"), annual("B")]);
      expect(result.contributors).toEqual(["A"]);
      expect(result.datasets).toHaveLength(1);
    });
  });

  it("ignores clients created but still empty", () => {
    const result = consolidateClients([
      client("A", [dataset("a", "a", 2026, [{ code: "4", name: "I", values: months(1) }])], {
        2026: [0],
      }),
      client("B", [dataset("b", "b", 2026, [{ code: "4", name: "I", values: months(1) }])], {
        2026: [0],
      }),
      client("Recién creado", [], {}),
    ]);

    expect(result.contributors).toEqual(["A", "B"]);
    expect(result.excluded).toEqual([]);
  });

  it("labels the period from the real coverage, not the whole year", () => {
    const accounts = [{ code: "4", name: "INGRESOS", values: months(1, 1, 1) }];
    const result = consolidateClients([
      client("A", [dataset("a", "a", 2026, accounts)], { 2026: [0, 1, 2] }),
      client("B", [dataset("b", "b", 2026, accounts)], { 2026: [0, 1, 2] }),
    ]);

    expect(result.datasets[0].periodLabel).toBe("Ene–Mar 2026");
  });

  it("no pierde lo que un cliente anotó en una cuenta que otro desglosa", () => {
    const result = consolidateClients([
      client(
        "Corto",
        [
          dataset("corto", "corto", 2026, [
            { code: "4", name: "INGRESOS", values: months(500) },
            { code: "4.1", name: "Ventas", values: months(500) },
          ]),
        ],
        { 2026: [0] },
      ),
      client(
        "Largo",
        [
          dataset("largo", "largo", 2026, [
            { code: "4", name: "INGRESOS", values: months(300) },
            { code: "4.1", name: "Ventas", values: months(300) },
            { code: "4.1.01", name: "Ventas netas", values: months(300) },
          ]),
        ],
        { 2026: [0] },
      ),
    ]);

    const { accounts } = result.datasets[0];
    expect(valueOf(accounts, "4", 0)).toBe(800);
    expect(valueOf(accounts, "4.1.0", 0)).toBe(500);
    expect(accounts.find((a) => a.code === "4.1.0")?.name).toBe("Sin desglosar");
  });

  describe("centros de costo cruzados", () => {
    /** A statement with a single account with movement, so the sum can be read at a glance. */
    const accountsOf = (value: number) => [
      { code: "4", name: "INGRESOS", values: months(value) },
      { code: "4.1", name: "Ventas", values: months(value) },
    ];

    /** A client by centers: one dataset per center and year, in the order they are listed. */
    function centersClient(
      name: string,
      centers: { id: string; label: string; value: number }[],
      coverage: Record<number, number[]> = { 2026: [0] },
      years = [2026],
    ): ClientContribution {
      return client(
        name,
        years.flatMap((year) =>
          centers.map((center, index) =>
            dataset(
              `${name}-${center.id}-${year}`,
              name.toLowerCase(),
              year,
              accountsOf(center.value),
              {
                role: "center",
                centerId: center.id,
                costCenterName: center.label,
                order: index,
              },
            ),
          ),
        ),
        coverage,
      );
    }

    /** A single-statement client: it has no centers to cross. */
    const singleClient = (name: string, value: number) =>
      client(name, [dataset(name, name.toLowerCase(), 2026, accountsOf(value))], { 2026: [0] });

    const dingoo = centersClient("Dingoo", [
      { id: "restaurante", label: "RESTAURANTE", value: 10 },
      { id: "hotel", label: "HOTEL", value: 5 },
    ]);
    const manor = centersClient("Manor", [{ id: "restaurante", label: "Restaurante", value: 3 }]);

    it("lista un centro por (cliente · centro), diciendo de quién es cada uno", () => {
      const result = consolidateClients([dingoo, manor]);

      // The same `restaurante` in two companies is TWO entries, not one fused by name.
      expect(result.centerDatasets.map((d) => d.centerId)).toEqual([
        consolidatedCenterId("dingoo", "restaurante"),
        consolidatedCenterId("dingoo", "hotel"),
        consolidatedCenterId("manor", "restaurante"),
      ]);
      // The label's two halves travel separately: the dropdown groups by client and puts the center
      // below; the chip and the legend join them.
      expect(result.centerDatasets.map((d) => d.costCenterName)).toEqual([
        "RESTAURANTE",
        "HOTEL",
        "Restaurante",
      ]);
      expect(result.centerDatasets.map((d) => d.companyName)).toEqual([
        "Dingoo",
        "Dingoo",
        "Manor",
      ]);
      // And the total is still everything: with no marks nothing is narrowed.
      expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(18);
    });

    it("marcar centros ACOTA la suma, y no quita nada de la lista", () => {
      const result = consolidateClients(
        [dingoo, manor],
        [
          consolidatedCenterId("dingoo", "restaurante"),
          consolidatedCenterId("manor", "restaurante"),
        ],
      );

      expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(13);
      expect(result.centerDatasets).toHaveLength(3);
    });

    it("marcar uno solo da ese centro", () => {
      const result = consolidateClients([dingoo, manor], [consolidatedCenterId("dingoo", "hotel")]);

      expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(5);
      expect(result.contributors).toEqual(["Dingoo"]);
    });

    it("una marca que este universo no tiene no vacía la pantalla", () => {
      // What is left in the bar on opening the consolidado from a particular client: a center's loose
      // id, which does not exist here. Without the cross-check against the universe, the sum would
      // give zero.
      const result = consolidateClients([dingoo, manor], ["restaurante"]);

      expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(18);
    });

    it("filtrar por centros manda sobre «Cliente»: el de estado único queda fuera", () => {
      const clients = [dingoo, singleClient("MicroPlus", 7)];

      // With no marks everything «Cliente» left in goes in, MicroPlus' 7 included…
      const todo = consolidateClients(clients);
      expect(valueOf(todo.datasets[0].accounts, "4.1", 0)).toBe(22);
      expect(todo.warnings).toEqual([]);

      // …and marking a center, the sum is THAT center and nothing else. MicroPlus has none to come in
      // with, and since it does not appear in the list either, its absence has to be said.
      const marked = consolidateClients(clients, [consolidatedCenterId("dingoo", "restaurante")]);
      expect(valueOf(marked.datasets[0].accounts, "4.1", 0)).toBe(10);
      expect(marked.contributors).toEqual(["Dingoo"]);
      expect(marked.centerDatasets.map((d) => d.companyName)).toEqual(["Dingoo", "Dingoo"]);
      expect(marked.warnings).toContain(
        "«MicroPlus» no tiene centros de costo: queda fuera mientras filtres por centro.",
      );
    });

    it("el cliente que se queda fuera deja de contar para la cobertura", () => {
      const adelantado = centersClient(
        "Dingoo",
        [{ id: "restaurante", label: "RESTAURANTE", value: 10 }],
        { 2026: [0, 1] },
      );
      const atrasado = centersClient("Manor", [{ id: "hotel", label: "HOTEL", value: 3 }], {
        2026: [0],
      });

      expect(consolidateClients([adelantado, atrasado]).warnings).toEqual([
        "Feb 2026: 1 de 2 clientes con datos (falta Manor).",
      ]);

      // With only the early one's center marked, the other is not there: naming it among the absent
      // ones would talk about a client the user themselves set aside.
      const acotado = consolidateClients(
        [adelantado, atrasado],
        [consolidatedCenterId("dingoo", "restaurante")],
      );
      expect(acotado.contributors).toEqual(["Dingoo"]);
      expect(acotado.warnings).toEqual([]);
    });

    it("las piezas que SUMÓ salen cliente por cliente, con las de estado único incluidas", () => {
      // What the download writes sheet by sheet: each center that went into the sum and the whole
      // statement of whoever has no centers. The invariant is that the Consolidado is their sum.
      const result = consolidateClients([dingoo, manor, singleClient("MicroPlus", 7)]);

      expect(result.summedDatasets.map((d) => [d.clientId, d.dataset.costCenterName])).toEqual([
        ["dingoo", "RESTAURANTE"],
        ["dingoo", "HOTEL"],
        ["manor", "Restaurante"],
        ["microplus", undefined],
      ]);
      // The client's label is the one the user set, not the file's razón social.
      expect(result.summedDatasets.map((d) => d.dataset.companyName)).toEqual([
        "Dingoo",
        "Dingoo",
        "Manor",
        "MicroPlus",
      ]);
      // And they add up to exactly the total: 10 + 5 + 3 + 7.
      const piezas = result.summedDatasets.reduce(
        (total, { dataset: d }) => total + (valueOf(d.accounts, "4.1", 0) ?? 0),
        0,
      );
      expect(piezas).toBe(valueOf(result.datasets[0].accounts, "4.1", 0));
      expect(piezas).toBe(25);
    });

    it("marcar centros acota también las piezas, no solo el total", () => {
      const result = consolidateClients(
        [dingoo, manor, singleClient("MicroPlus", 7)],
        [consolidatedCenterId("dingoo", "hotel"), consolidatedCenterId("manor", "restaurante")],
      );

      // MicroPlus has no centers to come in with, so it has no sheet to write either.
      expect(result.summedDatasets.map((d) => d.dataset.centerId)).toEqual([
        consolidatedCenterId("dingoo", "hotel"),
        consolidatedCenterId("manor", "restaurante"),
      ]);
      expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(8);
    });

    it("las piezas llevan los ajustes ya aplicados, como el total", () => {
      const ajustado = client(
        "Dingoo",
        [
          dataset("dingoo-2026", "dingoo", 2026, accountsOf(10), {
            role: "center",
            centerId: "restaurante",
            costCenterName: "RESTAURANTE",
            order: 0,
          }),
        ],
        { 2026: [0] },
        [{ datasetId: "dingoo-2026", code: "4.1", monthIndex: 0, value: 40, updatedAt: 0 }],
      );
      const result = consolidateClients([ajustado, manor]);

      expect(valueOf(result.summedDatasets[0].dataset.accounts, "4.1", 0)).toBe(40);
      expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(43);
    });

    it("cada par conserva su ranura de color a través de los años", () => {
      const result = consolidateClients([
        centersClient(
          "Dingoo",
          [
            { id: "restaurante", label: "RESTAURANTE", value: 10 },
            { id: "hotel", label: "HOTEL", value: 5 },
          ],
          { 2025: [0], 2026: [0] },
          [2025, 2026],
        ),
        manor,
      ]);

      // Five datasets (two centers × two years, plus Manor's) over THREE slots: one more year does not
      // spend a new one, so a center does not change colour on changing year.
      expect(result.centerDatasets).toHaveLength(5);
      expect(new Set(result.centerDatasets.map((d) => d.order)).size).toBe(3);
      expect(new Set(result.centerDatasets.map((d) => d.centerColor)).size).toBe(3);

      const restaurante = result.centerDatasets.filter(
        (d) => d.centerId === consolidatedCenterId("dingoo", "restaurante"),
      );
      expect(restaurante.map((d) => d.year)).toEqual([2025, 2026]);
      expect(new Set(restaurante.map((d) => `${d.order}·${d.centerColor}`)).size).toBe(1);
    });

    it("sin ningún cliente por centros no hay nada que cruzar", () => {
      const result = consolidateClients([singleClient("A", 1), singleClient("B", 2)]);

      expect(result.centerDatasets).toEqual([]);
      expect(valueOf(result.datasets[0].accounts, "4.1", 0)).toBe(3);
    });
  });

  it("names the CLIENT, not the center, in a structural conflict", () => {
    const result = consolidateClients([
      client(
        "A",
        [dataset("a", "a", 2026, [{ code: "4.1", name: "Ventas", values: months(10) }])],
        { 2026: [0] },
      ),
      client(
        "B",
        [dataset("b", "b", 2026, [{ code: "4.1.1", name: "Ventas netas", values: months(4) }])],
        { 2026: [0] },
      ),
    ]);

    expect(result.warnings.some((w) => w.includes("es hoja en un cliente y padre en otro"))).toBe(
      true,
    );
  });
});
