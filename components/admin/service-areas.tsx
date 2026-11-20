"use client";

import { useRouter } from "next/navigation";
import {
  adminCreateCity,
  adminImportPincodes,
  adminIncludePincodes,
  adminSavePincode,
  adminSetCityLive,
  adminSetPincodeIncluded,
} from "@/actions/serviceability";
import { ServiceAreasView, type AreaCity } from "@/components/admin/service-areas-view";

const ACTIONS = {
  createCity: adminCreateCity,
  setCityLive: adminSetCityLive,
  includePincodes: adminIncludePincodes,
  setPincodeIncluded: adminSetPincodeIncluded,
  savePincode: adminSavePincode,
  importCsv: adminImportPincodes,
};

/** Service areas, bound to the real serviceability actions. */
export function ServiceAreas(props: { cities: AreaCity[]; warehouses: { id: string; name: string }[]; codGloballyOff: boolean }) {
  const router = useRouter();
  return <ServiceAreasView {...props} actions={ACTIONS} onDone={() => router.refresh()} />;
}
