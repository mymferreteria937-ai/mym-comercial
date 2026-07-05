-- =========================================================
-- MM Comercial ERP V10.2 - Maestro de Productos
-- Ejecutar después de schema_v10_multiunidad.sql
-- Agrega unidad de negocio visible, tipo de venta y unidades normalizadas.
-- =========================================================

create extension if not exists pgcrypto;

-- Asegura unidades de negocio base.
insert into business_units (code, name, description, color)
values
  ('FER', 'MM Ferretería', 'Ferretería, construcción, herramientas, eléctrico, pintura y plomería.', '#F97316'),
  ('LIB', 'MM Librería', 'Librería, escolar, oficina, arte, papel, tintas y papelería.', '#3B82F6')
on conflict (code) do update set name=excluded.name, description=excluded.description, color=excluded.color;

-- Maestro de unidades de medida.
create table if not exists product_units (
  code text primary key,
  name text not null,
  sale_type text not null,
  allows_decimal boolean not null default false,
  status text not null default 'ACTIVE'
);

insert into product_units (code, name, sale_type, allows_decimal) values
  ('UND','Unidad','UNIDAD',false),
  ('PAR','Par','UNIDAD',false),
  ('JGO','Juego','KIT',false),
  ('KIT','Kit','KIT',false),
  ('SET','Set','KIT',false),
  ('LB','Libra','PESO',true),
  ('KG','Kilogramo','PESO',true),
  ('M','Metro','LONGITUD',true),
  ('CM','Centímetro','LONGITUD',true),
  ('FT','Pie','LONGITUD',true),
  ('GAL','Galón','VOLUMEN',true),
  ('LT','Litro','VOLUMEN',true),
  ('ML','Mililitro','VOLUMEN',true),
  ('CUB','Cubeta','VOLUMEN',false),
  ('TUB','Tubo','VOLUMEN',false),
  ('CJ','Caja','PAQUETE',false),
  ('PQ','Paquete','PAQUETE',false),
  ('BOL','Bolsa','PAQUETE',false),
  ('SAC','Saco','PAQUETE',false),
  ('RLL','Rollo','PAQUETE',false)
on conflict (code) do update set name=excluded.name, sale_type=excluded.sale_type, allows_decimal=excluded.allows_decimal;

-- Campos nuevos del maestro de productos.
alter table products add column if not exists sale_type text default 'UNIDAD';
alter table products add column if not exists allows_decimal boolean default false;
alter table products add column if not exists manufacturer_code text;
alter table products add column if not exists aliases text;
alter table products add column if not exists model text;
alter table products add column if not exists primary_image_url text;

-- Normaliza productos existentes según su unidad.
update products p
set sale_type = coalesce(u.sale_type, p.sale_type, 'UNIDAD'),
    allows_decimal = coalesce(u.allows_decimal, false)
from product_units u
where upper(coalesce(p.unit_type,'UND')) = u.code;

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

create index if not exists idx_products_sale_type on products(sale_type);
create index if not exists idx_products_unit_type on products(unit_type);
create index if not exists idx_products_manufacturer_code on products(manufacturer_code);
