# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This file is the MAP and the INVARIANTS.** The extensive _why_ — what was tried first, what was
rejected and the measurements behind each decision — lives in `docs/architecture.md`, which is not
loaded into context: read it when you need to know why something is the way it is. Most of that
reasoning also lives in the docstring of the file that applies it, which is where it binds.

## What this is

`liderboard` — the **LiderPlus** financial dashboard, a web app for an accounting
firm. UI copy is in **Spanish**; code (identifiers, route slugs) is in **English**.
Desktop only — no responsive/mobile layer.

## Commands

Package manager is **pnpm** (pinned via `packageManager`). Node LTS.

| Task                                | Command                               |
| ----------------------------------- | ------------------------------------- |
| Dev server (Turbopack, :3000)       | `pnpm dev`                            |
| Production build (also type-checks) | `pnpm build`                          |
| Serve production build              | `pnpm start`                          |
| Lint                                | `pnpm lint` (or `pnpm exec oxlint .`) |
| Lint + autofix                      | `pnpm lint:fix`                       |
| Format                              | `pnpm fmt`                            |
| Format check (CI gate)              | `pnpm fmt:check`                      |
| Tests (Vitest, pure layer only)     | `pnpm test`                           |

CI (`.github/workflows/ci.yml`) runs four independent jobs on PRs and pushes to `main`: `pnpm lint`,
`pnpm fmt:check`, `pnpm build`, `pnpm test`. A husky pre-commit hook runs `lint-staged` (oxlint --fix

- oxfmt on staged files).

## Toolchain gotchas

- **Linting/formatting is oxc, not ESLint/Prettier.** `pnpm lint` runs `oxlint` (config
  `.oxlintrc.json`, only `correctness` errors); `pnpm fmt` runs `oxfmt`. eslint/prettier are not
  installed. oxlint enforces `next/no-assign-module-variable`: never name a local `module` (use `mod`).
- **Tailwind CSS v4, CSS-first.** No `tailwind.config.js`; the theme is `app/globals.css`'s
  `@theme { … }` block.
- **Vitest covers ONLY the pure layer** (`lib/**/*.test.ts`) — no jsdom, no component tests. Config
  in `vitest.config.ts`. TypeScript is `strict`; `@/*` maps to the repo root.
- **ECharts measures text on a canvas, where a CSS variable cannot resolve** — a font stack written
  as `var(--font-ibm-plex-sans)` is measured against a narrower fallback and every width-capped axis
  label truncates wrong. `components/ui/chart.tsx` reads the generated family off `:root` and
  substitutes it before `setOption`; keep any new text sizing on that path.
- **Every tooltip carries `confine: true`**, set once in each module's `TOOLTIP_CHROME` and never
  per tooltip: `ChartCard` is `overflow-hidden` (it needs to be), so an unconfined tooltip is CUT by
  the card on the last bars.

## Code conventions

- **Prefer reusable functions.** Anything general-purpose (formatters, constants, pure utils) goes in
  `lib/` and is imported via `@/*`. Amounts through `lib/format.ts` (`formatCurrency` = Ecuador USD),
  month labels via `lib/date.ts`. Only helpers tied to one module's domain stay in that module.
- **Reuse primitives + tokens first.** `components/ui/*` and the `@theme` tokens before ad-hoc markup
  or a hardcoded hex.
- **Prop-driven components** with a sensible empty state. **Small client boundary**: Server
  Components by default, `"use client"` only where local state/interactivity needs it.
- **Optimize for performance by default**: `React.memo` on list/row components with stable keys and
  `useCallback`, `useMemo` for expensive derivations, CSS (`content-visibility`) over JS. Heavier
  tooling (row virtualization) only when data volumes justify it.
- **Match the surrounding code** — naming, style, comment density (comments explain the _why_). UI
  copy in Spanish, identifiers/slugs in English.

## Architecture

Next.js **App Router**. `app/(dashboard)/layout.tsx` renders the persistent shell (sidebar + header +
`<main>`) and mounts each module's DATA PROVIDER — a provider lives there because the HEADER reads
from the same state the panel does (`ActiveClient` shows PyG's cliente and Ocupaciones' hotel).
Layout persistence is also why the sidebar's collapse state needs no store.

