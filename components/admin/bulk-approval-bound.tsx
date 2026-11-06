"use client";

import { adminRecordBatchApproval } from "@/actions/catalogue-approval";
import { BulkApproval, type BulkRow } from "@/components/admin/bulk-approval";

export function BoundBulkApproval({ rows }: { rows: BulkRow[] }) {
  return <BulkApproval rows={rows} submit={adminRecordBatchApproval} />;
}
