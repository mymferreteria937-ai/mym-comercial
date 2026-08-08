-- MYM Comercial ERP V13.16
-- Módulo independiente de cotizaciones para la base V13.14.
-- No modifica usuarios, autenticación, caja, ventas ni inventario.

begin;

create sequence if not exists public.quotation_number_seq_v1316;

create or replace function public.next_quotation_number_v1316()
returns text
language sql
volatile
set search_path=public
as $$
  select 'COT-'||to_char(now() at time zone 'America/Managua','YYYYMM')||'-'||
    lpad(nextval('public.quotation_number_seq_v1316')::text,5,'0');
$$;

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quote_no text not null unique default public.next_quotation_number_v1316(),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  customer_address text,
  business_unit_id uuid references public.business_units(id) on delete set null,
  status text not null default 'DRAFT'
    check(status in ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
  valid_until date not null default (current_date+15),
  notes text,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_code text,
  product_name text not null,
  unit_type text,
  quantity numeric(12,3) not null check(quantity>0),
  unit_price numeric(14,2) not null check(unit_price>=0),
  total numeric(14,2) not null default 0,
  sort_order integer not null default 0
);

create table if not exists public.quotation_status_history (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.app_users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_quotations_created_v1316
  on public.quotations(created_at desc);
create index if not exists idx_quotations_customer_v1316
  on public.quotations(customer_id,created_at desc);
create index if not exists idx_quotation_items_quote_v1316
  on public.quotation_items(quotation_id,sort_order);
create index if not exists idx_quotation_status_history_v1316
  on public.quotation_status_history(quotation_id,changed_at desc);

-- Confirma que el identificador pertenece a un usuario activo con permiso operativo.
create or replace function public.mm_quotation_actor_v1316(p_actor_id uuid)
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select u.id
  from public.app_users u
  where u.id=p_actor_id
    and lower(coalesce(u.status,''))='active'
    and (
      upper(coalesce(u.role,''))='ADMIN'
      or case
        when coalesce(u.permissions,'{}'::jsonb) ? 'quotations'
          then lower(coalesce(u.permissions->>'quotations','false'))='true'
        else upper(coalesce(u.role,'')) in ('SUPERVISOR','CAJERO','CONSULTA')
      end
    )
  limit 1;
$$;

create or replace function public.mm_save_quotation_v1316(
  p_actor_id uuid,
  p_quotation_id uuid,
  p_header jsonb,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=public.mm_quotation_actor_v1316(p_actor_id);
  v_id uuid;
  v_quote_no text;
  v_subtotal numeric(14,2);
  v_discount numeric(14,2):=greatest(0,coalesce((p_header->>'discount')::numeric,0));
  v_total numeric(14,2);
begin
  if v_actor is null then raise exception 'NOT_AUTHORIZED'; end if;
  if trim(coalesce(p_header->>'customer_name',''))='' then raise exception 'CUSTOMER_REQUIRED'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'ITEMS_REQUIRED'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) x
    where coalesce((x->>'quantity')::numeric,0)<=0
       or coalesce((x->>'unit_price')::numeric,-1)<0
       or trim(coalesce(x->>'product_name',''))=''
  ) then
    raise exception 'INVALID_QUOTATION_ITEM';
  end if;

  select round(coalesce(sum(
    round((x->>'quantity')::numeric*(x->>'unit_price')::numeric,2)
  ),0),2)
  into v_subtotal
  from jsonb_array_elements(p_items) x;

  v_discount:=least(v_discount,v_subtotal);
  v_total:=v_subtotal-v_discount;

  if p_quotation_id is null then
    insert into public.quotations(
      customer_id,customer_name,customer_phone,customer_email,customer_address,
      business_unit_id,status,valid_until,notes,subtotal,discount,total,
      created_by,updated_by
    ) values (
      nullif(p_header->>'customer_id','')::uuid,
      trim(p_header->>'customer_name'),
      nullif(trim(coalesce(p_header->>'customer_phone','')),''),
      nullif(trim(coalesce(p_header->>'customer_email','')),''),
      nullif(trim(coalesce(p_header->>'customer_address','')),''),
      nullif(p_header->>'business_unit_id','')::uuid,
      'DRAFT',
      coalesce(nullif(p_header->>'valid_until','')::date,current_date+15),
      nullif(trim(coalesce(p_header->>'notes','')),''),
      v_subtotal,v_discount,v_total,v_actor,v_actor
    )
    returning id,quote_no into v_id,v_quote_no;

    insert into public.quotation_status_history(
      quotation_id,old_status,new_status,changed_by
    ) values(v_id,null,'DRAFT',v_actor);
  else
    update public.quotations
    set customer_id=nullif(p_header->>'customer_id','')::uuid,
        customer_name=trim(p_header->>'customer_name'),
        customer_phone=nullif(trim(coalesce(p_header->>'customer_phone','')),''),
        customer_email=nullif(trim(coalesce(p_header->>'customer_email','')),''),
        customer_address=nullif(trim(coalesce(p_header->>'customer_address','')),''),
        business_unit_id=nullif(p_header->>'business_unit_id','')::uuid,
        valid_until=coalesce(nullif(p_header->>'valid_until','')::date,current_date+15),
        notes=nullif(trim(coalesce(p_header->>'notes','')),''),
        subtotal=v_subtotal,
        discount=v_discount,
        total=v_total,
        updated_by=v_actor,
        updated_at=now()
    where id=p_quotation_id
      and status in ('DRAFT','SENT')
    returning id,quote_no into v_id,v_quote_no;

    if v_id is null then raise exception 'QUOTATION_NOT_EDITABLE'; end if;
    delete from public.quotation_items where quotation_id=v_id;
  end if;

  insert into public.quotation_items(
    quotation_id,product_id,product_code,product_name,unit_type,
    quantity,unit_price,total,sort_order
  )
  select
    v_id,
    nullif(x->>'product_id','')::uuid,
    nullif(trim(coalesce(x->>'product_code','')),''),
    trim(x->>'product_name'),
    coalesce(nullif(trim(coalesce(x->>'unit_type','')),''),'UND'),
    (x->>'quantity')::numeric,
    (x->>'unit_price')::numeric,
    round((x->>'quantity')::numeric*(x->>'unit_price')::numeric,2),
    ord::integer
  from jsonb_array_elements(p_items) with ordinality as t(x,ord);

  return jsonb_build_object(
    'ok',true,'id',v_id,'quote_no',v_quote_no,
    'subtotal',v_subtotal,'discount',v_discount,'total',v_total
  );
