# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

**Vitest** is configured but runs ONLY the pure layer (`lib/**/*.test.ts`, e.g.
`lib/profit-loss/`, `lib/charts/`); there are no component/jsdom tests.

CI (`.github/workflows/ci.yml`) runs four independent jobs on PRs and pushes to
`main`: `pnpm lint`, `pnpm fmt:check`, `pnpm build`, `pnpm test`. A husky pre-commit
hook runs `lint-staged` (oxlint --fix + oxfmt on staged files).

## Toolchain gotchas

- **Linting/formatting is oxc, not ESLint/Prettier.** `pnpm lint` runs `oxlint`;
  `pnpm fmt` runs `oxfmt`. Running `eslint`/`prettier` directly will fail — they
  are not installed. oxlint config is `.oxlintrc.json` (only the `correctness`
  category is set to error).
- oxlint enforces `next/no-assign-module-variable`: never name a local `module`
  (use `mod`).
- **Tailwind CSS v4, CSS-first.** There is no `tailwind.config.js`. Theme lives in
  `app/globals.css` via `@import "tailwindcss"` + an `@theme { … }` block.
- **ECharts measures text on a canvas**, where a CSS variable cannot resolve — so a font stack
  written as `var(--font-ibm-plex-sans)` is silently measured against a narrower fallback and
  every width-capped axis label truncates to a box that renders wider than its own cap (labels
  clipped at the _start_). `components/ui/chart.tsx` reads the generated family off `:root` and
  substitutes it before `setOption`; keep any new text sizing on that path.
- TypeScript is `strict`; import alias `@/*` maps to the repo root (e.g.
  `@/lib/modules`).
- Vitest covers only the pure layer under `lib/` (parse/derive/persistence, the analytics
  engine, the palette and the chart-option builders) — no jsdom/component tests; config in
  `vitest.config.ts`.

## Code conventions

- **Prefer reusable functions.** Extract anything general-purpose (formatters, constants,
  pure utils) into `lib/` and import via `@/*` — don't re-implement the same logic across
  components. Amounts format through `lib/format.ts` (`formatCurrency` = Ecuador USD `$`),
  month labels via `lib/date.ts`. Only helpers tied to one module's domain stay in that
  module.
- **Reuse primitives + tokens first.** Reach for `components/ui/*` and the `@theme`
  color/font tokens before writing ad-hoc markup or hardcoding hex.
- **Prop-driven components.** Pass data in so a component fills from real data later, and
  render a sensible empty state when it's absent (Excel-sourced views do this today).
- **Small client boundary.** Server Components by default; add `"use client"` only where
  local state/interactivity needs it.
- **Optimize for performance by default.** Keep renders cheap: `React.memo` list/row
  components with stable keys and callbacks (`useCallback`), wrap expensive derivations in
  `useMemo`, and lean on CSS (`content-visibility`) over JS where it fits. Reach for
  heavier tooling (e.g. row virtualization) only when data volumes justify it — don't add
  it speculatively.
- **Match the surrounding code.** Follow existing naming, style, and comment density;
  comments explain the _why_. UI copy in Spanish, identifiers/slugs in English.

## Architecture

Next.js **App Router**. Server Components by default — keep the client boundary
small; only files that need `usePathname`/local state are marked `"use client"`.

**Shell + routing.** `app/page.tsx` redirects `/` to the default module.
`app/(dashboard)/` is a route group whose `layout.tsx` renders the persistent
shell (`<DashboardSidebar/>` + `<DashboardHeader/>` + `<main>`). Because App Router
layouts persist across navigation, the sidebar's collapse state (local `useState`)
survives switching modules without any global store or localStorage. Each module is
a static page at `app/(dashboard)/<slug>/page.tsx`.

