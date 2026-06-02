-- Subscription fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Backfill trial for existing users (30 days from now)
UPDATE public.profiles
  SET trial_ends_at = now() + interval '30 days'
  WHERE trial_ends_at IS NULL AND subscription_status = 'free';

-- Update handle_new_user to set 30-day trial for new owners
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_shop_id uuid;
  is_agent boolean;
BEGIN
  is_agent := COALESCE((NEW.raw_user_meta_data->>'is_agent')::boolean, false);

  INSERT INTO public.profiles (id, owner_name, trial_ends_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'owner_name', NEW.email),
      CASE WHEN is_agent THEN NULL ELSE now() + interval '30 days' END
    );

  IF is_agent THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.shops (name, owner_id)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'shop_name', 'Ma Boutique'), NEW.id)
    RETURNING id INTO new_shop_id;
  INSERT INTO public.user_roles (user_id, shop_id, role) VALUES (NEW.id, new_shop_id, 'owner');
  RETURN NEW;
END; $function$;

-- Subscription payments table
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  plan text NOT NULL CHECK (plan IN ('monthly','yearly')),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'XOF',
  payment_method text,
  paydunya_token text UNIQUE,
  paydunya_invoice_token text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled','failed')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners view own payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
