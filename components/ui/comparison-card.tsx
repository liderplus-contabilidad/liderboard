import { cn } from "@/lib/cn";
import type { ComparisonCardData } from "@/lib/workspaces";

/**
 * One of the two cards a clash dialog puts face to face: what is OPEN against what the FILES bring.
 * It is the same block in PyG and in Ocupaciones because the question is —«is this the same as what
 * I already have?»—, and the copy for the three fields already arrives written from `lib/`
 * (`describeIdentityChange` / `describeHotelChange`): this only puts it on screen.
 *
 * Both lines are truncated with their `title`: a long razón social cannot widen the card, because the
 * two are compared side by side and have to measure the same.
 */
export function ComparisonCard({
  card,
  monoDetail = false,
}: {
  card: ComparisonCardData;
  /**
   * Renders `detail` in mono. Only PyG asks for it: that is where the line carries the razón social
   * the reader checks character by character against their own file.
   */
  monoDetail?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-[9px] bg-surface-muted px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
        {card.caption}
      </p>
      <p className="mt-1 truncate text-[13px] font-bold text-ink" title={card.name}>
        {card.name}
      </p>
      <p
        className={cn("mt-0.5 truncate text-[11.5px] text-faint", monoDetail && "font-mono")}
        title={card.detail}
      >
        {card.detail}
      </p>
    </div>
  );
}