**Module registry is the single source of truth.** `lib/modules.ts` exports the
ordered `MODULES` array (`{ slug, label, title, icon, tabs }`) plus `DEFAULT_MODULE`
and `findModuleBySlug()`. Both the sidebar nav and the header breadcrumb/title derive
from it — there is no duplicated module list. **To add a module:** add an entry to
`MODULES` and create the matching `app/(dashboard)/<slug>/page.tsx`. Route slugs are
English; the Spanish name goes in `label`/`title`.

**Components.** Reusable primitives live in `components/ui/` — prefer them over ad-hoc
markup. Module-specific compositions live in `components/<module>/` (`components/profit-loss/`,
`components/occupancy/`). `ModuleTabs` holds a `MODULE_VIEWS` registry of per-module
`rightSlot`/`toolbar`/`panel`; a module absent from it renders `ComingSoon`, so adding one is
purely additive; `ModuleTabs` also owns the `rightSlot`'s vertical alignment, so the same
component works outside the bar. **Excel actions are one component for the whole app**:
`components/ui/excel-actions.tsx` renders `Cargar Excel` · `Descargar Excel` · optional `ⓘ`, and
a module only writes a thin wrapper (`<module>-excel-actions.tsx`) that wires its provider and
upload modal — never its own button markup. The FORM of the download control is derived from how
many options it gets (one → plain button, two or more → menu), never declared; `busy`, the error
panel and the reentrancy guard live in the primitive, so a module supplies just
`run: () => Promise<void>` plus `disabled`/`disabledReason`. Live gallery at
`/docs/components#excel-actions`. **Module state never lives there** — each data provider is mounted in the
dashboard layout, because the header reads from the same state the panel does (`ActiveClient`
shows PyG's empresa and Ocupaciones' hotel). PyG › Datos now loads real Excel data: `lib/profit-loss/` holds
the pure parse/derive/export layer plus Dexie (IndexedDB) persistence, and
`PygDataProvider` — mounted in the dashboard layout — shares `dataset`/`edits`/
`frequency` between the header (`ActiveClient`) and the Datos content. `DatosView`
renders the Estado de Resultados table (account tree, sortable months + Total, cell
edit/comment); editing/commenting is monthly-view-only. The Datos toolbar downloads
the edited state or a seeded blank template via `exceljs` (`export.ts`, dynamic
import); the "con tus datos" file re-uploads cleanly and restores its comments from a
hidden metadata sheet. Only leaf (movement) accounts
edit their value; parent accounts comment-only. **Cost centers** are supported: a staging
upload modal (`cost-center-upload-modal.tsx`) accepts several files at once (monthly
sucursal statements + the annual `consolidado`), grouped by each file's internal
`Centro de Costo:` line — never by filename (the real exports prove filenames unreliable).
`workspace.ts` assembles them into a multi-dataset workspace (Dexie v2 + a `meta` singleton)
and validates cuadres. `parse.ts` routes consolidated files via
`parseWorkbook`/`parseConsolidatedWorkbook` instead of rejecting them; the multi-center
download writes one sheet per center + the Consolidado (`buildMultiCenterWorkbook`).
**Account ficha:** each account row exposes a hover "ficha" trigger (own column, `sticky
right-0` so it survives horizontal scroll) that opens `AccountDetailPanel` in a `SidePanel`.
The panel runs ONE analytics query for the account and formats `buildAccountDetail`
(`lib/profit-loss/charts/account-detail.ts`, pure + tested): total, active-vs-covered periods,
average of active periods, best period, share of parent, last-period variation, plan level. It
inherits the engine's coverage (a `null` never counts as `0`), follows the active frequency (no
chart in Anual), reuses `barOption`+`ChartCard`, and skips only the derived «Utilidad» row.

