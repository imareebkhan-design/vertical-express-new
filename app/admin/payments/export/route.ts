import { handleLedgerExport } from "@/lib/services/admin/ledger-export";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleLedgerExport(request);
}