end;
$$;

create or replace function public.mm_list_quotations_v1316(p_actor_id uuid)
returns setof public.quotations
language plpgsql
security definer
set search_path=public
as $$
begin
  if public.mm_quotation_actor_v1316(p_actor_id) is null then raise exception 'NOT_AUTHORIZED'; end if;

  update public.quotations
  set status='EXPIRED',updated_at=now()
  where status in ('DRAFT','SENT') and valid_until<current_date;

  return query
  select * from public.quotations order by created_at desc;
end;
$$;

create or replace function public.mm_get_quotation_v1316(
  p_actor_id uuid,
  p_quotation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_quote public.quotations%rowtype;
  v_items jsonb;
begin
  if public.mm_quotation_actor_v1316(p_actor_id) is null then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_quote
  from public.quotations
  where id=p_quotation_id;
  if not found then raise exception 'QUOTATION_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order),'[]'::jsonb)
  into v_items
  from public.quotation_items i
  where i.quotation_id=p_quotation_id;

  return jsonb_build_object('quotation',to_jsonb(v_quote),'items',v_items);
end;
$$;

create or replace function public.mm_set_quotation_status_v1316(
  p_actor_id uuid,
  p_quotation_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=public.mm_quotation_actor_v1316(p_actor_id);
  v_status text:=upper(coalesce(p_status,''));
  v_old_status text;
begin
  if v_actor is null then raise exception 'NOT_AUTHORIZED'; end if;
  if v_status not in ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED') then
    raise exception 'INVALID_STATUS';
  end if;

  select status into v_old_status
  from public.quotations
  where id=p_quotation_id
  for update;
  if not found then raise exception 'QUOTATION_NOT_FOUND'; end if;

  if v_old_status is distinct from v_status then
    update public.quotations
    set status=v_status,updated_by=v_actor,updated_at=now()
    where id=p_quotation_id;

    insert into public.quotation_status_history(
      quotation_id,old_status,new_status,changed_by
    ) values(p_quotation_id,v_old_status,v_status,v_actor);
  end if;

  return jsonb_build_object('ok',true,'status',v_status);
end;
$$;

revoke all on public.quotations from anon,authenticated;
revoke all on public.quotation_items from anon,authenticated;
revoke all on public.quotation_status_history from anon,authenticated;
revoke all on function public.mm_quotation_actor_v1316(uuid) from public,anon,authenticated;

grant execute on function public.mm_save_quotation_v1316(uuid,uuid,jsonb,jsonb) to anon,authenticated;
grant execute on function public.mm_list_quotations_v1316(uuid) to anon,authenticated;
grant execute on function public.mm_get_quotation_v1316(uuid,uuid) to anon,authenticated;
grant execute on function public.mm_set_quotation_status_v1316(uuid,uuid,text) to anon,authenticated;

commit;

select 'V13.16 instalada: módulo de cotizaciones listo' as resultado;
