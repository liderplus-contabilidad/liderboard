/** Project linked checks as supplier obligations without copying them into Cartera. */
import { approvedFromTyped } from "./derive";
import type { BankAccount, CashFlowCenter, Check, CheckObligation } from "./types";

export function checkObligationsAt(
  checks: readonly Check[],
  date: string,
  accounts: readonly BankAccount[],
  centers: readonly CashFlowCenter[],
): CheckObligation[] {
  return checks
    .filter(
      (check) =>
        check.flowLinkedOn &&
        check.flowLinkedOn <= date &&
        !check.voided &&
        (!check.issuedOn || check.issuedOn <= date),
    )
    .map((check) => {
      const account = accounts.find((row) => row.id === check.accountId);
      const center = centers.find((row) => row.id === account?.centerId);
      const settled = check.cashedOn !== null && check.cashedOn <= date;
      return {
        id: `flow-check::${check.id}`,
        checkId: check.id,
        clientId: check.clientId,
        source: "check",
        supplier: check.payee,
        supplierTaxId: check.payeeTaxId ?? null,
        docType: "CHQ",
        docNumber: check.number || check.voucher,
        description: check.note,
        issuedOn: check.issuedOn,
        dueOn: check.expectedCashOn ?? null,
        amount: check.amount,
        withholdings: 0,
        payments: 0,
        balance: check.amount,
        centerName: center?.name ?? null,
        priority: settled ? null : (check.flowPriority ?? "urgent"),
        cash: false,
        payOn: check.flowPayOn !== undefined ? check.flowPayOn : (check.expectedCashOn ?? null),
        payFromAccountId:
          check.flowPayFromAccountId !== undefined ? check.flowPayFromAccountId : check.accountId,
        observation: "",
        approved: approvedFromTyped(check.flowApproved ?? null, check.amount),
        finalReview: false,
        notified: false,
        status: settled ? "settled" : "open",
        settledOn: settled ? check.cashedOn : null,
        cutDate: check.flowLinkedOn ?? date,
      };
    });
}
