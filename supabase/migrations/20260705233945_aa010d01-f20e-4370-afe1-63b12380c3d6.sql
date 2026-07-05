
-- Clear subscription/trial for existing admins
UPDATE public.profiles
SET subscription_status = 'free',
    subscription_expires_at = NULL,
    trial_ends_at = NULL
WHERE id IN (SELECT user_id FROM public.admin_users);

-- Update handle_new_admin to also strip trial/subscription when marking an admin
CREATE OR REPLACE FUNCTION public.handle_new_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email = 'administrateur1@gmail.com' THEN
    INSERT INTO public.admin_users (user_id) VALUES (NEW.id)
      ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.profiles
      SET subscription_status = 'free',
          subscription_expires_at = NULL,
          trial_ends_at = NULL
      WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
