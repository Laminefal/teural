CREATE TABLE public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  person_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('creance','dette')),
  amount numeric NOT NULL DEFAULT 0,
  description text,
  due_date date,
  is_paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own debts select" ON public.debts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own debts insert" ON public.debts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own debts update" ON public.debts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own debts delete" ON public.debts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_debts_user ON public.debts(user_id);