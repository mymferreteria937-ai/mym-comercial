-- =========================================================
-- MM Comercial ERP V10.4.2 - Multiunidad real Ferretería/Librería
-- Ejecutar ANTES de publicar y después de schema_v10_2_maestro_productos.sql
-- Objetivo: una sola factura, productos y reportes separados por unidad de negocio.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  color text default '#F97316',
  logo_url text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

insert into public.business_units (code, name, description, color)
values
  ('FER', 'MM Ferretería', 'Ferretería, construcción, herramientas, eléctrico, pintura, plomería y materiales.', '#F97316'),
  ('LIB', 'MM Librería', 'Librería, escolar, oficina, papelería, arte, tintas y consumibles.', '#3B82F6')
on conflict (code) do update set
  name=excluded.name,
  description=excluded.description,
  color=excluded.color,
  status='ACTIVE';

alter table if exists public.categories add column if not exists business_unit_id uuid references public.business_units(id);
alter table if exists public.products add column if not exists business_unit_id uuid references public.business_units(id);
alter table if exists public.suppliers add column if not exists business_unit_id uuid references public.business_units(id);
alter table if exists public.sale_items add column if not exists business_unit_id uuid references public.business_units(id);
alter table if exists public.sales add column if not exists business_unit_mix jsonb default '{}'::jsonb;

-- La aplicación consulta esta tabla con la clave pública de Supabase.
-- Se explicitan permisos para proyectos donde los privilegios por defecto
-- fueron endurecidos o modificados.
alter table public.business_units disable row level security;
grant usage on schema public to anon, authenticated;
grant select on table public.business_units to anon, authenticated;

-- Clasificación de categorías de librería.
update categories c
set business_unit_id = bu.id
from business_units bu
where bu.code='LIB'
  and (
    lower(coalesce(c.name,'')) similar to '%(libr|papeler|escolar|oficina|cuaderno|lapiz|lápiz|lapicero|boligrafo|marcador|resma|papel|cartulina|folder|tinta|toner|tóner|arte|manualidad|borrador|sacapunta|regla|pegamento|tijera)%'
    or lower(coalesce(c.code,'')) similar to '%(lib|pap|esc|ofi|cua|lap|mar|res|ton)%'
  );

-- Todo lo demás queda en ferretería, salvo que ya esté marcado como librería.
update categories c
set business_unit_id = bu.id
from business_units bu
where bu.code='FER'
  and c.business_unit_id is null;

-- Categorías base de librería.
insert into categories (name, code, business_unit_id)
select x.name, x.code, bu.id
from business_units bu
cross join (values
  ('Escolar','ESC'),
  ('Oficina','OFI'),
  ('Cuadernos','CUA'),
  ('Lápices y lapiceros','LAP'),
  ('Marcadores','MAR'),
  ('Papel y resmas','PAP'),
  ('Arte y manualidades','ART'),
  ('Tóner y tintas','TON'),
  ('Pegamentos y tijeras','PEG')
) as x(name, code)
where bu.code='LIB'
on conflict do nothing;

-- Productos de librería por categoría o texto del producto.
-- Corrección V10.4.2: no se usa p.description porque no existe en la tabla products.
-- dentro de un JOIN del FROM. Por eso se usa categories como tabla separada
-- y la relación se coloca en el WHERE.
update products p
set business_unit_id = bu.id
from business_units bu, categories c
where bu.code='LIB'
  and c.id = p.category_id
  and (
    c.business_unit_id = bu.id
    or lower(coalesce(c.name,'')) similar to '%(libr|papeler|escolar|oficina|cuaderno|lapiz|lápiz|lapicero|boligrafo|marcador|resma|papel|cartulina|folder|tinta|toner|tóner|arte|manualidad|borrador|sacapunta|regla|pegamento|tijera)%'
    or lower(coalesce(p.name,'')) similar to '%(libr|papeler|escolar|oficina|cuaderno|lapiz|lápiz|lapicero|boligrafo|marcador|resma|papel|cartulina|folder|tinta|toner|tóner|arte|manualidad|borrador|sacapunta|regla|pegamento|tijera)%'
    or lower(coalesce(p.clean_name,'')) similar to '%(libr|papeler|escolar|oficina|cuaderno|lapiz|lápiz|lapicero|boligrafo|marcador|resma|papel|cartulina|folder|tinta|toner|tóner|arte|manualidad|borrador|sacapunta|regla|pegamento|tijera)%'
    or lower(coalesce(p.aliases,'')) similar to '%(libr|papeler|escolar|oficina|cuaderno|lapiz|lápiz|marcador|resma|papel|tinta|toner|tóner)%'
    or lower(coalesce(p.brand,'')) similar to '%(libr|papeler|escolar|oficina|cuaderno|lapiz|lápiz|marcador|resma|papel|tinta|toner|tóner)%'
    or lower(coalesce(p.model,'')) similar to '%(libr|papeler|escolar|oficina|cuaderno|lapiz|lápiz|marcador|resma|papel|tinta|toner|tóner)%'
  );

-- Productos sin clasificación quedan en ferretería.
update products p
set business_unit_id = bu.id
from business_units bu
where bu.code='FER'
  and p.business_unit_id is null;

-- Históricos de venta heredan la unidad del producto.
update sale_items si
set business_unit_id = p.business_unit_id
from products p
where si.product_id = p.id
  and si.business_unit_id is null;

create index if not exists idx_products_business_unit_v104 on products(business_unit_id);
create index if not exists idx_categories_business_unit_v104 on categories(business_unit_id);
create index if not exists idx_sale_items_business_unit_v104 on sale_items(business_unit_id);
create index if not exists idx_business_units_code_v104 on business_units(code);

-- Vista de validación rápida.
create or replace view v_mm_productos_por_unidad as
select bu.code, bu.name as business_unit, count(p.id) as total_products
from business_units bu
left join products p on p.business_unit_id = bu.id
group by bu.code, bu.name
order by bu.code;

create or replace view v_mm_ventas_por_unidad as
select bu.code, bu.name as business_unit, coalesce(sum(si.total),0) as total_sales, coalesce(sum(si.profit_amount),0) as total_profit
from business_units bu
left join sale_items si on si.business_unit_id = bu.id
group by bu.code, bu.name
order by bu.code;

grant select on table public.v_mm_productos_por_unidad to anon, authenticated;
grant select on table public.v_mm_ventas_por_unidad to anon, authenticated;

-- Fuerza a PostgREST a reconocer inmediatamente la tabla y sus columnas.
notify pgrst, 'reload schema';
