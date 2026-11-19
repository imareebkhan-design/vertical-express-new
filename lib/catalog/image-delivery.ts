import manifest from "./production-image-delivery.json";

export type ImageDelivery = { id: string; sha256: string; from: string; to: string };
type DeliverableImage = { id: string; url: string; sha256: string | null };

/** Delivery metadata, never an identity approval. Public callers must continue
 * selecting approvedImageWhere(). Stored URL/hash/approval provenance is unchanged.
 * GCS generations pin the exact bytes verified when this manifest was prepared.
 *
 * Empty since 19 Nov 2026: every mapped image belonged to the retired catalogue; its rows and its
 * production-bucket copies were deleted (docs/runbooks/CATALOGUE_RESET.md → "Photos removed").
 * Photos uploaded since are stored in the production bucket directly and need no mapping.
 */
export const productionImageDeliveries: readonly ImageDelivery[] = manifest.images;

/** Builds the URL resolver over a delivery list; exported so tests can exercise the rules with a fixture. */
export function deliveryUrlResolver(entries: readonly ImageDelivery[]) {
  const deliveries = new Map(entries.map((image) => [image.id, image]));
  return function deliveryUrl(image: DeliverableImage | undefined): string | null {
    if (!image) return null;
    if (process.env.VE_DEPLOY_ENV !== "production" || process.env.PRODUCTION_IMAGE_DELIVERY !== "1") return image.url;
    const delivery = deliveries.get(image.id);
    // A changed image never inherits a previous image's delivery mapping.
    return delivery?.from === image.url && delivery.sha256 === image.sha256 ? delivery.to : image.url;
  };
}

export const productImageDeliveryUrl = deliveryUrlResolver(productionImageDeliveries);
