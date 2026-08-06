import { EmployeeDetailView } from "@/components/payroll/employee-detail/employee-detail-view";

export default async function PayrollEmployeePage({
  params,
}: {
  params: Promise<{ periodId: string; employeeId: string }>;
}) {
  const { periodId, employeeId } = await params;
  return <EmployeeDetailView periodId={periodId} employeeId={employeeId} />;
}
