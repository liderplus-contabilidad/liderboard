import { formatNumber } from "@/lib/format";

/**
 * What an upload says once it has WRITTEN — the body of every «Carga completa». One shape for every
 * module because the question is always the same two: how much came in (`UploadFigures`) and what
 * it covers (`UploadChips`). A sentence that enumerates forty-four months answers neither at a
 * glance, which is what this replaced.
 *
 * Server-safe on purpose: no state, no handlers. Warnings stay a `NoticeBanner` beside these.
 */
export function UploadSummary({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

export interface UploadFigure {
  label: string;
  value: number;
}

/** The counts of what was written, side by side. Up to three read well in a 560 px modal. */
export function UploadFigures({ figures }: { figures: readonly UploadFigure[] }) {
  if (figures.length === 0) {
    return null;
  }
  return (
    <dl className="flex gap-3">
      {figures.map((figure) => (
        <div
          key={figure.label}
          className="min-w-0 flex-1 rounded-[13px] border border-border-soft bg-surface-muted px-4 py-3"
        >
          <dt className="text-[10.5px] font-semibold tracking-[0.5px] text-faint uppercase">
            {figure.label}
          </dt>
          <dd className="mt-1 font-mono text-[22px] font-semibold text-ink tabular-nums">
            {formatNumber(figure.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What the upload covers, as chips: the periods (already collapsed into runs by
 * `monthRangeLabels`), the years, the sections. `note` is the line under them for what the chips
 * imply and do not say. Renders nothing with no items.
 */
export function UploadChips({
  label,
  items,
  note,
}: {
  label: string;
  items: readonly (string | number)[];
  note?: string;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div>
      <h3 className="text-[10.5px] font-semibold tracking-[0.5px] text-faint uppercase">{label}</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-soft tabular-nums"
          >
            {item}
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-[11.5px] text-faint">{note}</p>}
    </div>
  );
}
