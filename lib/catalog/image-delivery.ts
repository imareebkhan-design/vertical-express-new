import manifest from "./production-image-delivery.json";

/** Delivery metadata, never an identity approval. Public callers must continue
 * selecting approvedImageWhere(). Stored URL/hash/approval provenance is unchanged.
 * GCS generations pin the exact bytes verified when this manifest was prepared.
 *
 * The manifest is empty since 19 Nov 2026: every image it mapped belonged to the
 * retired legacy catalogue and was deleted from the production bucket. Photos
 * uploaded since are stored in the production bucket directly and need no mapping.
 */
export type ImageDelivery = { id: string; sha256: string; from: string; to: string };

export const productionImageDeliveries: readonly ImageDelivery[] = manifest.images;

type DeliveryRow = { id: string; url: string; sha256: string | null };

export function createImageDeliveryResolver(entries: readonly ImageDelivery[]) {
  const deliveries = new Map(entries.map((image) => [image.id, image]));
  return function resolve(image: DeliveryRow | undefined): string | null {
    if (!image) return null;
    if (process.env.VE_DEPLOY_ENV !== "production" || process.env.PRODUCTION_IMAGE_DELIVERY !== "1") return image.url;
    const delivery = deliveries.get(image.id);
    // A changed image never inherits a previous image's delivery mapping.
    return delivery?.from === image.url && delivery.sha256 === image.sha256 ? delivery.to : image.url;
  };
}

export const productImageDeliveryUrl = createImageDeliveryResolver(productionImageDeliveries);
