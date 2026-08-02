-- Solo consulta. No modifica datos.
select
  s.invoice_no,
  s.status,
  s.voided_at at time zone 'America/Managua' as anulada_fecha_local,
  u.name as anulada_por,
  s.void_reason as motivo,
  case
    when upper(coalesce(s.status,''))<>'CANCELLED' then 'NO APLICA'
    when length(trim(coalesce(s.void_reason,'')))>=5 then 'CORRECTO'
    else 'REVISAR: ANULACIÓN ANTIGUA SIN MOTIVO'
  end as validacion
from public.sales s
left join public.app_users u on u.id=s.voided_by
where upper(coalesce(s.status,''))='CANCELLED'
order by s.voided_at desc nulls last, s.created_at desc;

select
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='mm_void_sale'
  ) as funcion_instalada,
  exists(
    select 1 from pg_constraint
    where conname='sales_cancelled_requires_reason_v1311'
  ) as validacion_obligatoria_instalada;
