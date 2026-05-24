
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_name text not null default 'Ma Boutique',
  owner_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Users view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto profile creation
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, owner_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'owner_name', new.email));
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text,
  category text,
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  stock integer not null default 0,
  low_stock_threshold integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create policy "own products select" on public.products for select using (auth.uid() = user_id);
create policy "own products insert" on public.products for insert with check (auth.uid() = user_id);
create policy "own products update" on public.products for update using (auth.uid() = user_id);
create policy "own products delete" on public.products for delete using (auth.uid() = user_id);
create index products_user_idx on public.products(user_id);

-- Sales
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1,
  unit_price numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.sales enable row level security;
create policy "own sales select" on public.sales for select using (auth.uid() = user_id);
create policy "own sales insert" on public.sales for insert with check (auth.uid() = user_id);
create policy "own sales update" on public.sales for update using (auth.uid() = user_id);
create policy "own sales delete" on public.sales for delete using (auth.uid() = user_id);
create index sales_user_idx on public.sales(user_id, created_at desc);

-- Decrement stock on sale
create or replace function public.decrement_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null then
    update public.products
      set stock = greatest(stock - new.quantity, 0),
          updated_at = now()
      where id = new.product_id and user_id = new.user_id;
  end if;
  return new;
end; $$;
create trigger on_sale_decrement_stock
  after insert on public.sales
  for each row execute function public.decrement_stock();

-- Expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Autre',
  description text,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
create policy "own expenses select" on public.expenses for select using (auth.uid() = user_id);
create policy "own expenses insert" on public.expenses for insert with check (auth.uid() = user_id);
create policy "own expenses update" on public.expenses for update using (auth.uid() = user_id);
create policy "own expenses delete" on public.expenses for delete using (auth.uid() = user_id);
create index expenses_user_idx on public.expenses(user_id, created_at desc);
