
-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner', 'agent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Shops table
CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Ma Boutique',
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;
GRANT ALL ON public.shops TO service_role;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

-- 3. user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, shop_id)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_shop ON public.user_roles(shop_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Security-definer helpers
CREATE OR REPLACE FUNCTION public.get_user_shop_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT shop_id FROM public.user_roles WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_shop_member(_user_id uuid, _shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND shop_id = _shop_id);
$$;

CREATE OR REPLACE FUNCTION public.is_shop_owner(_user_id uuid, _shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND shop_id = _shop_id AND role = 'owner');
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1;
$$;

-- 5. RLS on shops & user_roles
CREATE POLICY "shop members can view shop" ON public.shops FOR SELECT TO authenticated
  USING (public.is_shop_member(auth.uid(), id));
CREATE POLICY "owner can update shop" ON public.shops FOR UPDATE TO authenticated
  USING (public.is_shop_owner(auth.uid(), id));
CREATE POLICY "any user can create shop" ON public.shops FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "members view roles in their shop" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_shop_member(auth.uid(), shop_id));
CREATE POLICY "owner manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id))
  WITH CHECK (public.is_shop_owner(auth.uid(), shop_id));

-- 6. Add shop_id to existing tables
ALTER TABLE public.products ADD COLUMN shop_id uuid;
ALTER TABLE public.sales ADD COLUMN shop_id uuid;
ALTER TABLE public.expenses ADD COLUMN shop_id uuid;
ALTER TABLE public.debts ADD COLUMN shop_id uuid;

-- 7. Migrate existing data: each existing user becomes owner of their own shop
DO $$
DECLARE
  r RECORD;
  new_shop_id uuid;
BEGIN
  FOR r IN SELECT DISTINCT p.id, COALESCE(p.shop_name, 'Ma Boutique') AS sname FROM public.profiles p LOOP
    INSERT INTO public.shops (name, owner_id) VALUES (r.sname, r.id) RETURNING id INTO new_shop_id;
    INSERT INTO public.user_roles (user_id, shop_id, role) VALUES (r.id, new_shop_id, 'owner')
      ON CONFLICT DO NOTHING;
    UPDATE public.products SET shop_id = new_shop_id WHERE user_id = r.id AND shop_id IS NULL;
    UPDATE public.sales SET shop_id = new_shop_id WHERE user_id = r.id AND shop_id IS NULL;
    UPDATE public.expenses SET shop_id = new_shop_id WHERE user_id = r.id AND shop_id IS NULL;
    UPDATE public.debts SET shop_id = new_shop_id WHERE user_id = r.id AND shop_id IS NULL;
  END LOOP;
END $$;

-- 8. Set shop_id NOT NULL and index
ALTER TABLE public.products ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE public.expenses ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE public.debts ALTER COLUMN shop_id SET NOT NULL;
CREATE INDEX idx_products_shop ON public.products(shop_id);
CREATE INDEX idx_sales_shop ON public.sales(shop_id);
CREATE INDEX idx_expenses_shop ON public.expenses(shop_id);
CREATE INDEX idx_debts_shop ON public.debts(shop_id);

-- 9. Replace RLS policies on products/sales/expenses/debts
DROP POLICY IF EXISTS "own products select" ON public.products;
DROP POLICY IF EXISTS "own products insert" ON public.products;
DROP POLICY IF EXISTS "own products update" ON public.products;
DROP POLICY IF EXISTS "own products delete" ON public.products;
CREATE POLICY "shop members view products" ON public.products FOR SELECT TO authenticated
  USING (public.is_shop_member(auth.uid(), shop_id));
CREATE POLICY "shop members insert products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(auth.uid(), shop_id) AND auth.uid() = user_id);
CREATE POLICY "shop members update products" ON public.products FOR UPDATE TO authenticated
  USING (public.is_shop_member(auth.uid(), shop_id));
CREATE POLICY "owner deletes products" ON public.products FOR DELETE TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id));

DROP POLICY IF EXISTS "own sales select" ON public.sales;
DROP POLICY IF EXISTS "own sales insert" ON public.sales;
DROP POLICY IF EXISTS "own sales update" ON public.sales;
DROP POLICY IF EXISTS "own sales delete" ON public.sales;
CREATE POLICY "shop members view sales" ON public.sales FOR SELECT TO authenticated
  USING (public.is_shop_member(auth.uid(), shop_id));
CREATE POLICY "shop members insert sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(auth.uid(), shop_id) AND auth.uid() = user_id);
CREATE POLICY "shop members update sales" ON public.sales FOR UPDATE TO authenticated
  USING (public.is_shop_member(auth.uid(), shop_id));
CREATE POLICY "owner deletes sales" ON public.sales FOR DELETE TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id));

DROP POLICY IF EXISTS "own expenses select" ON public.expenses;
DROP POLICY IF EXISTS "own expenses insert" ON public.expenses;
DROP POLICY IF EXISTS "own expenses update" ON public.expenses;
DROP POLICY IF EXISTS "own expenses delete" ON public.expenses;
CREATE POLICY "shop members view expenses" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_shop_member(auth.uid(), shop_id));
CREATE POLICY "shop members insert expenses" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(auth.uid(), shop_id) AND auth.uid() = user_id);
CREATE POLICY "shop members update expenses" ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_shop_member(auth.uid(), shop_id));
CREATE POLICY "owner deletes expenses" ON public.expenses FOR DELETE TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id));

DROP POLICY IF EXISTS "own debts select" ON public.debts;
DROP POLICY IF EXISTS "own debts insert" ON public.debts;
DROP POLICY IF EXISTS "own debts update" ON public.debts;
DROP POLICY IF EXISTS "own debts delete" ON public.debts;
CREATE POLICY "shop members view debts" ON public.debts FOR SELECT TO authenticated
  USING (public.is_shop_member(auth.uid(), shop_id));
CREATE POLICY "shop members insert debts" ON public.debts FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(auth.uid(), shop_id) AND auth.uid() = user_id);
CREATE POLICY "shop members update debts" ON public.debts FOR UPDATE TO authenticated
  USING (public.is_shop_member(auth.uid(), shop_id));
CREATE POLICY "owner deletes debts" ON public.debts FOR DELETE TO authenticated
  USING (public.is_shop_owner(auth.uid(), shop_id));

-- 10. Updated handle_new_user: create shop + owner role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_shop_id uuid;
  is_agent boolean;
BEGIN
  is_agent := COALESCE((NEW.raw_user_meta_data->>'is_agent')::boolean, false);

  INSERT INTO public.profiles (id, owner_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'owner_name', NEW.email));

  IF is_agent THEN
    -- agent: shop_id provided in metadata; role inserted separately by server fn
    RETURN NEW;
  END IF;

  INSERT INTO public.shops (name, owner_id)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'shop_name', 'Ma Boutique'), NEW.id)
    RETURNING id INTO new_shop_id;
  INSERT INTO public.user_roles (user_id, shop_id, role) VALUES (NEW.id, new_shop_id, 'owner');
  RETURN NEW;
END; $$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