**Module registry is the single source of truth.** `lib/modules.ts` (`MODULES`, `DEFAULT_MODULE`,
`findModuleBySlug`, `findSubmoduleBySlug`) drives both the sidebar nav and the header
breadcrumb/title. **To add a module:** one entry + `app/(dashboard)/<slug>/page.tsx`. Nesting is ONE
level (`children`), rendered indented and visible by default — the sidebar stores what is COLLAPSED,
so a new module with children is born visible. A module with no real page gets NO entry.

### The shape every module repeats

Learn it once and four modules read the same way:

- **Pure layer in `lib/<module>/`** — parse · derive · filters · charts · export · db. It is what
  Vitest covers and where any logic worth testing belongs; components are mount-only. If a component
  grows logic worth testing, that logic belongs in `lib/`.
- **`db.ts` is the ONLY door to the Dexie tables.** Not tidiness: with several entities sharing a
  table, an unbounded query mixes two companies in SILENCE and nothing downstream can tell.
- **Parsed ≠ stored.** The parser produces data that belongs to nobody (`ParsedDataset`,
  `OccupancyDataset`, `ParsedSalesMonth`); `db.ts` STAMPS the owner at the door, because which entity
  a file belongs to is decided by which one is OPEN, never by the file.
- **Identity is DERIVED, never stored** (`deriveWorkspaceIdentity`, `deriveHotelIdentity`,
  `sales/identity.ts`) — which makes «an empty entity has no identity» free, so a first upload can
  never clash. The user's LABEL is never compared against a file: «Manor Galápagos» is what the
  workbook calls `CULTURA MANOR`. A contradicting file opens a THREE-exit dialog (load it where it
  belongs · create that entity · replace only the ACTIVE one), never a silent replacement.
- **Coverage: `null` ≠ `0`.** A period never loaded reads `null` through the whole engine; a loaded
  period that sold nothing is a real zero. Axes, notes, totals and every «hide empty» control depend
  on that distinction being kept.
- **Filter marks** (`lib/*/filters.ts`): none marked = ALL, kept in UNIVERSE order (not click order),
  pruned on READ (`sanitizeFilters`), never in an effect; an orphan mark counts as none. The one
  exception is Ventas' «Año», which resolves to the most recent year instead of summing all.
- **«Exactly one marked»** is the recurring figure (`resolveActiveCenterId`, and the copies of it every module grew):
  exactly one marked = that entity, editable; none or several = the aggregate, read-only. It is why
  no module needs a «Consolidado / Por X» tab.
- **Nothing derived is persisted** — consolidados, payroll totals, the journal entry, the ficha. A
  stored copy goes stale at the next adjustment and the screen would contradict the data.
- **A workbook is located BY LABEL, never by coordinate** (`microplus-grid.ts`, `dingoo-grid.ts`,
  `sales/upload/`, payroll's `findPeriod`/`findCompany`). The letterhead once pushed every preamble
  down; by-label reading is what survived it.
- **One definition per figure.** Two places computing the same number drift apart and nothing can say
  which is right: `rootSign`, `shareOf`, `computeLinePayroll`, `letterheadLines`, `monthHasData`,
  `sameToTheCentavo`, `costCenterHeading`, `payer.ts`, `periodRangeLabel`.
- **A control read by ONE card lives in that card's header** (Ocupaciones' «Ver por», Análisis'
  «Base», «Ocultar ceros», «Ver como»); a control read by every card lives in the filter bar, where
  it leaves a chip. In the filter bar a control that means nothing for the open data RENDERS NOTHING
  rather than sitting disabled.
- **On paper there are no controls.** A printed toggle is a button nobody can press, so every report
  prints all shapes and ignores the screen's local switches.

### Modules

**PyG — Estado de resultados** · `/profit-loss` (Datos · Gráficos · Análisis) · `lib/profit-loss/` ·
Dexie `liderboard-pyg` v7 partitioned by `clientId` (`clients`, `datasets`, `edits`, `meta`, `active`).

- Identity is `(sistema, empresa, modo)` — the YEAR deliberately is not: another year is more of the
  same workspace and merges in without asking.
