-- Commercial approval is tied to the reviewed identity and offer. Inventory
-- movements and descriptive image metadata do not revoke unrelated approvals.
CREATE FUNCTION invalidate_catalogue_commercial_review() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF ROW(NEW.title, NEW.brand_id, NEW.category_id, NEW.specs, NEW.unit_label, NEW.delivery_speed)
    IS DISTINCT FROM ROW(OLD.title, OLD.brand_id, OLD.category_id, OLD.specs, OLD.unit_label, OLD.delivery_speed) THEN
    NEW.commercial_review := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invalidate_catalogue_commercial_review BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION invalidate_catalogue_commercial_review();

CREATE FUNCTION invalidate_variant_commercial_review() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF ROW(NEW.product_id, NEW.sku, NEW.name, NEW.attributes, NEW.is_default, NEW.is_active, NEW.price_paise, NEW.compare_at_paise)
    IS DISTINCT FROM ROW(OLD.product_id, OLD.sku, OLD.name, OLD.attributes, OLD.is_default, OLD.is_active, OLD.price_paise, OLD.compare_at_paise) THEN
    UPDATE public.products SET commercial_review = NULL WHERE id IN (OLD.product_id, NEW.product_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invalidate_variant_commercial_review AFTER UPDATE ON product_variants
FOR EACH ROW EXECUTE FUNCTION invalidate_variant_commercial_review();
