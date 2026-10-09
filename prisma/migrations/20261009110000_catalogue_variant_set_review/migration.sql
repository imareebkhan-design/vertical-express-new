-- Adding/removing an active offer changes the set the owner reviewed.
CREATE FUNCTION invalidate_variant_set_commercial_review() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active THEN
      UPDATE public.products SET commercial_review = NULL WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.is_active THEN
    UPDATE public.products SET commercial_review = NULL WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER invalidate_variant_set_commercial_review
AFTER INSERT OR DELETE ON product_variants
FOR EACH ROW EXECUTE FUNCTION invalidate_variant_set_commercial_review();
