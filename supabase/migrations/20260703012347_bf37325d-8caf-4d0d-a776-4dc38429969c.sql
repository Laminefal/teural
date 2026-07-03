
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_shop_active(_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NOT is_suspended FROM public.shops WHERE id = _shop_id), false);
$$;

-- Products
DROP POLICY IF EXISTS "shop members insert products" ON public.products;
DROP POLICY IF EXISTS "shop members update products" ON public.products;
DROP POLICY IF EXISTS "owner deletes products" ON public.products;
CREATE POLICY "shop members insert products" ON public.products FOR INSERT
  WITH CHECK (is_shop_member(auth.uid(), shop_id) AND auth.uid() = user_id AND is_shop_active(shop_id));
CREATE POLICY "shop members update products" ON public.products FOR UPDATE
  USING (is_shop_member(auth.uid(), shop_id) AND is_shop_active(shop_id));
CREATE POLICY "owner deletes products" ON public.products FOR DELETE
  USING (is_shop_owner(auth.uid(), shop_id) AND is_shop_active(shop_id));

-- Sales
DROP POLICY IF EXISTS "shop members insert sales" ON public.sales;
DROP POLICY IF EXISTS "shop members update sales" ON public.sales;
DROP POLICY IF EXISTS "owner deletes sales" ON public.sales;
CREATE POLICY "shop members insert sales" ON public.sales FOR INSERT
  WITH CHECK (is_shop_member(auth.uid(), shop_id) AND auth.uid() = user_id AND is_shop_active(shop_id));
CREATE POLICY "shop members update sales" ON public.sales FOR UPDATE
  USING (is_shop_member(auth.uid(), shop_id) AND is_shop_active(shop_id));
CREATE POLICY "owner deletes sales" ON public.sales FOR DELETE
  USING (is_shop_owner(auth.uid(), shop_id) AND is_shop_active(shop_id));

-- Expenses
DROP POLICY IF EXISTS "shop members insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "shop members update expenses" ON public.expenses;
DROP POLICY IF EXISTS "owner deletes expenses" ON public.expenses;
CREATE POLICY "shop members insert expenses" ON public.expenses FOR INSERT
  WITH CHECK (is_shop_member(auth.uid(), shop_id) AND auth.uid() = user_id AND is_shop_active(shop_id));
CREATE POLICY "shop members update expenses" ON public.expenses FOR UPDATE
  USING (is_shop_member(auth.uid(), shop_id) AND is_shop_active(shop_id));
CREATE POLICY "owner deletes expenses" ON public.expenses FOR DELETE
  USING (is_shop_owner(auth.uid(), shop_id) AND is_shop_active(shop_id));

-- Debts
DROP POLICY IF EXISTS "shop members insert debts" ON public.debts;
DROP POLICY IF EXISTS "shop members update debts" ON public.debts;
DROP POLICY IF EXISTS "owner deletes debts" ON public.debts;
CREATE POLICY "shop members insert debts" ON public.debts FOR INSERT
  WITH CHECK (is_shop_member(auth.uid(), shop_id) AND auth.uid() = user_id AND is_shop_active(shop_id));
CREATE POLICY "shop members update debts" ON public.debts FOR UPDATE
  USING (is_shop_member(auth.uid(), shop_id) AND is_shop_active(shop_id));
CREATE POLICY "owner deletes debts" ON public.debts FOR DELETE
  USING (is_shop_owner(auth.uid(), shop_id) AND is_shop_active(shop_id));
