import type { ReturnStatus } from "@/prisma/generated/client/client";

/**
 * The return request state machine — review states only. Nothing here moves
 * money or stock: the refund, restock and exchange steps wait for the owner's
 * return policy. Pure.
 */
export const RETURN_FLOW: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["under_review", "rejected"],
  under_review: ["inspecting", "approved", "rejected"],
  inspecting: ["approved", "rejected"],
  approved: ["closed"],
  rejected: ["closed"],
  closed: [],
};

export function canMoveReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return RETURN_FLOW[from].includes(to);
}

/** Approving or rejecting is a decision, and a decision records its reason. */
export function needsDecisionNote(to: ReturnStatus): boolean {
  return to === "approved" || to === "rejected";
}

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  requested: "Requested", under_review: "Under review", inspecting: "Inspecting", approved: "Approved (no refund yet)",
  rejected: "Rejected", closed: "Closed",
};
export const RETURN_REASON_LABEL: Record<string, string> = {
  damaged_in_transit: "Damaged in transit", wrong_item: "Wrong item", defective: "Defective", short_quantity: "Short quantity",
  not_needed: "No longer needed", other: "Other",
};
