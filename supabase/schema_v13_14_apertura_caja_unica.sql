-- MYM Comercial ERP V13.14
-- Corrige aperturas duplicadas y evita que vuelvan a ocurrir.
-- No elimina sesiones: las aperturas duplicadas se conservan como CLOSED.

begin;

-- 1. Cerrar técnicamente duplicados existentes.
-- Se conserva, por cada caja, la sesión con ventas; si ninguna tiene ventas,
-- se prioriza la que tiene fondo inicial distinto de cero y luego la más antigua.
with ranked_open_sessions as (
  select
    cs.id,
    row_number() over (
      partition by coalesce(cs.cash_box_id::text, lower(trim(cs.box_name)))
      order by
        (select count(*) from public.sales s where s.cash_session_id=cs.id) desc,
        case when coalesce(cs.opening_cash_nio,cs.opening_amount,0)<>0
               or coalesce(cs.opening_cash_usd,0)<>0 then 1 else 0 end desc,
        cs.opened_at asc,
        cs.id asc
    ) as position
  from public.cash_sessions cs
  where upper(coalesce(cs.status,''))='OPEN'
), duplicate_sessions as (
  select id from ranked_open_sessions where position>1
)
update public.cash_sessions cs
set
  status='CLOSED',
  closed_at=coalesce(cs.closed_at,now()),
  notes=concat_ws(E'\n',nullif(cs.notes,''),'Cierre técnico V13.14: apertura duplicada; registro conservado para auditoría.')
where cs.id in (select id from duplicate_sessions);

-- 2. Restricciones físicas: una sola sesión OPEN por caja.
create unique index if not exists uq_cash_sessions_open_cash_box_v1314
  on public.cash_sessions(cash_box_id)
  where upper(coalesce(status,''))='OPEN' and cash_box_id is not null;

create unique index if not exists uq_cash_sessions_open_box_name_v1314
  on public.cash_sessions(lower(trim(box_name)))
  where upper(coalesce(status,''))='OPEN' and cash_box_id is null;

-- 3. Apertura atómica. El bloqueo y los índices cubren doble clic y dos equipos.
create or replace function public.open_cash_session_v1314(
  p_cash_box_id uuid,
  p_box_name text,
  p_cashier_name text,
  p_opened_by text,
  p_opening_nio numeric default 0,
  p_opening_usd numeric default 0
)
returns public.cash_sessions
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.cash_sessions;
begin
  if p_cash_box_id is null then
    raise exception 'INVALID_CASH_BOX';
  end if;
  if coalesce(p_opening_nio,0)<0 or coalesce(p_opening_usd,0)<0 then
    raise exception 'INVALID_OPENING_AMOUNT';
  end if;

  perform pg_advisory_xact_lock(hashtext('MYM_CASH_BOX:'||p_cash_box_id::text));

  if exists (
    select 1 from public.cash_sessions
    where cash_box_id=p_cash_box_id
      and upper(coalesce(status,''))='OPEN'
  ) then
    raise exception 'CASH_BOX_ALREADY_OPEN';
  end if;

  insert into public.cash_sessions(
    cash_box_id,box_name,cashier_name,opened_by,status,opened_at,
    opening_amount,opening_cash_nio,opening_cash_usd,
    expected_cash_nio,expected_cash_usd
  ) values (
    p_cash_box_id,coalesce(nullif(trim(p_box_name),''),'Caja'),
    coalesce(nullif(trim(p_cashier_name),''),'Cajero'),p_opened_by,'OPEN',now(),
    coalesce(p_opening_nio,0),coalesce(p_opening_nio,0),coalesce(p_opening_usd,0),
    coalesce(p_opening_nio,0),coalesce(p_opening_usd,0)
  ) returning * into v_session;

  return v_session;
exception
  when unique_violation then
    raise exception 'CASH_BOX_ALREADY_OPEN';
end;
$$;

revoke all on function public.open_cash_session_v1314(uuid,text,text,text,numeric,numeric) from public;
grant execute on function public.open_cash_session_v1314(uuid,text,text,text,numeric,numeric) to anon, authenticated;

commit;

-- Verificación: debe devolver una fila OPEN por cada caja como máximo.
select
  coalesce(cs.cash_box_id::text,cs.box_name) as caja,
  count(*) as sesiones_abiertas
from public.cash_sessions cs
where upper(coalesce(cs.status,''))='OPEN'
group by coalesce(cs.cash_box_id::text,cs.box_name)
order by caja;
