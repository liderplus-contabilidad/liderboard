/**
 * `echarts-gl` ships no type declarations, so what the app imports from it is declared here.
 *
 * Only the TWO entry points the 3D branch of `components/ui/chart.tsx` actually registers are
 * declared, and that is deliberate: the package also carries globes, maps, GL scatter and flow
 * fields, and a wildcard `declare module "echarts-gl"` would let any of them in through a typo with
 * nothing to catch it. Adding a 3D chart type means adding its export here, the same way adding a 2D
 * one means adding it to that file's `use([…])`.
 */

/**
 * What `use()` accepts, borrowed from `echarts/core` instead of re-described: the installer type is
 * internal to the package and re-typing it by hand is how a declaration file goes quietly stale one
 * version bump later. The `Exclude` drops the ARRAY member of that parameter — `use` takes either
 * one extension or a list of them, and what these modules export is one.
 */
type EChartsInstallable = Exclude<
  Parameters<typeof import("echarts/core").use>[0],
  readonly unknown[]
>;

declare module "echarts-gl/charts" {
  /** `series: [{ type: "bar3D" }]` — see `Chart3DSeries`. */
  export const Bar3DChart: EChartsInstallable;
}

declare module "echarts-gl/components" {
  /** `grid3D` plus the three `*Axis3D` — see `ChartGrid3D`. */
  export const Grid3DComponent: EChartsInstallable;
}
