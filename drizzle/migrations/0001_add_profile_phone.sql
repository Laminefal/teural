ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_shop_id uuid;
  is_agent boolean;
  v_shop_name text;
BEGIN
  is_agent := COALESCE((NEW.raw_user_meta_data->>'is_agent')::boolean, false);
  v_shop_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'shop_name', '')), '');

  INSERT INTO public.profiles (id, owner_name, shop_name, phone, trial_ends_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'owner_name', NEW.email),
      COALESCE(v_shop_name, 'Ma Boutique'),
      NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'phone', '')), ''),
      CASE WHEN is_agent THEN NULL ELSE now() + interval '30 days' END
    );

  IF is_agent THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.shops (name, owner_id)
    VALUES (COALESCE(v_shop_name, 'Ma Boutique'), NEW.id)
    RETURNING id INTO new_shop_id;
  INSERT INTO public.user_roles (user_id, shop_id, role) VALUES (NEW.id, new_shop_id, 'owner');
  RETURN NEW;
END; $function$;