-- MM Ferretería V7 Dark Blue ERP
-- Add-ons: doble tasa cambiaria, pagos USD/NIO, utilidad por divisa,
-- dashboard BI por margen y compatibilidad con V6.

create table if not exists public.exchange_rate_settings (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null default current_date,
  tasa_oficial_banco numeric(12,4) not null default 36.6243,
  tasa_pos_tienda numeric(12,4) not null default 36.1743,
  protection_type text not null default 'FIXED',
  protection_value numeric(12,4) not null default 0.45,
  created_by text,
  created_at timestamp with time zone default now(),
  unique(rate_date)
);

alter table public.exchange_rate_settings
  drop constraint if exists chk_tasa_pos_menor_banco;

alter table public.exchange_rate_settings
  add constraint chk_tasa_pos_menor_banco
  check (tasa_pos_tienda < tasa_oficial_banco);

insert into public.exchange_rate_settings (
  rate_date, tasa_oficial_banco, tasa_pos_tienda, protection_type, protection_value
)
values (current_date, 36.6243, 36.1743, 'FIXED', 0.45)
on conflict (rate_date)
do update set
  tasa_oficial_banco = excluded.tasa_oficial_banco,
  tasa_pos_tienda = excluded.tasa_pos_tienda,
  protection_type = excluded.protection_type,
  protection_value = excluded.protection_value;

alter table public.payment_details
  add column if not exists currency text default 'NIO',
  add column if not exists tasa_oficial_banco numeric(12,4),
  add column if not exists tasa_pos_tienda numeric(12,4),
  add column if not exists amount_original numeric(12,2),
  add column if not exists amount_nio numeric(12,2),
  add column if not exists fx_gain_nio numeric(12,2) default 0,
  add column if not exists reference_no text,
  add column if not exists bank_name text;

alter table public.sales
  add column if not exists cash_session_id uuid references public.cash_sessions(id),
  add column if not exists payment_currency text default 'NIO',
  add column if not exists tasa_oficial_banco numeric(12,4),
  add column if not exists tasa_pos_tienda numeric(12,4),
  add column if not exists amount_received_original numeric(12,2),
  add column if not exists amount_received_nio numeric(12,2),
  add column if not exists fx_gain_nio numeric(12,2) default 0;

alter table public.cash_sessions
  add column if not exists tasa_oficial_banco numeric(12,4),
  add column if not exists tasa_pos_tienda numeric(12,4),
  add column if not exists exchange_rate numeric(12,4),
  add column if not exists opening_cash_nio numeric(12,2) default 0,
  add column if not exists opening_cash_usd numeric(12,2) default 0,
  add column if not exists expected_cash_nio numeric(12,2) default 0,
  add column if not exists expected_cash_usd numeric(12,2) default 0,
  add column if not exists counted_cash_nio numeric(12,2) default 0,
  add column if not exists counted_cash_usd numeric(12,2) default 0,
  add column if not exists difference_cash_nio numeric(12,2) default 0,
  add column if not exists difference_cash_usd numeric(12,2) default 0,
  add column if not exists total_usd_received numeric(12,2) default 0,
  add column if not exists usd_value_store_nio numeric(12,2) default 0,
  add column if not exists usd_value_bank_nio numeric(12,2) default 0,
  add column if not exists fx_gain_nio numeric(12,2) default 0;

-- Vista BI: productos por margen real. La tabla de menor rentabilidad debe ordenar por margen, no por ganancia absoluta.
drop view if exists public.v_product_profitability cascade;
create view public.v_product_profitability as
select
  p.id,
  p.internal_code,
  p.supplier_code,
  p.name,
  coalesce(p.clean_name, p.name) as clean_name,
  p.purchase_price as cost,
  p.sale_price as sale_price,
  (p.sale_price - p.purchase_price) as profit_amount,
  case
    when p.purchase_price > 0 then round(((p.sale_price - p.purchase_price) / p.purchase_price) * 100, 2)
    else 0
  end as profit_margin_percent,
  p.stock,
  p.min_stock,
  p.unit_type,
  p.location,
  c.name as category_name
from public.products p
left join public.categories c on c.id = p.category_id;

-- Vista de utilidad cambiaria por caja.
drop view if exists public.v_cash_session_fx_profit cascade;
create view public.v_cash_session_fx_profit as
select
  cs.id as cash_session_id,
  cs.status,
  cs.opened_at,
  cs.closed_at,
  cs.total_usd_received,
  cs.usd_value_store_nio,
  cs.usd_value_bank_nio,
  cs.fx_gain_nio,
  cb.name as cash_box_name
from public.cash_sessions cs
left join public.cash_boxes cb on cb.id = cs.cash_box_id;
