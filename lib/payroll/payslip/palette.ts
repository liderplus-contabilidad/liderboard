/**
 * LOS COLORES DEL COMPROBANTE, espejo de los tokens de `app/globals.css`.
 *
 * Un PDF no puede resolver una variable CSS, igual que no puede el canvas donde ECharts mide texto.
 * Esta duplicación es la MISMA que `lib/charts/palette.ts` declara y por la misma razón: los hexes
 * de aquí tienen que seguir a los del `@theme`, y si alguno se mueve allí, se mueve aquí.
 *
 * Los dos que dan carácter al documento no son decorativos: `income` y `cost` son
 * `--color-section-income` y `--color-section-cost`, los rellenos EXACTOS del libro del contador
 * —verde oliva y celeste, muestreados de sus capturas— que la tabla de Datos de PyG ya usa para la
 * raíz 4 y la 5. Un verde quiere decir «ingresos» en las tres superficies: su Excel, la pantalla y
 * este papel.
 *
 * `net` es el fondo de la banda del líquido a recibir, y es `--color-ink`: el color del TEXTO, no
 * el `brand`. Es la cifra que todo el mundo busca y merece el contraste máximo, pero teñirla de
 * marca convertiría el comprobante en un documento de la app en vez del de la firma.
 */
export const PAYSLIP_COLORS = {
  /** `--color-ink` */
  ink: "#1e293b",
  /** `--color-ink-soft` */
  inkSoft: "#334155",
  /** `--color-muted` */
  muted: "#64748b",
  /** `--color-faint` — las rayas de los conceptos sin importe, para que el ojo las salte. */
  faint: "#94a3b8",
  /** `--color-border` */
  border: "#e5e9ee",
  /** `--color-border-soft` */
  borderSoft: "#edf1f5",
  /** `--color-surface-header` — la banda de las filas alternas. */
  zebra: "#fafbfc",
  /** `--color-surface-muted` — el panel de identidad. */
  panel: "#f8fafc",
  /** `--color-section-income` */
  income: "#d7e4bd",
  /** `--color-section-cost` */
  cost: "#b7dee8",
  /** `--color-ink`, el fondo de la banda del líquido. */
  net: "#1e293b",
  white: "#ffffff",
} as const;
