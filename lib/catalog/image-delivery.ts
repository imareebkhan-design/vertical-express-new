import manifest from "./production-image-delivery.json";

/** Delivery metadata, never an identity approval. Public callers must continue
 * selecting approvedImageWhere(). Stored URL/hash/approval provenance is unchanged.
 * GCS generations pin the exact bytes verified when this manifest was prepared.
 */
export const productionImageDeliveries = manifest.images;
const deliveries = new Map(productionImageDeliveries.map((image) => [image.id, image]));

export function productImageDeliveryUrl(image: { id: string; url: string; sha256: string | null } | undefined): string | null {
  if (!image) return null;
  if (process.env.VE_DEPLOY_ENV !== "production" || process.env.PRODUCTION_IMAGE_DELIVERY !== "1") return image.url;
  const delivery = deliveries.get(image.id);
  // A changed image never inherits a previous image's delivery mapping.
  return delivery?.from === image.url && delivery.sha256 === image.sha256 ? delivery.to : image.url;
}