**Segmentar utilidad** splits the statement into operating and non-operating. A button under the
Datos card (`segment-actions.tsx`) copies the **5.2** subtree as root **6**, re-levelling the code
(`5.2.1.1 → 6.1.1`), keeping each account's name and zeroing every value, across EVERY dataset in
one transaction (`segmentWorkspace` in `db.ts`; the Consolidado re-sums itself). It is ONE-WAY, so
the control disappears once there is nothing left to segment instead of sitting disabled — and the
presence of root 6 IS the flag, so there is no dataset field to migrate. `lib/profit-loss/
segment.ts` (pure + tested) owns the rules: the 5.2→6 mapping, `twinCode` (6.1.1 ↔ 5.2.1.1) and
`twinWriteFor`, which is what makes the pair hold — writing a non-operating amount ALSO writes its
twin inside 5.2, discounted **by difference** against what the twin holds right now, so a manual
correction on 5.2 survives and re-typing a cell moves only the delta. Section 5 keeps behaving
exactly as before (still editable); nothing clamps, so over-classifying leaves the twin negative.
`computeResult` now returns the split (`operating`/`nonOperating`/`expenses`/`values`) and
`toDatosGrid` emits ONE «Utilidad o Pérdida» row unsegmented, four summaries segmented — each
`anchorCode`d to the block it closes, an anchor `flattenSorted` honors only while unsorted (a
month sort reorders the roots, so every summary falls to the end). Because 6 takes what 5 gives
up, **the exercise's result never moves** — only its split does. `rootSign` in `derive.ts` is the
ONE sign definition (4 adds, 5 and 6 subtract) and `analytics/series.ts` re-exports it, so the
cascade follows; `expenseRootsOf` in `charts/presets.ts` reads the expense roots off the SOURCE so
the tiles and the ranking don't shrink by whatever was reclassified.

**Ocupaciones (hotel occupancy).** `lib/occupancy/` is the pure layer — `parse.ts` reads the
`OCUPACION_*.xlsx` exports (month blocks stacked on one sheet), `derive.ts` builds the daily
grid, `export.ts` writes a file that re-imports cleanly, `db.ts` persists in Dexie. **A record
is one SUCURSAL-YEAR**, keyed `[centerId+year]`: the accountant exports one workbook per
sucursal per year, and the file declares its own hotel and cost center on two lines under the
title (read BY POSITION; a file with no cost-center line falls into the reserved `principal`).
A record stores ONLY raw inputs — ADR, ocupación, RevPAR, PAX and every total are recomputed,
and an imported month is shown VERBATIM until its first edit, which flips the whole month to
computed at once. `consolidate.ts` sums the sucursales of a year into a synthetic read-only
dataset: **raw inputs only**, so `derive.ts` recomputes the indicators as ratios of sums (the
one definition under which ADR × Ocupación = RevPAR survives the sum); it is never stored and
never shown verbatim. Uploads go through `occupancy-upload-modal.tsx`, a staging modal shaped like
PyG's: it parses each file as it is dropped, lists the sucursal-año it declares (or why it
failed), and hands the provider an already-parsed selection (`importParsed`) — so the provider
keeps the rules and the modal owns reading files. `addFiles` materializes the `FileList` BEFORE
its first `await`, because clearing `input.value` empties the live list. Uploads are still
two-phase — every file is parsed before anything is written, so the "all files from one hotel"
check cannot half-apply; it is enforced in the modal (which can still explain itself) and kept in
the provider, which is what writes. Files from another hotel raise a replace confirmation,
rendered by `OccupancyDataProvider` itself because the upload button lives in the tab bar. Datos stacks three strips, **Sucursal → Año → Mes**; the sucursal strip
renders nothing with a single sucursal, and the Consolidado tab appears only with two or more.
The MES strip ends in an **«Año»** button: `toAnnualGrid` returns the same `OccupancyGrid` with
one column per month instead of per day (the type speaks in `columns`/`columnLabels`/`scope`,
never in days), always computed and always read-only — a month's cell is an aggregate of days,
and «Habitaciones disponibles» sums habitaciones-noche there because that is what the occupancy
of each month divides by. Both axes compose: the year of a sucursal, or the year of the
Consolidado.

