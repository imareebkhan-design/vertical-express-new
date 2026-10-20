import type { NextRequest } from "next/server";
import { getAdminUser } from "@/lib/services/admin/authz";
import { gcsStore } from "@/lib/services/admin/image-store";
import { handleImageUpload } from "@/lib/services/admin/image-upload-handler";

/** Upload one product photo from the admin console (lib/services/admin/image-upload-handler.ts). */
export async function POST(req: NextRequest) {
  return handleImageUpload(req, {
    admin: getAdminUser,
    store: gcsStore,
    imageBase: process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE,
  });
}
