-- CreateEnum
CREATE TYPE "ImageApprovalStatus" AS ENUM ('APPROVED_EXACT', 'APPROVED_WITH_LIMITATION', 'REVIEW_REQUIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImageReviewSeverity" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "identity_approval_reason" TEXT,
ADD COLUMN     "identity_approved_at" TIMESTAMP(3),
ADD COLUMN     "identity_approved_by" TEXT,
ADD COLUMN     "identity_confirmed" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "status" SET DEFAULT 'draft';

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "approval_reason" TEXT,
ADD COLUMN     "approval_status" "ImageApprovalStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" TEXT,
ADD COLUMN     "identity_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "severity" "ImageReviewSeverity",
ADD COLUMN     "source_verified" BOOLEAN NOT NULL DEFAULT false;

-- No historical approvals are inferred or backfilled.
ALTER TABLE products ADD CONSTRAINT product_identity_review_evidence CHECK (
  NOT identity_confirmed OR (identity_approved_at IS NOT NULL
    AND length(trim(identity_approved_by)) > 0 AND identity_approved_by IS NOT NULL
    AND length(trim(identity_approval_reason)) > 0 AND identity_approval_reason IS NOT NULL)
);
ALTER TABLE product_images ADD CONSTRAINT image_identity_review_evidence CHECK (
  NOT identity_approved OR (source_verified
    AND approval_status IN ('APPROVED_EXACT', 'APPROVED_WITH_LIMITATION')
    AND (severity IS NULL OR severity IN ('P2', 'P3'))
    AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND length(trim(approved_by)) > 0
    AND approval_reason IS NOT NULL AND length(trim(approval_reason)) > 0
    AND sha256 IS NOT NULL AND sha256 ~ '^[a-f0-9]{64}$')
);

-- Approval belongs to the reviewed identity and bytes, not to an editable row id.
CREATE FUNCTION invalidate_catalogue_identity_review() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF ROW(NEW.title, NEW.brand_id, NEW.category_id, NEW.specs, NEW.unit_label)
    IS DISTINCT FROM ROW(OLD.title, OLD.brand_id, OLD.category_id, OLD.specs, OLD.unit_label) THEN
    NEW.identity_confirmed := false;
    NEW.identity_approved_at := NULL;
    NEW.identity_approved_by := NULL;
    NEW.identity_approval_reason := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invalidate_catalogue_identity_review BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION invalidate_catalogue_identity_review();

CREATE FUNCTION invalidate_catalogue_image_review() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF ROW(NEW.product_id, NEW.url, NEW.sha256, NEW.source_url, NEW.licence)
    IS DISTINCT FROM ROW(OLD.product_id, OLD.url, OLD.sha256, OLD.source_url, OLD.licence) THEN
    NEW.source_verified := false;
    NEW.identity_approved := false;
    NEW.approval_status := 'REVIEW_REQUIRED';
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.approval_reason := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invalidate_catalogue_image_review BEFORE UPDATE ON product_images
FOR EACH ROW EXECUTE FUNCTION invalidate_catalogue_image_review();
