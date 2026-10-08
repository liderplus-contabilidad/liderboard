import { cn } from "@/lib/cn";

export function ExcelFileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={32}
      height={32}
      aria-hidden="true"
      className={cn("shrink-0 text-excel", className)}
    >
      <rect x={12} y={3} width={19} height={26} rx={2} fill="currentColor" opacity={0.85} />
      <path
        d="M21 8v16M16 12h11M16 17h11M16 22h11"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-white"
        opacity={0.75}
      />
      <rect x={1} y={7} width={20} height={20} rx={2} fill="currentColor" />
      <path
        d="m7 12 8 10m0-10L7 22"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="square"
        className="text-white"
      />
    </svg>
  );
}
