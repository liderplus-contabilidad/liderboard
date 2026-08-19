import type { PayrollEmployeeLine } from "@/lib/payroll/types";

interface EmployeeIdentityCardsProps {
  /** El nombre que el usuario le puso al cliente — NO la razón social del archivo, que este módulo
   *  nunca compara contra nada (misma regla que PyG y Ocupaciones).
   *
   *  Los DATOS DE LA EMPRESA no entran aquí, y es deliberado: se probaron —razón social, ubicación
   *  y teléfonos bajo el nombre— y esta ficha pasó de cuatro líneas a ocho para repetir algo que en
   *  pantalla no se usa. El membrete existe para el papel, así que vive donde se imprime: el
   *  comprobante en PDF y el Excel del período. */
  clientName: string;
  /** El centro de costo del empleado. `null` mientras la ficha no lo declare: no es «GENERAL», es
   *  «no hay». */
  costCenter: string | null;
  employee: PayrollEmployeeLine;
}

/**
 * Las dos fichas de identidad del rol: de quién es la nómina y de quién es el sueldo. Van juntas y
 * en paralelo porque el comprobante del contador las imprime así — un rol se lee identificando las
 * dos partes antes que ninguna cifra.
 *
 * Los datos van en TEXTO CORRIDO con su prefijo dentro («C.C. 1714097084»), no en pares de rótulo
 * y valor: son tres líneas de una ficha, no una tabla de dos columnas, y un rótulo en
 * micro-mayúsculas sobre cada dato pesaría más que el dato.
 *
 * El ÁREA se pinta del lado del empleador y no del empleado: es el bloque del rol (ADMINISTRACION,
 * HOSPEDAJE, COCINA…) bajo el que la empresa agrupa el gasto, y lo que lo hace legible es leerlo
 * junto al centro de costo.
 */
export function EmployeeIdentityCards({
  clientName,
  costCenter,
  employee,
}: EmployeeIdentityCardsProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 p-5">
      <div className="rounded-[11px] border border-border px-[18px] py-4">
        <p className="truncate text-[14px] font-bold text-brand">{clientName}</p>
        <div className="mt-1.5 text-[12px] leading-[1.7] text-muted">
          <p>Empleador · nómina mensual</p>
          <p className="truncate">Área: {employee.area}</p>
          <p className="truncate">Centro de costo: {costCenter ? costCenter : "—"}</p>
        </div>
      </div>

      {/* El avatar va a la DERECHA: en esta ficha lo primero que se lee es el nombre, y una inicial
          delante de él lo desplaza sin añadir nada que el nombre no diga ya. */}
      <div className="flex items-start gap-3.5 rounded-[11px] border border-border px-[18px] py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-brand">{employee.name}</p>
          <div className="mt-1.5 text-[12px] leading-[1.7] text-muted">
            <p className="truncate">C.C. {employee.idCard}</p>
            <p className="truncate">{employee.role}</p>
            <p className="truncate">Cód. sectorial {employee.sectorCode}</p>
          </div>
        </div>
        <InitialAvatar name={employee.name} />
      </div>
    </div>
  );
}

/** La inicial del empleado. Un nombre vacío nunca debería llegar, pero si llega vale más una caja
 *  con «?» que una caja rota. */
function InitialAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-[16px] font-bold text-brand"
    >
      {initial}
    </span>
  );
}
