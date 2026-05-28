ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Trigger to restore stock when a sale is cancelled (and re-decrement if un-cancelled)
CREATE OR REPLACE FUNCTION public.handle_sale_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_cancelled = true AND OLD.is_cancelled = false THEN
    IF NEW.product_id IS NOT NULL THEN
      UPDATE public.products
        SET stock = stock + NEW.quantity,
            updated_at = now()
        WHERE id = NEW.product_id AND user_id = NEW.user_id;
    END IF;
    NEW.cancelled_at = now();
  ELSIF NEW.is_cancelled = false AND OLD.is_cancelled = true THEN
    IF NEW.product_id IS NOT NULL THEN
      UPDATE public.products
        SET stock = greatest(stock - NEW.quantity, 0),
            updated_at = now()
        WHERE id = NEW.product_id AND user_id = NEW.user_id;
    END IF;
    NEW.cancelled_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_sale_cancellation ON public.sales;
CREATE TRIGGER on_sale_cancellation
BEFORE UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.handle_sale_cancellation();