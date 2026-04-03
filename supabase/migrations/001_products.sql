-- Ejecutá esto en Supabase → SQL Editor → New query → Run
-- O usá la CLI de Supabase si la tenés configurada.

create table if not exists public.products (
  id text primary key,
  name text not null,
  price numeric not null check (price >= 0),
  description text not null default '',
  image_url text not null,
  category text not null default 'General',
  created_at timestamptz not null default now()
);

create index if not exists products_created_at_idx on public.products (created_at);

alter table public.products enable row level security;

-- La app solo habla con Postgres vía Service Role desde Vercel (no expone keys al navegador).
-- Sin políticas para anon/authenticated = no acceso directo con anon key.
-- El service role ignora RLS.

comment on table public.products is 'Catálogo de frutos secos (API server-side)';
