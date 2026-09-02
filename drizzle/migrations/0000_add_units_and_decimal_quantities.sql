-- 1. Unité de vente (unite / kg / l) + stock décimal
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'unite',
  ADD COLUMN IF NOT EXISTS stock_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_qty numeric NOT NULL DEFAULT 5;

UPDATE public.products SET stock_qty = stock, low_stock_qty = low_stock_threshold;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS quantity_qty numeric;

UPDATE public.sales SET quantity_qty = quantity WHERE quantity_qty IS NULL;

-- 2. Garder stock (entier, legacy) et stock_qty (décimal) synchronisés
CREATE OR REPLACE FUNCTION public.sync_product_stock_qty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stock_qty IS DISTINCT FROM 0 THEN
      NEW.stock := ceil(NEW.stock_qty)::int;
    ELSE
      NEW.stock_qty := NEW.stock;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.stock_qty IS DISTINCT FROM OLD.stock_qty THEN
    NEW.stock := ceil(NEW.stock_qty)::int;
  ELSIF NEW.stock IS DISTINCT FROM OLD.stock THEN
    NEW.stock_qty := NEW.stock;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_product_stock_qty_trg ON public.products;
CREATE TRIGGER sync_product_stock_qty_trg
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_qty();

-- 3. Décrément de stock en décimal
CREATE OR REPLACE FUNCTION public.decrement_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare q numeric;
begin
  q := coalesce(new.quantity_qty, new.quantity);
  if new.product_id is not null then
    update public.products
      set stock_qty = greatest(stock_qty - q, 0),
          updated_at = now()
      where id = new.product_id and user_id = new.user_id;
  end if;
  return new;
end; $$;

CREATE OR REPLACE FUNCTION public.handle_sale_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE q numeric;
BEGIN
  q := coalesce(NEW.quantity_qty, NEW.quantity);
  IF NEW.is_cancelled = true AND OLD.is_cancelled = false THEN
    IF NEW.product_id IS NOT NULL THEN
      UPDATE public.products
        SET stock_qty = stock_qty + q, updated_at = now()
        WHERE id = NEW.product_id AND user_id = NEW.user_id;
    END IF;
    NEW.cancelled_at = now();
  ELSIF NEW.is_cancelled = false AND OLD.is_cancelled = true THEN
    IF NEW.product_id IS NOT NULL THEN
      UPDATE public.products
        SET stock_qty = greatest(stock_qty - q, 0), updated_at = now()
        WHERE id = NEW.product_id AND user_id = NEW.user_id;
    END IF;
    NEW.cancelled_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;