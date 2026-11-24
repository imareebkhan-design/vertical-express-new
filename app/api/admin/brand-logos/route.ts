import type { NextRequest } from "next/server";
import { getAdminUser } from "@/lib/services/admin/authz";
import { gcsStore } from "@/lib/services/admin/image-store";
import { handleBrandLogoUpload } from "@/lib/services/admin/brand-logo-upload-handler";

/** Upload one brand logo from the admin console (lib/services/admin/brand-logos.ts). */
export async function POST(req: NextRequest) {
  return handleBrandLogoUpload(req, {
    /* Called here, not passed by reference: lib/__tests__/admin-authorization.test.ts
       sweeps every route file for its own admin check. */
    admin: () => getAdminUser(),
    store: gcsStore,
    imageBase: process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE,
  });
}
