"use client";

import { useRouter } from "next/navigation";
import {
  adminCreateDriver,
  adminCreateVehicle,
  adminReleaseDriverLogin,
  adminSetDriverActive,
  adminSetVehicleActive,
  adminUpdateDriver,
} from "@/actions/roster";
import type { RosterDetailed } from "@/lib/services/admin/roster-write";
import { DriversManagerView, type HistoryEntry } from "@/components/admin/drivers-manager-view";

export type { HistoryEntry };

const ACTIONS = {
  createDriver: adminCreateDriver,
  updateDriver: adminUpdateDriver,
  setDriverActive: adminSetDriverActive,
  releaseDriverLogin: adminReleaseDriverLogin,
  createVehicle: adminCreateVehicle,
  setVehicleActive: adminSetVehicleActive,
};

/** Drivers & vehicles, bound to the real roster actions. */
export function DriversManager({ roster, history }: { roster: RosterDetailed; history: Record<string, HistoryEntry[]> }) {
  const router = useRouter();
  return <DriversManagerView roster={roster} history={history} actions={ACTIONS} onDone={() => router.refresh()} />;
}
