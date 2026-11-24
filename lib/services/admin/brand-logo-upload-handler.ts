import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { sameOrigin } from "@/lib/services/admin/image-upload-handler";
import { MAX_LOGO_BYTES, uploadBrandLogo } from "@/lib/services/admin/brand-logos";
import type { StoreObject } from "@/lib/services/admin/product-images";

/**
 * Upload one brand logo (admin console, issue #7). A route rather than a Server
 * Action for the same reason as product photos: actions are capped at 1 MB.
 * CSRF: same-origin check plus the SameSite=Lax session cookie.
 */
const MESSAGES: Record<string, string> = {
  NOT_FOUND: "That brand no longer exists",
  TOO_LARGE: "The logo is larger than 2 MB",
  NOT_AN_IMAGE: "Only JPEG, PNG or WebP logos can be uploaded (no SVG)",
  TOO_SMALL: "The logo is smaller than 64 px on its short side",
  UNREADABLE: "The logo could not be read",
  RIGHTS_REQUIRED: "Confirm that the business may use this logo",
  LICENCE_REQUIRED: "Say which licence or agreement the logo is used under",
  BAD_SOURCE: "The source link must be a web address (https://…)",
  STORE_FAILED: "The logo could not be stored. Nothing was changed",
};

export async function handleBrandLogoUpload(
  req: NextRequest,
  deps: { admin: () => Promise<{ id: string; email: string } | null>; store: (imageBase: string) => StoreObject; imageBase: string | undefined }
) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Cross-site request refused" }, { status: 403 });
  const admin = await deps.admin();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  if (!deps.imageBase) return NextResponse.json({ ok: false, error: "No image store is configured on this server" }, { status: 503 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_LOGO_BYTES + 64 * 1024) return NextResponse.json({ ok: false, error: MESSAGES.TOO_LARGE }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "The upload could not be read" }, { status: 400 });
  }
  const file = form.get("file");
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, error: "Choose a logo file" }, { status: 400 });
  if (file.size > MAX_LOGO_BYTES) return NextResponse.json({ ok: false, error: MESSAGES.TOO_LARGE }, { status: 413 });

  const result = await uploadBrandLogo(
    {
      brandSlug: text("slug"),
      bytes: new Uint8Array(await file.arrayBuffer()),
      rightsConfirmed: text("rightsConfirmed") === "1",
      licence: text("licence"),
      sourceUrl: text("sourceUrl"),
      actor: { id: admin.id, email: admin.email },
    },
    { store: deps.store(deps.imageBase), imageBase: deps.imageBase }
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: MESSAGES[result.code] ?? "Upload failed" }, { status: result.code === "NOT_FOUND" ? 404 : 400 });
  }
  revalidatePath("/admin/brands");
  revalidatePath("/admin/listing");
  return NextResponse.json(result);
}