- **A dataset is a center-YEAR.** `WorkspaceMeta.loadedMonthsByYear` is the declared coverage, keyed
  by year. Cost centers load one file = one month = every center; estado único declares its own
  period inside the file.
- **Uploads are a strategy registry** (`upload/registry.ts`, first-match-wins): `monthly-centers`,
  `monthly-single`, `microplus`, `dingoo`, `app-workbook`. Each owns its sheet shape, account-code
  convention and SIGN rule (MicroPlus negates root 5, Dingoo negates root 4) — adding a system is one
  entry, no core change. `writesOwnFormat` gates the «un mes en crudo» download.
- **Consolidado ENTRE CLIENTES** (`consolidate.ts`, sentinel `CONSOLIDATED_CLIENT_ID`):
  derived and never stored, read-only; `assertRealClient` rejects every write against the sentinel;
  `consolidatedContributions()` is the ONE read without `clientId`. Cross-client center ids compose
  as `<clientId>::<centerId>` and ARE view ids, so no new `PygFilters` field exists for them.
- **The filter bar is the module's only selection surface** (`pyg-toolbar.tsx`, three tramos: what it
  narrows · time · «Predeterminados»), reflected by chips and read identically by the three tabs.
  `PygFilters` is flat (`codes`/`centerIds`/`years`/`periods`/`preset`) and the comparison axis is
  never declared — marking several accounts and/or centers IS the comparison.
- **Datos speaks in COLUMNS, not months** (`DatosGrid.columns` carry their own `year`; a year's Total
  is a column like any other). Hiding empty rows and empty columns is judged against the SAME table
  (`filter.ts`, `datos-columns.ts`): a row survives on a cell that also saves its column.
- **Charts**: `analytics/` is the pure engine; `charts/sources.ts` → `selection.ts` (`PygFilters` →
  `SeriesQuery`) → `option.ts` → `presets.ts`. Queries cap at `CHART_MAX_SERIES` (8) and the engine
  reports what it truncated. `preset-views.ts` is the catalogue behind «Predeterminados» (Ventas,
  Costos y gastos): adding one is an entry there plus a branch in `cards.ts`.
- **Segmentar gastos** (`segment.ts`) copies subtree **5.2** as root **6**, one-way; `twinWriteFor`
  anchors the twin to what the FILE brought (`original − valor`), so the pair always sums the loaded
  amount. `rootSign` is the one sign definition (4 adds, 5 and 6 subtract).
- **The printable report** (`pyg-report-preview.tsx`) prints one statement table per VIEW and per
  YEAR — the paper equivalent of «Excel completo» — walking the provider's same `views`.
  `lib/report/page-fit.ts` is the only rule of what fits (vertical → landscape, 10.5 → 8.5 px).
- Account **ficha**: `charts/account-detail.ts`, one analytics query per account, mounted on
  `SidePanel`.

**Ocupaciones** · `/occupancy` · `lib/occupancy/` · Dexie `liderboard-occupancy` v5, `centerYears` keyed
`[hotelId+centerId+year]`, partitioned by `hotelId`.

- **A record is one HOTEL-SUCURSAL-YEAR** and stores ONLY raw inputs — ADR, ocupación, RevPAR, PAX
  and every total are recomputed; an imported month shows VERBATIM until its first edit.
- `consolidate.ts` sums sucursales as raw inputs, so indicators stay ratios of sums (the one
  definition under which ADR × Ocupación = RevPAR survives the sum).
- **Coverage is SALES, not existence** (`monthHasData` in `derive.ts`): a real workbook already
  carries capacity for months still to come, and reading those as data dragged a hotel's occupancy
  from 56 % to 32 %.
- Gráficos has its own engine (`filters.ts` → `charts/selection.ts` → `analytics/series.ts` →
  `charts/option.ts`). **The YEAR is part of the period, not a series**: a series IS a sucursal, and
  `analytics/scope.ts` (`periodCells`) is the ONE answer to which days of which months a period
  covers. The heatmap is deliberately not an ECharts chart.

**Rol de Pagos** · `/payroll` · `lib/payroll/` · Dexie `liderboard-payroll` · a period is cliente + año + mes.

