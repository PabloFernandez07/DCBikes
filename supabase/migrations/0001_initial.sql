-- DC Bikes Cantabria — Esquema inicial

create extension if not exists "pgcrypto";

-- ─── Categorías ──────────────────────────────────────────────
create table categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  sort_order int  default 0,
  created_at timestamptz default now()
);

-- ─── Productos ───────────────────────────────────────────────
create table products (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid references categories(id) on delete restrict,
  slug              text unique not null,
  name              text not null,
  description       text,
  short_description text,
  cost_price        numeric(10,2),
  retail_price      numeric(10,2) not null,
  stock             int default 0,
  sku               text,
  brand             text,
  featured          boolean default false,
  active            boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- actualizar updated_at automáticamente
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ─── Imágenes ────────────────────────────────────────────────
create table product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid references products(id) on delete cascade,
  storage_path text not null,
  alt          text,
  sort_order   int default 0
);

-- ─── Analytics ───────────────────────────────────────────────
create table product_views (
  id         bigserial primary key,
  product_id uuid references products(id) on delete cascade,
  session_id text,
  viewed_at  timestamptz default now()
);

create table search_queries (
  id            bigserial primary key,
  term          text not null,
  results_count int,
  searched_at   timestamptz default now()
);

-- ─── Consultas presupuesto ───────────────────────────────────
create table quote_requests (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  email      text not null,
  phone      text,
  message    text,
  status     text default 'new',
  created_at timestamptz default now()
);

-- ─── Configuración ───────────────────────────────────────────
create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);

-- ─── RLS ─────────────────────────────────────────────────────
alter table categories      enable row level security;
alter table products        enable row level security;
alter table product_images  enable row level security;
alter table product_views   enable row level security;
alter table search_queries  enable row level security;
alter table quote_requests  enable row level security;
alter table settings        enable row level security;

-- Lectura pública
create policy "public_read_categories" on categories     for select using (true);
create policy "public_read_products"   on products       for select using (active = true);
create policy "public_read_images"     on product_images for select using (true);

-- Inserción pública (analytics + presupuestos)
create policy "public_insert_views"    on product_views  for insert with check (true);
create policy "public_insert_searches" on search_queries for insert with check (true);
create policy "public_insert_quotes"   on quote_requests for insert with check (true);

-- Admin authenticated (todo)
create policy "auth_categories"  on categories     for all using (auth.role() = 'authenticated');
create policy "auth_products"    on products       for all using (auth.role() = 'authenticated');
create policy "auth_images"      on product_images for all using (auth.role() = 'authenticated');
create policy "auth_views"       on product_views  for select using (auth.role() = 'authenticated');
create policy "auth_searches"    on search_queries for select using (auth.role() = 'authenticated');
create policy "auth_quotes_r"    on quote_requests for select using (auth.role() = 'authenticated');
create policy "auth_quotes_u"    on quote_requests for update using (auth.role() = 'authenticated');
create policy "auth_settings"    on settings       for all using (auth.role() = 'authenticated');

-- ─── Seed: categorías base ───────────────────────────────────
insert into categories (slug, name, sort_order) values
  ('bicicletas',  'Bicicletas',  1),
  ('ropa',        'Ropa',        2),
  ('accesorios',  'Accesorios',  3),
  ('componentes', 'Componentes', 4),
  ('nutricion',   'Nutrición',   5);

-- ─── Seed: settings defaults ─────────────────────────────────
insert into settings (key, value) values
  ('quote_destination_email', '"info@dcbikescantabria.com"'),
  ('store_name',              '"DC Bikes Cantabria"'),
  ('store_address',           '"C/ La Cantábrica nº1, El Astillero, Cantabria"'),
  ('store_phone',             '"+34 942 054 501"'),
  ('store_hours',             '"Lun–Vie 9:00–14:00 y 16:00–19:30 · Sáb 9:00–14:00"'),
  ('social_instagram',        '""'),
  ('social_facebook',         '""');
