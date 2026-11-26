"use client";

import { useRouter } from "next/navigation";
import { adminCreateReturn } from "@/actions/returns";
import { ReturnIntakeView, type ReturnableLine } from "@/components/admin/returns/return-intake-view";

export function ReturnIntake({ orderNo, lines }: { orderNo: string; lines: ReturnableLine[] }) {
  const router = useRouter();
  return <ReturnIntakeView orderNo={orderNo} lines={lines} create={adminCreateReturn} onDone={() => router.refresh()} />;
}
