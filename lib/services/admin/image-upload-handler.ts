import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { MAX_IMAGE_BYTES, uploadProductImage, type StoreObject } from "@/lib/services/admin/product-images";

/**
 * Upload one product photo (admin console). A route rather than a Server
 * Action because actions are capped at 1 MB and photos are larger; raising
 * the cap would raise it for every public action too.
 *
 * CSRF: the session cookie is SameSite=Lax, so a cross-site POST arrives
 * without it; and the request's Origin must also be this host.
 */

export function sameOrigin(req: Pick<NextRequest, "headers">): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "That product no longer exists",
  TOO_LARGE: "The photo is larger than 8 MB",
  NOT_AN_IMAGE: "Only JPEG, PNG or WebP photos can be uploaded",
  TOO_SMALL: "The photo is smaller than 300 px on its short side",
  UNREADABLE: "The photo could not be read",
  INVALID: "Some details are missing",
  CONFLICT: "The photo could not be attached",
  STORE_FAILED: "The photo could not be stored. Nothing was attached",
};

export async function handleImageUpload(
  req: NextRequest,
  deps: { admin: () => Promise<{ id: string; email: string } | null>; store: (imageBase: string) => StoreObject; imageBase: string | undefined }
) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Cross-site request refused" }, { status: 403 });
  const admin = await deps.admin();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  if (!deps.imageBase) return NextResponse.json({ ok: false, error: "No image store is configured on this server" }, { status: 503 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) return NextResponse.json({ ok: false, error: MESSAGES.TOO_LARGE }, { status: 413 });

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
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, error: "Choose a photo" }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ ok: false, error: MESSAGES.TOO_LARGE }, { status: 413 });

  const result = await uploadProductImage(
    {
      productSlug: text("slug"),
      bytes: new Uint8Array(await file.arrayBuffer()),
      alt: text("alt"),
      licence: text("licence"),
      sourceUrl: text("sourceUrl"),
      makePrimary: text("makePrimary") === "1",
      actor: { id: admin.id, email: admin.email },
    },
    { store: deps.store(deps.imageBase), imageBase: deps.imageBase }
  );
  if (!result.ok) {
    const detail = result.code === "INVALID" || result.code === "CONFLICT" ? `: ${result.detail}` : "";
    return NextResponse.json({ ok: false, error: (MESSAGES[result.code] ?? "Upload failed") + detail }, { status: 400 });
  }
  revalidatePath(`/admin/products/${text("slug")}`);
  revalidatePath("/admin/catalogue-approvals");
  return NextResponse.json(result);
}

