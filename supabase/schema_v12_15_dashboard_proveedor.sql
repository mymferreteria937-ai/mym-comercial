-- MYM Comercial ERP V12.15
-- Proveedor del producto y soporte de índices para Dashboard multiunidad.

alter table public.products
  add column if not exists supplier_name text;

create index if not exists idx_products_supplier_name_v1215
  on public.products (supplier_name);

create index if not exists idx_sale_items_business_unit_v1215
  on public.sale_items (business_unit_id);

comment on column public.products.supplier_name is
  'Nombre del proveedor principal del producto.';
