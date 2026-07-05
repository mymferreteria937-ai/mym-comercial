-- MM Ferretería V6 ERP Azul
-- Mejoras de inventario ferretero, etiquetas, cajas y configuración.

-- Productos: atributos ferreteros reales
alter table public.products
add column if not exists clean_name text,
add column if not exists brand text,
add column if not exists subcategory text,
add column if not exists location text,
add column if not exists stock_max numeric(12,2) default 0,
add column if not exists conversion_factor numeric(12,2) default 1,
add column if not exists purchase_unit text default 'UND',
add column if not exists sale_unit text default 'UND',
add column if not exists average_cost numeric(12,2) default 0,
add column if not exists last_cost numeric(12,2) default 0,
add column if not exists public_price numeric(12,2),
add column if not exists wholesale_price numeric(12,2),
add column if not exists contractor_price numeric(12,2),
add column if not exists synonyms text,
add column if not exists image_url text,
add column if not exists last_cost_update timestamp with time zone;

-- Si aún no existe profit_margin / allow_manual_price desde V4/V5
alter table public.products
add column if not exists profit_margin numeric(5,2) default 35,
add column if not exists allow_manual_price boolean default false;

-- Corregir precios: lo cargado originalmente como venta era costo proveedor
update public.products
set purchase_price = sale_price
where coalesce(purchase_price,0) = 0 and coalesce(sale_price,0) > 0;

update public.products
set profit_margin = coalesce(profit_margin,35),
    sale_price = ceil(purchase_price * (1 + coalesce(profit_margin,35) / 100)),
    public_price = ceil(purchase_price * (1 + coalesce(profit_margin,35) / 100)),
    average_cost = case when coalesce(average_cost,0)=0 then purchase_price else average_cost end,
    last_cost = case when coalesce(last_cost,0)=0 then purchase_price else last_cost end
where coalesce(purchase_price,0) > 0
  and coalesce(allow_manual_price,false) = false;

-- Ubicaciones físicas de tienda/bodega
create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  area text,
  aisle text,
  shelf text,
  drawer text,
  active boolean default true,
  created_at timestamp with time zone default now()
);

-- Sinónimos / equivalencias de búsqueda ferretera
create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  alias text not null,
  created_at timestamp with time zone default now()
);

-- Conteos ciegos / auditoría física
create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  count_no text unique not null,
  status text default 'OPEN',
  created_by text,
  created_at timestamp with time zone default now(),
  closed_at timestamp with time zone,
  approved_by text,
  note text
);

create table if not exists public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid references public.inventory_counts(id) on delete cascade,
  product_id uuid references public.products(id),
  counted_qty numeric(12,2) default 0,
  expected_qty numeric(12,2),
  difference_qty numeric(12,2),
  note text,
  created_at timestamp with time zone default now()
);

-- Cajas: columnas para arqueo, gastos y diferencia
alter table public.cash_sessions
add column if not exists cash_box_id uuid,
add column if not exists opened_by text,
add column if not exists counted_cash numeric(12,2) default 0,
add column if not exists counted_card numeric(12,2) default 0,
add column if not exists counted_transfer numeric(12,2) default 0,
add column if not exists cash_expenses numeric(12,2) default 0,
add column if not exists expected_cash numeric(12,2) default 0,
add column if not exists expected_total numeric(12,2) default 0,
add column if not exists counted_total numeric(12,2) default 0,
add column if not exists difference_amount numeric(12,2) default 0,
add column if not exists closing_note text;

-- Asegurar cajas iniciales
insert into public.cash_boxes (name, description, active)
values
('Caja 1','Caja principal',true),
('Caja 2','Caja secundaria',true),
('Caja 3','Caja bodega',true)
on conflict do nothing;

-- Cuentas bancarias administrables
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_number text not null,
  account_owner text not null,
  currency text default 'NIO',
  active boolean default true,
  created_at timestamp with time zone default now()
);

-- Configuración de empresa
create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  business_name text default 'MM Ferretería',
  default_margin numeric(5,2) default 35,
  default_rounding text default 'UP',
  logo_url text,
  address text,
  phone text,
  email text,
  updated_at timestamp with time zone default now()
);

insert into public.company_settings (business_name, default_margin, default_rounding)
select 'MM Ferretería',35,'UP'
where not exists (select 1 from public.company_settings);

-- Vista de rentabilidad por producto
create or replace view public.v_product_profitability as
select
  p.id,
  p.internal_code,
  p.supplier_code,
  p.name,
  coalesce(p.clean_name,p.name) as clean_name,
  p.brand,
  p.location,
  c.name as category_name,
  p.unit_type,
  p.stock,
  p.min_stock,
  p.stock_max,
  p.purchase_price,
  p.sale_price,
  p.profit_margin,
  (p.sale_price - p.purchase_price) as profit_per_unit,
  case when p.purchase_price > 0 then round(((p.sale_price - p.purchase_price) / p.purchase_price) * 100, 2) else 0 end as real_margin,
  (p.stock * (p.sale_price - p.purchase_price)) as potential_profit,
  case
    when p.stock <= 0 then 'AGOTADO'
    when p.stock <= p.min_stock then 'STOCK_BAJO'
    else 'DISPONIBLE'
  end as stock_status
from public.products p
left join public.categories c on c.id = p.category_id;
