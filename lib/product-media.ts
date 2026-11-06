/**
 * One rule for how an exact product photo is framed, on every web surface
 * (the app's copy: mobile/src/lib/product-media.ts).
 *
 * Product photos are delivered as square white display derivatives with the
 * product filling 80 % of the larger side (scripts/product-media/). So:
 *   - the frame is white whenever it holds a photo — the photo's own white
 *     background then runs into the frame and no second frame can appear (the
 *     9 Oct 2026 "beige gutters": a tinted panel round a white photo with a
 *     small product in it);
 *   - the photo is `object-contain` — never cropped, never stretched;
 *   - no padding on the photo — the derivative carries its own margin, and
 *     per-surface padding (p-1 … p-8) made the product a different size on
 *     every surface.
 * The category tint stays for products with no photo, where it frames the glyph.
 */

/** Frame background when a photo is shown. */
export const PRODUCT_PHOTO_SURFACE = "bg-white";

/** The photo itself, inside its frame. */
export const PRODUCT_PHOTO = "size-full object-contain";
