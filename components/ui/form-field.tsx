import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * El campo de un formulario: rótulo arriba, control debajo, y el motivo por el que falla debajo
 * del control.
 *
 * Existe porque hasta ahora esta app no tenía ninguno —`Select` traía su propio `label` y no había
 * ningún input de texto con borde— y el alta de un empleado necesita nueve campos alineados en una
 * rejilla. El rótulo copia EXACTAMENTE el de `Select` (`text-[11px] font-semibold text-faint`) para
 * que un `Select` y un `TextField` puestos uno al lado del otro caigan en la misma línea.
 *
 * El error se pinta bajo el control y NO como tooltip: un control apagado o en rojo sin motivo
 * visible obliga a apuntarle con el ratón para saber qué le pasa — la misma razón por la que
 * `ExcelActions` rinde su `disabledReason` como pastilla al lado y no como `title`.
 */
export function FormField({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  /** El motivo por el que este campo falla, o `undefined` si no falla. */
  error?: string;
  /** Una aclaración permanente del campo, para lo que el rótulo no alcanza a decir. */
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

/** El borde y el relleno de un control de formulario — la misma caja que `Select` dibuja, para
 *  envolver un control que trae la suya (`NumericInput` es transparente por diseño). */
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
  /** `mono` para lo que se coteja carácter a carácter contra la hoja del contador: una cédula, un
   *  código sectorial. */
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