- **The ENGINE is the only source of every figure on screen.** The Excel only uploads: what is stored
  is the employee's ficha plus the month's `PayrollMonthlyCapture`; the rol's twenty columns —
  including the four period totals — are derived on each render. `engine/golden.test.ts` reproduces
  the six employees of March 2026 from the real book with EXACT equality.
- `computeLinePayroll` (`employee-input.ts`) is the ONE composition of ficha + capture → engine.
  A period has NO state; a row's LABEL lives in the month's capture (`row-labels.ts`); bonuses are
  rows of the same class inside `capture.extras`.
- **The journal entry** (`journal.ts`) is one consolidated entry, 25 accounts (the 25th, «Seguro
  Privado», is this app's own — without it the entry does not balance). `sourceColumns` is not
  documentation: `journal-amounts.ts` WALKS it to sum the payroll, so a column without a destination
  does not compile. Account names go verbatim, with the accountant's typos.
- **Payslip PDF** (`payslip/`, `pdf-lib`) and **rol export** (`export/`) are both three layers where
  the drawing one decides nothing: document/grid (pure) → layout (pure) → render. The COLUMN LETTER
  is the export's contract, so what the app does not store keeps its header and comes out empty.
- **Sueldos por Áreas** (`/payroll/salaries`, submodule) reads Rol de Pagos' periods for the active
  client: `salaries/` (identity · filters · grid · chart · report). It is a submodule and not a
  module because it has no data of its own and needs that client selector.

**Ventas por servicio** · `/profit-loss/sales` (submodule of PyG) · `lib/sales/` · its own Dexie base
`liderboard-sales`, partitioned by PyG's `clientId`.

- **What is invoiced is NOT what is booked**, so these sales enter NO PyG reading — Datos, Gráficos
  and Análisis draw exactly the same with sales loaded or not, and the silence is declared on screen
  and in the report header.
- One upload = one CALENDAR MONTH, declared by the file (`Desde:`/`Hasta:` through `toCalendarMonth`,
  the same rule as estado único); a reloaded month is replaced whole. The header identifies the
  FORMAT; `readSalesRow` locates a line by RELATIVE position, because the labels sit centered over
  merged cells and fall in different columns than their values.
- Three readings described as DATA (`cards.ts`: `option` + `table`), which is what lets the report
  read the same construction as the screen. **Each card has two shapes and the number of marked years
  chooses it**, never a control. `payer.ts` is the one place that decides whether a payer is named.
- The bar is Año · Mes · Servicio; `scopedPeriodLabel` (`filters.ts`) is the ONE composition of the
  label the tiles, the three subtitles and the report header read.

### Shared UI

- **`components/ui/excel-actions.tsx` is the app's ONE Excel control** — a module writes a thin
  wrapper, never its own button markup. The download's FORM is derived from how many options it gets
  (one → button, two or more → menu); `busy`, errors and the reentrancy guard live in the
  primitive. Live gallery of the primitives at `/docs/components`.
- **`side-panel.tsx` vs `modal.tsx`**: the drawer is for a detail read ALONGSIDE what opened it (no
  scrim); the modal interrupts and dims the background, for something read ALONE. `ConfirmDialog`
  predates `modal.tsx` and should be folded into it when touched.
- **`report-layer.tsx`** is every printable report's frame: the portal, the `.report-layer` class
  `@media print` isolates (a CLASS, not an id — that is what allows a third report), Escape, the
  print title and the toolbar. `ReportSheet` is the A4 sheet; `ReportBand` is the paper letterhead
  (client logo left, title centered, center logo right — the same split the Excels use).
- **`chart.tsx` is the sole `echarts.init` caller** (partial imports, SVG renderer). `ChartCard`
  pairs an `option` with its table twin, capped to the chart's height, and offers `headerSlot` /
  `footerSlot`.

## Design system

Tokens are defined **once** in `app/globals.css`'s `@theme` block and consumed as Tailwind utilities;
README's "Sistema visual" has the full table.

- **Token or primitive first, always.** Never hardcode a hex or an inline color; never invent a
  spacing/radius scale — reuse what the neighbours use.
- **Palette** (`--color-*`): `brand`/`brand-hover`/`brand-soft`, `canvas` vs `surface` vs
  `surface-header`/`surface-muted`/`surface-sunken`, `border`/`border-soft`/`border-faint`, the ink
  ramp `ink`→`ink-soft`→`muted`→`faint`→`faintest`, and `warning` for cuadre notices.
- **A Datos row's colour says which BLOCK of the statement it is, not how deep.**
  `--color-section-{income,cost,other}` are the accountant's own fills sampled from his workbook, and
  reach level 2 only. `lib/profit-loss/datos-sections.ts` is the one rule of which tone applies, and
  classifies with `rootSign`/`isNonOperationalCode` rather than repeating them.
- **`positive`/`negative` are the SIGN of a value, never a series colour**, and never travel alone:
  always with a `▲`/`▼` glyph and the signed value. `zero` is only the `–` of an empty cell.
- **Type:** IBM Plex Sans; IBM Plex Mono for figures, account codes and editable values. **Every
  number carries `tabular-nums`.** Sizing is fixed px. Micro-labels are
  `uppercase tracking-[0.5px] font-semibold text-faint`.
- **Shape:** radii `13px` card/table/panel · `9px` control/button · `rounded-full` chip/badge. Control
  heights are the three `Button` sizes (`toolbar` 34px · `md` 38px · `sm` h-8), so a bar control is
  `size="toolbar"`, never hand-written markup. Shadows are `rgba(15,23,42,…)`, never pure black.
  Icons from `lucide-react`.

**Charts consume `lib/charts/palette.ts` only** — no option builder writes a hex. Its hexes mirror
`@theme` on purpose (a canvas cannot resolve a CSS var); that mirror is the single allowed
duplication. The sets are DISJOINT and each answers a different job:

| Set                                     | Job                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CHART_PALETTE` (8)                     | IDENTITY. `colorForEntity` is the only way in; the slots never re-order or cycle.                                        |
| `CHART_SECTION`                         | The statement's ROOTS — a green means «ingresos» in the chart and in the table. Only when every compared code is a root. |
| `CHART_COMPOSITION_PALETTE` (6)         | A breakdown's PART, by size. Warm; `CHART_COMPOSITION_MAX` is also the fold cut.                                         |
| `CHART_DISTRIBUTION_RAMP` (5 + neutral) | A STACK's segments: parts of one figure, so colour follows size, not identity.                                           |
| `CHART_PERIOD_PALETTE` (12)             | DECORATIVE — one series with many marks (a bar per month). **Never for series.**                                         |
| `CHART_SLICE_SEQUENCE` (18)             | Composition's six then the decorative twelve: a breakdown that names ALL its parts (annex doughnut, Ventas' payers).     |
| `CHART_RANKING_SEQUENCE` (20)           | The expense ranking's fifteen bars: identity first, decorative tail.                                                     |
| `CHART_HEAT_RAMP`                       | Sequential, one hue, monotonic in lightness. Never categorical.                                                          |

Two invariants are load-bearing: **no chart declares two `yAxis`** (the `ChartOption` type forbids
it), and **the palette never cycles** — a slot past the set falls back to `CHART_NEUTRAL`.
Every set's validator numbers (lightness band, chroma, CVD ΔE, normal-vision ΔE) are written in its
docstring, so nobody re-derives them: **measure with the `dataviz` skill's validator, never by eye**,
and write the result next to the set.

## Design source

The UI was translated from a Claude Design file, "Dashboard LiderPlus.dc.html"
(claude.ai/design project `1fed77ae-29ff-439e-a0d1-f01e3b3abe5e`).

**Specs live in OpenSpec.** Every non-trivial change is specified in `openspec/` before code:
`openspec/changes/<name>/` holds the in-flight proposal/design/specs/tasks, and
`openspec/specs/<capability>/` holds the current spec a change archives into. Use the OpenSpec skills
(`/opsx:propose`, `/opsx:apply`, `/opsx:archive`) and `openspec validate <name>`. `docs/` is not for
specs: it holds the archived _why_ (`architecture.md`) and the source material the modules were built
against (`docs/payroll/`).
