-- MYM Comercial ERP V13.9
-- Eliminación segura y auditable de productos desde Inventario.

begin;

create table if not exists public.product_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  internal_code text,
  product_name text,
  action text not null check (action in ('DELETED','DEACTIVATED')),
  reason text not null,
  actor_id uuid not null,
  actor_name text,
  sale_lines integer not null default 0,
  movements integer not null default 0,
  imports integer not null default 0,
  snapshot jsonb,
  created_at timestamptz not null default now()
);

alter table public.product_deletion_audit enable row level security;

create or replace function public.mm_delete_inventory_product(
  p_product_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_mode text default 'DELETE'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.app_users%rowtype;
  v_product public.products%rowtype;
  v_mode text := upper(trim(coalesce(p_mode,'DELETE')));
  v_sales integer := 0;
  v_movements integer := 0;
  v_imports integer := 0;
begin
  if p_product_id is null or p_actor_id is null then
    return jsonb_build_object('ok',false,'message','Producto o administrador no identificado.');
  end if;

  if length(trim(coalesce(p_reason,''))) < 5 then
    return jsonb_build_object('ok',false,'message','El motivo debe tener al menos 5 caracteres.');
  end if;

  select * into v_actor
  from public.app_users
  where id=p_actor_id
  limit 1;

  if not found
     or upper(coalesce(v_actor.role,'')) <> 'ADMIN'
     or upper(coalesce(v_actor.status,'ACTIVE')) <> 'ACTIVE' then
    raise exception 'Solo un administrador activo puede eliminar o desactivar productos.'
      using errcode='42501';
  end if;

  select * into v_product
  from public.products
  where id=p_product_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'message','El producto ya no existe.');
  end if;

  if to_regclass('public.sale_items') is not null then
    execute 'select count(*)::integer from public.sale_items where product_id=$1'
      into v_sales using p_product_id;
  end if;
  if to_regclass('public.inventory_movements') is not null then
    execute 'select count(*)::integer from public.inventory_movements where product_id=$1'
      into v_movements using p_product_id;
  end if;
  if to_regclass('public.inventory_import_lines') is not null then
    execute 'select count(*)::integer from public.inventory_import_lines where product_id=$1'
      into v_imports using p_product_id;
  end if;

  if v_mode='DELETE' and (v_sales+v_movements+v_imports)>0 then
    return jsonb_build_object(
      'ok',false,'blocked',true,'can_deactivate',true,
      'sale_lines',v_sales,'movements',v_movements,'imports',v_imports,
      'message','El producto tiene historial y no puede eliminarse definitivamente.'
    );
  end if;

  if v_mode='DEACTIVATE' then
    insert into public.product_deletion_audit(
      product_id,internal_code,product_name,action,reason,actor_id,actor_name,
      sale_lines,movements,imports,snapshot
    ) values (
      v_product.id,v_product.internal_code,v_product.name,'DEACTIVATED',
      trim(p_reason),v_actor.id,v_actor.name,v_sales,v_movements,v_imports,
      to_jsonb(v_product)
    );
    update public.products
       set status='INACTIVE', updated_at=now()
     where id=p_product_id;
    return jsonb_build_object(
      'ok',true,'action','DEACTIVATED',
      'message','Producto desactivado sin borrar su historial.'
    );
  end if;

  if v_mode <> 'DELETE' then
    return jsonb_build_object('ok',false,'message','Modo de operación inválido.');
  end if;

  insert into public.product_deletion_audit(
    product_id,internal_code,product_name,action,reason,actor_id,actor_name,
    sale_lines,movements,imports,snapshot
  ) values (
    v_product.id,v_product.internal_code,v_product.name,'DELETED',
    trim(p_reason),v_actor.id,v_actor.name,v_sales,v_movements,v_imports,
    to_jsonb(v_product)
  );

  delete from public.products where id=p_product_id;

  return jsonb_build_object(
    'ok',true,'action','DELETED',
    'message','Producto eliminado correctamente.'
  );
exception
  when foreign_key_violation then
    return jsonb_build_object(
      'ok',false,'blocked',true,'can_deactivate',true,
      'sale_lines',v_sales,'movements',v_movements,'imports',v_imports,
      'message','Otro registro histórico protege este producto. Puede desactivarlo.'
    );
end;
$$;

revoke all on function public.mm_delete_inventory_product(uuid,uuid,text,text) from public;
grant execute on function public.mm_delete_inventory_product(uuid,uuid,text,text) to anon, authenticated;

commit;
