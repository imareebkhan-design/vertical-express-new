"use client";

import { adminRecordCatalogueApproval } from "@/actions/catalogue-approval";
import { ApprovalForm } from "@/components/admin/approval-form";

export function BoundApprovalForm(props: { productId: string; imageId: string; sha256: string; updatedAt: string; packSensitive: boolean }) {
  return <ApprovalForm {...props} submit={adminRecordCatalogueApproval} />;
}
