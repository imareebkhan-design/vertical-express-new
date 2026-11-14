/**
 * The staging-only checkout QA fixture (docs/release/APPROVAL_TOOL_AND_QA_FIXTURE.md
 * in the workspace). Everything it creates carries this prefix, so production can
 * exclude it by rule rather than by hoping nobody copies it there.
 */
export const QA_FIXTURE_PREFIX = "qa-staging-";
export const QA_FIXTURE_PRODUCT_SLUG = `${QA_FIXTURE_PREFIX}checkout-item`;
export const QA_FIXTURE_BRAND_SLUG = `${QA_FIXTURE_PREFIX}brand`;
export const QA_FIXTURE_SKU = "QA-STAGING-1";
export const QA_FIXTURE_APPROVER = "qa-fixture (not an owner approval)";

export function isQaFixtureSlug(slug: string): boolean {
  return slug.startsWith(QA_FIXTURE_PREFIX);
}

/** Production takes real money only through the live gateway; a QA fixture must never be public there. */
export function isLiveCommerce(env: Record<string, string | undefined> = process.env): boolean {
  return env.PAYMENT_GATEWAY === "razorpay-live";
}