**Ocupaciones › Gráficos** mirrors PyG's shape with its own engine: `lib/occupancy/filters.ts`
holds the marks, `charts/selection.ts` is the ONE translation into an `OccupancyQuery`,
`analytics/series.ts` builds the series and `charts/option.ts` turns them into options. The
métrica is **single-choice** (ocupación is %, ADR is $, PAX is a count — two units in one card
would need the second `yAxis` the types forbid); what compares is the sucursales, años and
periodos marked, exactly as in PyG. «Ver por» switches the axis between months and days; it is
the ONLY control read by a single card (`query.scope` reaches just `analytics/series.ts` — the
KPIs, heatmap, canales and weekday cards aggregate the marked period whatever the axis), so it
sits in that card's own header via `ChartCard`'s `headerSlot` and NOT in the filter bar, where
every control feeds every card. A marked periodo NARROWS that axis rather than adding series — in two levels, months and days of
the month, so «Manor, 2025 y 2026, enero, día 5» is two bars over a single column. A day mark
drops «Ver por» to días by itself, and a comparison narrow enough to fit a few columns is drawn
as grouped bars because a line of one point draws nothing. Coverage carries over: a month the
workspace never received is `null`, a day inside a covered month that sold nothing is `0`.
**Drill-down** has two moves: clicking a month's bar writes `months=[m]` + `scope="dia"` into the
same filter bar (undo = remove the chip), while clicking a heatmap day opens the `SidePanel` and
touches nothing. The heatmap is deliberately NOT an ECharts chart — one grid per marked
sucursal-year, all sharing one scale so a tone means the same thing in both — and it is the only
consumer of the sequential `CHART_HEAT_RAMP`, which is separate from the categorical palette.
`filters.ts` also owns `periodLabel`/`describeSelection`, the plain-Spanish wording of the
selection: the bar carries a «Mostrando …» line and every KPI and card subtitle reads its period
from there, so nothing says «Enero» under a «5 de enero». When the axis collapses to ONE column
the option builder swaps what the axis means — each series becomes a labelled bar and the date
moves to the subtitle, because two bars under a single «5 ene» would read as the same date.
Datos keeps its own three strips: those answer «cuál edito», the bar answers «cuáles comparo»,
and the bar falls back to whatever Datos has open.

**PyG's filter bar is the module's only selection surface.** `pyg-toolbar.tsx` renders, in
order, Cuenta contable · Nivel · Centro de costo · Periodo, "Ver por" pinned right, and an
active-filter chip strip (`active-filter-chips.tsx`) below — reflected identically by Datos,
Gráficos and Análisis, with no second place (no "Comparar" box, no Datos-only center pills) to
pick the same things differently. The comparison axis is never declared: marking several
accounts and/or several centers is itself what produces a comparison, so `lib/profit-loss/
filters.ts` holds one flat `PygFilters` (`codes`/`centerIds`/`periods`), pure toggles kept in
universe order (not click order), `sanitizeFilters` (pruned on read, never in an effect) and
`resolveActiveCenterId`/`canEditActiveCenter` — the center Datos reads and edits is _derived_:
none or several centers marked resolves to the Consolidado (read-only), exactly one resolves to
that center. `center-filter.tsx` and `period-filter.tsx` render the last two dropdowns;
`center-filter.tsx` renders nothing in single-statement mode. Marking accounts also intersects
every structural card's fixed universe (composition, ranking, cascada, Análisis' three defaults)
instead of being ignored by them, and marking periods bounds Datos' visible columns (its Total
column stays the full-year sum regardless, relabeled "Total año" while a period mark is active).
`PygDataProvider` owns the filters and never imports from `charts/`.

