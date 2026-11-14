-- Catalog-only products: visible in the catalogue, never purchasable.
-- Additive enum value; no row changes. Existing draft/published/archived
-- semantics are unchanged. Rollback: move any catalog_only rows back to draft;
-- the unused enum value can stay (Postgres cannot drop an enum value in place).
ALTER TYPE "ProductStatus" ADD VALUE 'catalog_only' BEFORE 'published';
