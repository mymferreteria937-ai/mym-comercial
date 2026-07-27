-- Validación de la mejora V13.9 (solo lectura).

-- 1) Confirma que la función segura existe.
select
  to_regprocedure(
    'public.mm_delete_inventory_product(uuid,uuid,text,text)'
  ) is not null as funcion_instalada;

-- 2) Muestra eliminaciones y desactivaciones realizadas desde el sistema.
select
  created_at,
  action,
  internal_code,
  product_name,
  reason,
  actor_name,
  sale_lines,
  movements,
  imports
from public.product_deletion_audit
order by created_at desc
limit 100;

-- 3) Confirma que los productos desactivados ya no están activos.
select
  id,
  internal_code,
  name,
  status,
  stock
from public.products
where upper(coalesce(status,'ACTIVE'))='INACTIVE'
order by updated_at desc nulls last;
