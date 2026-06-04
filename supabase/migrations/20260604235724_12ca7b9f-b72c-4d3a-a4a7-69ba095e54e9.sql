
-- Admin users table
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Security definer function to check admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _user_id);
$$;

CREATE POLICY "admins view admin_users" ON public.admin_users
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Auto-promote configured email on signup
CREATE OR REPLACE FUNCTION public.handle_new_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'administrateur1@gmail.com' THEN
    INSERT INTO public.admin_users (user_id) VALUES (NEW.id)
      ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin();

-- Promote existing user if already signed up
INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'administrateur1@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
