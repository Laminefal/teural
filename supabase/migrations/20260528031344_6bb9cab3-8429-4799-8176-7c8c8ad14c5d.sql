ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE OR REPLACE FUNCTION public.handle_expense_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_cancelled = true AND OLD.is_cancelled = false THEN
    NEW.cancelled_at = now();
  ELSIF NEW.is_cancelled = false AND OLD.is_cancelled = true THEN
    NEW.cancelled_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_expense_cancellation ON public.expenses;
CREATE TRIGGER on_expense_cancellation
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.handle_expense_cancellation();