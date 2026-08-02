-- MYM Comercial ERP V13.14
-- Permite que un mismo artículo del proveedor tenga presentaciones distintas
-- (por ejemplo CAJA y UNIDAD), sin desactivar la prevención de duplicados.

create or replace function public.mm_product_presentation(
  p_sale_type text,
  p_unit_type text,
  p_name text
)
returns text
language sql
immutable
as $$
  select (
    case
      when public.mm_normalize_product_identity(p_name) ~ '(^| )(caja|paquete|pack)( |$)' then 'paquete'
      when public.mm_normalize_product_identity(p_name) ~ '(^| )(unidad|und)( |$)' then 'unidad'
      else public.mm_normalize_product_identity(coalesce(p_sale_type,'UNIDAD'))
    end
  ) || '|' || public.mm_normalize_product_identity(coalesce(p_unit_type,'UND'));
$$;

create or replace function public.mm_prevent_duplicate_product()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_existing record;
begin
  if tg_op='UPDATE'
     and new.business_unit_id is not distinct from old.business_unit_id
     and public.mm_normalize_product_identity(new.supplier_code)=public.mm_normalize_product_identity(old.supplier_code)
     and public.mm_normalize_product_identity(new.manufacturer_code)=public.mm_normalize_product_identity(old.manufacturer_code)
     and public.mm_normalize_product_identity(new.barcode)=public.mm_normalize_product_identity(old.barcode)
     and public.mm_normalize_product_identity(new.name)=public.mm_normalize_product_identity(old.name)
     and public.mm_normalize_product_identity(new.brand)=public.mm_normalize_product_identity(old.brand)
     and public.mm_normalize_product_identity(new.sale_type)=public.mm_normalize_product_identity(old.sale_type)
     and public.mm_normalize_product_identity(new.unit_type)=public.mm_normalize_product_identity(old.unit_type)
  then
    return new;
  end if;

  select p.id,p.internal_code,p.name
    into v_existing
  from public.products p
  where p.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
    and p.business_unit_id is not distinct from new.business_unit_id
    and (
      (public.mm_normalize_product_identity(new.barcode)<>''
       and public.mm_normalize_product_identity(p.barcode)=public.mm_normalize_product_identity(new.barcode))
      or
      ((
        (public.mm_normalize_product_identity(new.supplier_code)<>''
         and public.mm_normalize_product_identity(p.supplier_code)=public.mm_normalize_product_identity(new.supplier_code))
        or
        (public.mm_normalize_product_identity(new.manufacturer_code)<>''
         and public.mm_normalize_product_identity(p.manufacturer_code)=public.mm_normalize_product_identity(new.manufacturer_code))
        or
        (public.mm_normalize_product_identity(new.name)<>''
         and public.mm_normalize_product_identity(p.name)=public.mm_normalize_product_identity(new.name)
         and public.mm_normalize_product_identity(p.brand)=public.mm_normalize_product_identity(new.brand))
      )
      and public.mm_product_presentation(p.sale_type,p.unit_type,p.name)=public.mm_product_presentation(new.sale_type,new.unit_type,new.name))
    )
  order by p.created_at
  limit 1;

  if found then
    raise exception 'PRODUCTO_DUPLICADO: Ya existe % (%) con la misma presentación. Edite el registro existente.',
      v_existing.name,v_existing.internal_code
      using errcode='23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mm_prevent_duplicate_product on public.products;
create trigger trg_mm_prevent_duplicate_product
before insert or update of business_unit_id,supplier_code,manufacturer_code,barcode,name,brand,sale_type,unit_type
on public.products
for each row execute function public.mm_prevent_duplicate_product();
