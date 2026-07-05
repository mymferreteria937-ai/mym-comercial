-- MM Ferretería V5 ERP Comercial
-- Ejecutar después de la base inicial y después de cargar productos.

-- Productos: costo, margen, inventario empresarial y etiquetas
alter table public.products add column if not exists profit_margin numeric(5,2) default 35;
alter table public.products add column if not exists allow_manual_price boolean default false;
alter table public.products add column if not exists brand text;
alter table public.products add column if not exists max_stock numeric(12,2) default 0;
alter table public.products add column if not exists location text;
alter table public.products add column if not exists last_cost_update timestamp with time zone;

-- Si el precio actual era costo del proveedor, lo pasamos a purchase_price y recalculamos venta.
update public.products
set purchase_price = sale_price
where coalesce(purchase_price,0) = 0 and coalesce(sale_price,0) > 0;

update public.products
set profit_margin = coalesce(profit_margin,35),
    allow_manual_price = coalesce(allow_manual_price,false),
    sale_price = ceil(purchase_price * (1 + coalesce(profit_margin,35) / 100))
where coalesce(purchase_price,0) > 0 and coalesce(allow_manual_price,false) = false;

-- Clientes CRM
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique default ('CLI-' || extract(epoch from now())::bigint::text),
  name text not null,
  phone text,
  email text,
  address text,
  customer_type text default 'CONSUMIDOR FINAL',
  segment text default 'NUEVO',
  total_spent numeric(12,2) default 0,
  purchase_count int default 0,
  last_purchase_at timestamp with time zone,
  status text default 'ACTIVE',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Usuarios propios del sistema; no reemplaza auth de Supabase, es control operativo/roles.
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  role text not null default 'CAJERO',
  status text not null default 'ACTIVE',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Cajas físicas
create table if not exists public.cash_boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text,
  status text default 'ACTIVE',
  created_at timestamp with time zone default now()
);

insert into public.cash_boxes (name, location)
values ('Caja 1','Principal'), ('Caja 2','Principal'), ('Caja 3','Principal')
on conflict (name) do nothing;

-- Sesiones de caja: apertura y cierre por caja/cajero
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  cash_box_id uuid references public.cash_boxes(id),
  box_name text,
  cashier_user_id uuid references public.app_users(id),
  cashier_name text,
  opening_amount numeric(12,2) default 0,
  expected_total numeric(12,2) default 0,
  counted_total numeric(12,2) default 0,
  difference_amount numeric(12,2) default 0,
  status text default 'OPEN',
  opened_at timestamp with time zone default now(),
  closed_at timestamp with time zone,
  notes text
);

-- Ventas: pago, caja, utilidad, factura/ticket
alter table public.sales add column if not exists cash_session_id uuid references public.cash_sessions(id);
alter table public.sales add column if not exists invoice_type text default 'TICKET';
alter table public.sales add column if not exists printed boolean default false;
alter table public.sales add column if not exists printed_at timestamp with time zone;
alter table public.sales add column if not exists payment_reference text;
alter table public.sales add column if not exists profit_total numeric(12,2) default 0;

-- Detalle de venta: costo histórico y utilidad real
alter table public.sale_items add column if not exists unit_cost numeric(12,2) default 0;
alter table public.sale_items add column if not exists profit_amount numeric(12,2) default 0;
alter table public.sale_items add column if not exists profit_margin numeric(5,2) default 0;

-- Pagos múltiples / detalles de pago
create table if not exists public.payment_details (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete cascade,
  payment_method text not null,
  amount numeric(12,2) not null default 0,
  bank_name text,
  account_no text,
  reference_no text,
  card_last4 text,
  created_at timestamp with time zone default now()
);

-- Movimientos de caja: ingresos/egresos manuales
create table if not exists public.cash_movements_v5 (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid references public.cash_sessions(id),
  movement_type text not null,
  amount numeric(12,2) not null,
  reason text,
  created_by text,
  created_at timestamp with time zone default now()
);

-- Promociones manuales/sugeridas
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  promo_type text default 'SUGERIDA',
  discount_type text default 'PERCENT',
  discount_value numeric(12,2) default 0,
  starts_at date,
  ends_at date,
  status text default 'ACTIVE',
  created_at timestamp with time zone default now()
);

-- Bitácora gerencial
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamp with time zone default now()
);

-- Vista de rentabilidad de productos
create or replace view public.v_product_profitability as
select
  p.id,
  p.internal_code,
  p.name,
  p.purchase_price,
  p.sale_price,
  p.stock,
  p.min_stock,
  p.profit_margin,
  (p.sale_price - p.purchase_price) as unit_profit,
  case when p.purchase_price > 0 then round(((p.sale_price - p.purchase_price) / p.purchase_price) * 100, 2) else 0 end as real_margin,
  (p.stock * (p.sale_price - p.purchase_price)) as potential_profit
from public.products p;

-- Para ambiente de pruebas local. En producción se deben crear policies reales por rol.
alter table public.products disable row level security;
alter table public.categories disable row level security;
alter table public.suppliers disable row level security;
alter table public.customers disable row level security;
alter table public.sales disable row level security;
alter table public.sale_items disable row level security;
alter table public.inventory_movements disable row level security;
alter table public.cash_boxes disable row level security;
alter table public.cash_sessions disable row level security;
alter table public.payment_details disable row level security;
alter table public.cash_movements_v5 disable row level security;
alter table public.app_users disable row level security;
alter table public.promotions disable row level security;
alter table public.audit_log disable row level security;
