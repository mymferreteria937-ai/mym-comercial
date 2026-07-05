-- MM Ferretería ERP V9 - Inventario profesional
-- Ejecutar solo si quieres ampliar trazabilidad. El frontend V9 funciona sin este SQL,
-- pero estas columnas/tablas preparan historial, aliases y búsquedas avanzadas.

alter table public.products
add column if not exists manufacturer_code text,
add column if not exists model text,
add column if not exists reorder_point numeric(12,2) default 0,
add column if not exists discontinued boolean default false;

create table if not exists public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  previous_cost numeric(12,2),
  new_cost numeric(12,2),
  previous_price numeric(12,2),
  new_price numeric(12,2),
  previous_margin numeric(8,2),
  new_margin numeric(8,2),
  changed_by text,
  reason text,
  created_at timestamp with time zone default now()
);

create index if not exists idx_products_internal_code on public.products(internal_code);
create index if not exists idx_products_barcode on public.products(barcode);
create index if not exists idx_products_supplier_code on public.products(supplier_code);
create index if not exists idx_products_manufacturer_code on public.products(manufacturer_code);
create index if not exists idx_product_aliases_alias on public.product_aliases(alias);