**Charts.** `lib/profit-loss/analytics/` is the pure engine (series with coverage, the
temporal/structure/variation transforms). Everything above it is also pure and tested:
`lib/charts/` holds the eight-slot palette + mark constants (`colorForEntity` is the only way a
series gets a color) and the `ChartOption` types this app writes — declared locally so `lib/`
never imports the renderer; `lib/profit-loss/charts/` holds `sources.ts` (workspace views →
`AnalyticsSource`, identity taken from the VIEW), `selection.ts` (`PygFilters` → `SeriesQuery`
and → color resolver — no dimension/cross model, the axis is read off which lists are
populated), `option.ts` (one builder per chart type, `Series[]` → option) and `presets.ts` (the
default views, built through the same `toSeriesQuery`/`presetQuery` every card uses, plus
`intersectWithMarked` for the structural ones). Components are mount only:
`components/ui/chart.tsx` is the sole `echarts.init` caller (partial imports from
`echarts/core`, SVG renderer), `PygAnalyticsProvider` (nested inside `PygDataProvider`) now
holds only the presentation half — `transform`/`chartType`/`sources`/`colorOf`/`runQuery` — and
`components/profit-loss/charts/` renders the cards. **If a chart component grows logic worth
testing, that logic belongs in `lib/`.** Two invariants are load-bearing: no chart declares two
`yAxis` (the `ChartOption` type forbids it), and the palette never cycles — queries cap at
`CHART_MAX_SERIES` (8) and the engine reports what it truncated.

## Design system

Tokens are defined **once** in `app/globals.css`'s `@theme` block and consumed as Tailwind
utilities. README's "Sistema visual" has the full table; the normative rules for writing new
UI are:

- **Token or primitive first, always.** Reach for `components/ui/*` and a `@theme` token before
  writing markup. **Never** hardcode a hex or an inline color; **never** invent a spacing/radius
  scale — reuse what the neighbours use.
- **Palette** (`--color-*`): `brand`/`brand-hover`/`brand-soft` (primary action, active), `canvas`
  (app bg) vs `surface` (cards/tables) vs `surface-header`/`surface-muted`/`surface-sunken`,
  `border`/`border-soft`/`border-faint` (increasingly faint separators), the ink ramp
  `ink`→`ink-soft`→`muted`→`faint`→`faintest`, and `warning` for cuadre notices.
- **`positive`/`negative` are the SIGN of a value, never a series color.** They never travel
  alone: always with a `▲`/`▼` glyph and the signed value, because color alone is not a reading
  for everyone. `zero` is only the `–` of an empty cell.
- **Type:** IBM Plex Sans (`font-sans`); IBM Plex Mono (`font-mono`) for figures, account codes
  and editable values. **Every number carries `tabular-nums`.** Sizing is fixed px (desktop-only
  density), not `rem`. Micro-labels are `uppercase tracking-[0.5px] font-semibold text-faint`.
- **Shape:** radii `13px` card/table/panel · `9px` toolbar control/button · `rounded-full`
  chip/badge. Control heights are the three `Button` sizes — `toolbar` `34px`, `md` `38px`,
  `sm` `h-8` — so a bar control is `size="toolbar"`, never hand-written markup. Shadows are always
  `rgba(15,23,42,…)`, never pure black. Icons from `lucide-react`.
- **Charts consume `lib/charts/palette.ts` only** — `colorForEntity` is the one way a series gets
  a color, the eight slots never re-order or cycle, and no option builder writes a hex. The
  palette hexes deliberately mirror `@theme` (a canvas can't resolve a CSS var); that mirror is
  the single allowed duplication.

**Reusable side panel.** `components/ui/side-panel.tsx` is a right-anchored, non-modal drawer
(no scrim, Escape/outside-click to close, focus in on open and back to the opener on close). It's
what the PyG account ficha mounts on; reuse it for any future lateral detail view rather than
building another.

## Design source

The UI was translated from a Claude Design file, "Dashboard LiderPlus.dc.html"
(claude.ai/design project `1fed77ae-29ff-439e-a0d1-f01e3b3abe5e`).

**Specs live in OpenSpec, not `docs/`.** Every non-trivial change is specified in `openspec/`
before code: `openspec/changes/<name>/` holds the in-flight proposal/design/specs/tasks, and
`openspec/specs/<capability>/` holds the current spec a change archives into. Use the OpenSpec
skills (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`) and `openspec validate <name>`. The
older `docs/superpowers/specs/` tree is historical only — do not add new specs there.
