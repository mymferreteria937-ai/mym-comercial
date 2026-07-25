-- =========================================================
-- MYM Comercial ERP V13.6
-- Política comercial persistente + anulación auditable
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

begin;

create table if not exists public.commercial_policy_settings (
  id uuid primary key default gen_random_uuid(),
  cash_discount_percent numeric not null default 0,
  transfer_discount_percent numeric not null default 0,
  card_fee_included boolean not null default true,
  require_transfer_reference boolean not null default true,
  status text not null default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.commercial_policy_settings
  alter column cash_discount_percent set default 0,
  alter column transfer_discount_percent set default 0,
  add column if not exists manual_discount_enabled boolean not null default true,
  add column if not exists max_manual_discount_percent numeric not null default 10,
  add column if not exists require_discount_authorization boolean not null default false;

update public.commercial_policy_settings
set cash_discount_percent=0,
    transfer_discount_percent=0,
    updated_at=now()
where status='ACTIVE';

insert into public.commercial_policy_settings
  (cash_discount_percent,transfer_discount_percent,manual_discount_enabled,
   max_manual_discount_percent,require_discount_authorization,
   card_fee_included,require_transfer_reference,status)
select 0,0,true,10,false,true,true,'ACTIVE'
where not exists (
  select 1 from public.commercial_policy_settings where status='ACTIVE'
);

alter table public.sales
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text;

create table if not exists public.sale_voids (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  invoice_no text,
  cash_session_id uuid,
  total numeric not null default 0,
  payment_method text,
  reason text not null,
  voided_by uuid not null,
  voided_by_name text,
  created_at timestamptz not null default now(),
  unique(sale_id)
);

create or replace function public.mm_get_commercial_policy()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.commercial_policy_settings%rowtype;
begin
  select * into v_row
  from public.commercial_policy_settings
  where status='ACTIVE'
  order by updated_at desc nulls last, created_at desc
  limit 1;
  if not found then
    insert into public.commercial_policy_settings
      (cash_discount_percent,transfer_discount_percent,manual_discount_enabled,
       max_manual_discount_percent,require_discount_authorization,
       card_fee_included,require_transfer_reference,status)
    values (0,0,true,10,false,true,true,'ACTIVE')
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.mm_save_commercial_policy(
  p_actor_id uuid,
  p_manual_discount_enabled boolean,
  p_max_manual_discount_percent numeric,
  p_require_discount_authorization boolean,
  p_card_fee_included boolean,
  p_require_transfer_reference boolean
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_role text; v_id uuid; v_row public.commercial_policy_settings%rowtype;
begin
  select upper(role) into v_role from public.app_users
  where id=p_actor_id and upper(status)='ACTIVE';
  if coalesce(v_role,'') not in ('ADMIN','SUPERVISOR') then
    raise exception 'Solo Administrador o Supervisor puede cambiar la política comercial.';
  end if;
  if p_max_manual_discount_percent<0 or p_max_manual_discount_percent>100 then
    raise exception 'El descuento máximo debe estar entre 0 y 100.';
  end if;
  select id into v_id from public.commercial_policy_settings
  where status='ACTIVE' order by updated_at desc nulls last,created_at desc limit 1;
  if v_id is null then
    insert into public.commercial_policy_settings
      (cash_discount_percent,transfer_discount_percent,manual_discount_enabled,
       max_manual_discount_percent,require_discount_authorization,
       card_fee_included,require_transfer_reference,status)
    values (0,0,p_manual_discount_enabled,p_max_manual_discount_percent,
      p_require_discount_authorization,p_card_fee_included,
      p_require_transfer_reference,'ACTIVE')
    returning * into v_row;
  else
    update public.commercial_policy_settings set
      cash_discount_percent=0,
      transfer_discount_percent=0,
      manual_discount_enabled=p_manual_discount_enabled,
      max_manual_discount_percent=p_max_manual_discount_percent,
      require_discount_authorization=p_require_discount_authorization,
      card_fee_included=p_card_fee_included,
      require_transfer_reference=p_require_transfer_reference,
      updated_at=now()
    where id=v_id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.mm_void_sale(
  p_sale_id uuid,
  p_actor_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sale public.sales%rowtype;
  v_actor_name text;
  v_actor_role text;
  v_cash_status text;
begin
  if length(trim(coalesce(p_reason,'')))<5 then
    raise exception 'Debe indicar un motivo válido para la anulación.';
  end if;
  select name,upper(role) into v_actor_name,v_actor_role
  from public.app_users
  where id=p_actor_id and upper(status)='ACTIVE';
  if coalesce(v_actor_role,'') not in ('ADMIN','SUPERVISOR') then
    raise exception 'Solo Administrador o Supervisor puede anular ventas.';
  end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.'; end if;
  if upper(coalesce(v_sale.status,'COMPLETED'))='CANCELLED' then
    raise exception 'La venta ya fue anulada.';
  end if;
  if v_sale.cash_session_id is not null then
    select upper(status) into v_cash_status
    from public.cash_sessions where id=v_sale.cash_session_id;
    if coalesce(v_cash_status,'CLOSED')<>'OPEN' then
      raise exception 'No se puede anular una venta de una caja ya cerrada.';
    end if;
  end if;

  update public.products p
  set stock=coalesce(p.stock,0)+q.quantity
  from (
    select product_id,sum(quantity) quantity
    from public.sale_items
    where sale_id=p_sale_id
    group by product_id
  ) q
  where p.id=q.product_id;

  update public.sales set
    status='CANCELLED',
    voided_at=now(),
    voided_by=p_actor_id,
    void_reason=trim(p_reason)
  where id=p_sale_id;

  insert into public.sale_voids
    (sale_id,invoice_no,cash_session_id,total,payment_method,reason,
     voided_by,voided_by_name)
  values
    (v_sale.id,v_sale.invoice_no,v_sale.cash_session_id,v_sale.total,
     v_sale.payment_method,trim(p_reason),p_actor_id,v_actor_name);

  return jsonb_build_object(
    'ok',true,'sale_id',v_sale.id,'invoice_no',v_sale.invoice_no,
    'status','CANCELLED','stock_restored',true
  );
end;
$$;

grant execute on function public.mm_get_commercial_policy() to anon,authenticated;
grant execute on function public.mm_save_commercial_policy(uuid,boolean,numeric,boolean,boolean,boolean) to anon,authenticated;
grant execute on function public.mm_void_sale(uuid,uuid,text) to anon,authenticated;

-- Evita crear el mismo producto más de una vez dentro de la misma unidad.
create or replace function public.mm_normalize_product_identity(p_value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(p_value,'')), '\s+', ' ', 'g'));
$$;

create or replace function public.mm_prevent_duplicate_product()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_existing record;
begin
  -- Permite actualizar precio, costo o stock de duplicados históricos mientras
  -- no se modifique su identidad. Los nuevos duplicados siempre se bloquean.
  if tg_op='UPDATE'
     and new.business_unit_id is not distinct from old.business_unit_id
     and public.mm_normalize_product_identity(new.supplier_code)
         = public.mm_normalize_product_identity(old.supplier_code)
     and public.mm_normalize_product_identity(new.manufacturer_code)
         = public.mm_normalize_product_identity(old.manufacturer_code)
     and public.mm_normalize_product_identity(new.barcode)
         = public.mm_normalize_product_identity(old.barcode)
     and public.mm_normalize_product_identity(new.name)
         = public.mm_normalize_product_identity(old.name)
     and public.mm_normalize_product_identity(new.brand)
         = public.mm_normalize_product_identity(old.brand)
  then
    return new;
  end if;

  select p.id,p.internal_code,p.name
  into v_existing
  from public.products p
  where p.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
    and p.business_unit_id is not distinct from new.business_unit_id
    and (
      (
        public.mm_normalize_product_identity(new.supplier_code)<>''
        and public.mm_normalize_product_identity(p.supplier_code)
            = public.mm_normalize_product_identity(new.supplier_code)
      )
      or (
        public.mm_normalize_product_identity(new.manufacturer_code)<>''
        and public.mm_normalize_product_identity(p.manufacturer_code)
            = public.mm_normalize_product_identity(new.manufacturer_code)
      )
      or (
        public.mm_normalize_product_identity(new.barcode)<>''
        and public.mm_normalize_product_identity(p.barcode)
            = public.mm_normalize_product_identity(new.barcode)
      )
      or (
        public.mm_normalize_product_identity(new.name)<>''
        and public.mm_normalize_product_identity(p.name)
            = public.mm_normalize_product_identity(new.name)
        and public.mm_normalize_product_identity(p.brand)
            = public.mm_normalize_product_identity(new.brand)
      )
    )
  order by p.created_at
  limit 1;

  if found then
    raise exception
      'PRODUCTO_DUPLICADO: Ya existe % (%) en esta unidad. Edite el registro existente.',
      v_existing.name,v_existing.internal_code
      using errcode='23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_mm_prevent_duplicate_product on public.products;
create trigger trg_mm_prevent_duplicate_product
before insert or update of
  business_unit_id,supplier_code,manufacturer_code,barcode,name,brand
on public.products
for each row execute function public.mm_prevent_duplicate_product();

-- Convierte las políticas existentes a margen real sobre venta.
-- Los productos con precio manual no se modifican.
update public.products
set sale_price =
      ceil(
        (
          purchase_price /
          (1 - (profit_margin / 100))
        ) * 100
      ) / 100,
    public_price =
      ceil(
        (
          purchase_price /
          (1 - (profit_margin / 100))
        ) * 100
      ) / 100,
    updated_at = now()
where coalesce(allow_manual_price,false)=false
  and coalesce(purchase_price,0)>0
  and coalesce(profit_margin,0)>0
  and profit_margin<100;

commit;
