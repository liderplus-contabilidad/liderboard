import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A form field: label on top, control below, and the reason it fails under the control.
 *
 * It exists because until now this app had none —`Select` brought its own `label` and there was no
 * bordered text input— and creating an employee needs nine fields aligned in a grid. The label copies
 * `Select`'s EXACTLY (`text-[11px] font-semibold text-faint`) so a `Select` and a `TextField` placed
 * side by side fall on the same line.
 *
 * The error is painted under the control and NOT as a tooltip: a control switched off or in red with
 * no visible reason forces you to point at it with the mouse to know what is wrong — the same reason
 * `ExcelActions` renders its `disabledReason` as a pill beside it and not as a `title`.
 */
export function FormField({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  /** The reason this field fails, or `undefined` if it does not. */
  error?: string;
  /** A permanent clarification of the field, for what the label cannot say. */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block text-[11px] font-semibold text-faint", className)}>
      {label}
      <span className="mt-1.5 block font-normal">{children}</span>
      {error ? (
        <span className="mt-1 block text-[11px] font-normal text-negative">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-[11px] font-normal text-faint">{hint}</span>
      )}
    </label>
  );
}

/** The border and padding of a form control — the same box `Select` draws, for wrapping a control
 *  that brings its own (`NumericInput` is transparent by design). */
export function FieldBox({
  invalid = false,
  children,
}: {
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex w-full items-center rounded-lg border bg-surface px-[9px] py-2 text-[13px] transition-colors focus-within:border-brand",
        invalid ? "border-negative" : "border-border",
      )}
    >
      {children}
    </span>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  /** `mono` for what is checked character by character against the accountant's sheet: a cédula, a
   *  sector code. */
  variant?: "sans" | "mono";
  fieldClassName?: string;
}

export function TextField({
  label,
  error,
  hint,
  variant = "sans",
  fieldClassName,
  className,
  ...props
}: TextFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} className={fieldClassName}>
      <input
        className={cn(
          "w-full rounded-lg border bg-surface px-[9px] py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand",
          variant === "mono" ? "font-mono tabular-nums" : "font-sans",
          error ? "border-negative" : "border-border",
          className,
        )}
        {...props}
      />
    </FormField>
  );
}
