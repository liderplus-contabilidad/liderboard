/**
 * THE PAYSLIP'S COLOURS, a mirror of `app/globals.css`'s tokens.
 *
 * A PDF cannot resolve a CSS variable, just as the canvas where ECharts measures text cannot. This
 * duplication is the SAME one `lib/charts/palette.ts` declares and for the same reason: the hexes
 * here have to follow the `@theme`'s, and if one moves there, it moves here.
 *
 * The two that give the document its character are not decorative: `income` and `cost` are
 * `--color-section-income` and `--color-section-cost`, the EXACT fills of the accountant's book
 * —olive green and light blue, sampled from their screenshots— that PyG's Datos table already uses
 * for roots 4 and 5. A green means «income» on all three surfaces: their Excel, the screen and this
 * paper.
 *
 * `net` is the fill of the net-pay band, and it is `--color-ink`: the colour of the TEXT, not
 * `brand`. It is the figure everyone looks for and it deserves maximum contrast, but tinting it with
 * the brand would turn the payslip into a document of the app instead of the firm's.
 */
export const PAYSLIP_COLORS = {
  /** `--color-ink` */
  ink: "#1e293b",
  /** `--color-ink-soft` */
  inkSoft: "#334155",
  /** `--color-muted` */
  muted: "#64748b",
  /** `--color-faint` — the dashes of the concepts with no amount, so the eye skips them. */
  faint: "#94a3b8",
  /** `--color-border` */
  border: "#e5e9ee",
  /** `--color-border-soft` */
  borderSoft: "#edf1f5",
  /** `--color-surface-header` — the band of the alternating rows. */
  zebra: "#fafbfc",
  /** `--color-surface-muted` — the identity panel. */
  panel: "#f8fafc",
  /** `--color-section-income` */
  income: "#d7e4bd",
  /** `--color-section-cost` */
  cost: "#b7dee8",
  /** `--color-ink`, the fill of the net-pay band. */
  net: "#1e293b",
  white: "#ffffff",
} as const;
