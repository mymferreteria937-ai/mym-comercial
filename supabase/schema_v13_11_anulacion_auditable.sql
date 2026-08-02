-- MYM Comercial ERP V13.11
-- Anulación auditable: motivo obligatorio, usuario, fecha y restauración de stock.

alter table if exists public.sales add column if not exists voided_at timestamptz;
alter table if exists public.sales add column if not exists voided_by uuid;
alter table if exists public.sales add column if not exists void_reason text;

create table if not exists public.sale_voids (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  invoice_no text,
  cash_session_id uuid,
  total numeric(14,2) not null default 0,
  payment_method text,
  reason text not null,
  voided_by uuid,
  voided_by_name text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='sales_cancelled_requires_reason_v1311'
      and conrelid='public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_cancelled_requires_reason_v1311
      check (
        upper(coalesce(status,'COMPLETED'))<>'CANCELLED'
        or length(trim(coalesce(void_reason,'')))>=5
      ) not valid;
  end if;
end $$;

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
  v_reason text:=trim(coalesce(p_reason,''));
begin
  if length(v_reason)<5 then
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
    void_reason=v_reason
  where id=p_sale_id;

  insert into public.sale_voids
    (sale_id,invoice_no,cash_session_id,total,payment_method,reason,voided_by,voided_by_name)
  values
    (v_sale.id,v_sale.invoice_no,v_sale.cash_session_id,v_sale.total,v_sale.payment_method,v_reason,p_actor_id,v_actor_name);

  return jsonb_build_object(
    'ok',true,
    'sale_id',v_sale.id,
    'invoice_no',v_sale.invoice_no,
    'status','CANCELLED',
    'void_reason',v_reason,
    'voided_by_name',v_actor_name,
    'voided_at',now(),
    'stock_restored',true
  );
end;
$$;

grant select on public.sale_voids to anon,authenticated;
grant execute on function public.mm_void_sale(uuid,uuid,text) to anon,authenticated;

select 'V13.11 instalada: anulación con motivo obligatorio' as resultado;
