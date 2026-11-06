import "server-only";
import { getStorage } from "firebase-admin/storage";
import { adminApp } from "@/lib/auth/firebase-admin";
import { bucketFromImageBase, type StoreObject } from "@/lib/services/admin/product-images";

/**
 * Writes a product photo to the configured image bucket with the Firebase
 * Admin credentials. Objects are named by their SHA-256, so they are written
 * once and never replaced (`ifGenerationMatch: 0`); finding one already there
 * means the same bytes were uploaded before, which is success.
 *
 * Needs `roles/storage.objectCreator` on that bucket for the Admin service
 * account — create only, no overwrite or delete.
 */
export function gcsStore(imageBase: string): StoreObject {
  const bucket = getStorage(adminApp()).bucket(bucketFromImageBase(imageBase));
  return async (path, bytes, contentType) => {
    try {
      await bucket.file(path).save(Buffer.from(bytes), {
        resumable: false,
        contentType,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { cacheControl: "public, max-age=31536000, immutable" },
      });
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 412) return; // already stored: identical content by construction
      throw e;
    }
  };
}
