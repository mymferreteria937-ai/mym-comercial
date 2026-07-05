-- =========================================================
-- MM Comercial ERP V10 - Multiunidad Ferretería + Librería
-- Ejecutar después de los scripts V7/V8/V9 existentes.
-- Una sola base de datos, varias unidades de negocio.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists business_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  color text default '#F97316',
  logo_url text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

insert into business_units (code, name, description, color)
values
  ('FER', 'MM Ferretería', 'Línea de ferretería, herramientas, construcción, plomería, eléctrico y pintura.', '#F97316'),
  ('LIB', 'MM Librería', 'Línea de librería, escolar, oficina, papelería, arte e impresión.', '#3B82F6')
on conflict (code) do update set
  name=excluded.name,
  description=excluded.description,
  color=excluded.color;

alter table categories add column if not exists business_unit_id uuid references business_units(id);
alter table products add column if not exists business_unit_id uuid references business_units(id);
alter table suppliers add column if not exists business_unit_id uuid references business_units(id);
alter table sales add column if not exists business_unit_mix jsonb default '{}'::jsonb;
alter table sale_items add column if not exists business_unit_id uuid references business_units(id);

-- Asignación inicial de categorías conocidas a Ferretería/Librería.
update categories c
set business_unit_id = bu.id
from business_units bu
where bu.code='FER'
  and c.business_unit_id is null
  and lower(coalesce(c.name,'')) not similar to '%(libr|escolar|oficina|papel|cuaderno|lapiz|lápiz|marcador|arte|resma)%';

update categories c
set business_unit_id = bu.id
from business_units bu
where bu.code='LIB'
  and lower(coalesce(c.name,'')) similar to '%(libr|escolar|oficina|papel|cuaderno|lapiz|lápiz|marcador|arte|resma)%';

-- Asignación inicial de productos por categoría; si no se puede inferir, Ferretería.
update products p
set business_unit_id = coalesce(
  (select c.business_unit_id from categories c where c.id = p.category_id),
  bu.id
)
from business_units bu
where bu.code='FER'
  and p.business_unit_id is null;

update sale_items si
set business_unit_id = p.business_unit_id
from products p
where si.product_id = p.id
  and si.business_unit_id is null;

create index if not exists idx_products_business_unit on products(business_unit_id);
create index if not exists idx_categories_business_unit on categories(business_unit_id);
create index if not exists idx_sale_items_business_unit on sale_items(business_unit_id);

-- Categorías iniciales de librería para que ya puedas cargar productos.
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
  ('Tóner y tintas','TON')
) as x(name, code)
where bu.code='LIB'
on conflict do nothing;
