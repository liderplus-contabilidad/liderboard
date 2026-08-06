import { PeriodDetailView } from "@/components/payroll/period-detail/period-detail-view";

export default async function PayrollPeriodPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  return <PeriodDetailView periodId={periodId} />;
}
