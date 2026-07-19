-- Carga masiva - Cotización 1731 / Ferretería La Principal
-- Fecha: 13/07/2026. Total de compra: C$ 12,405.00
-- Reglas: cantidad = stock, precio unitario = costo, margen = 35%.
-- Es idempotente: ejecutar nuevamente NO duplica ni vuelve a sumar existencias.

begin;

alter table public.products add column if not exists supplier_name text;

create table if not exists public.inventory_import_lines (
  id uuid primary key default gen_random_uuid(),
  import_reference text not null,
  supplier_code text not null,
  product_id uuid references public.products(id),
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  imported_at timestamptz not null default now(),
  unique(import_reference, supplier_code)
);

do $$
declare
  v_unit_id uuid;
  v_category_id uuid;
  v_product_id uuid;
  v_code text;
  r record;
begin
  select id into v_unit_id
  from public.business_units
  where upper(coalesce(code,'')) in ('FER','FERRETERIA')
     or upper(name) like '%FERRETER%'
  order by case when upper(coalesce(code,''))='FER' then 0 else 1 end
  limit 1;

  if v_unit_id is null then
    raise exception 'No se encontró la unidad de negocio Ferretería.';
  end if;

  for r in
    select * from (values
      ('12261','PARAL DE 1 5/8 SIN MARCA',20::numeric,47.00::numeric,'PERFILERIA'),
      ('12262','PARAL DE 2 1/2 SIN MARCA',20,58.50,'PERFILERIA'),
      ('12263','PARAL DE 3 5/8 SIN MARCA',20,72.00,'PERFILERIA'),
      ('12264','RIEL DE 1 5/8 SIN MARCA',10,38.00,'PERFILERIA'),
      ('12265','RIEL DE 2 1/2 SIN MARCA',10,48.00,'PERFILERIA'),
      ('12266','RIEL DE 3 5/8 SIN MARCA',10,63.00,'PERFILERIA'),
      ('10759','ESQUINERO PLASTICO 10 PIES',10,54.00,'PERFILERIA'),
      ('12267','RIEL J PLASTICO SIN MARCA',10,55.00,'PERFILERIA'),
      ('10349','CANAL SOMBRERO C28 SFL 10 PIES',15,44.00,'PERFILERIA'),
      ('10087','ANGULAR GYPSUM 1X1X10',15,23.00,'PERFILERIA'),
      ('10944','LAMINA GYPSUM 4X8 PIES REGULAR KNAUF',6,375.00,'PERFILERIA'),
      ('15943','TUBO PVC 4 PULGADAS DRENAJE SDR 64 AMANCO',3,320.00,'PLOMERIA'),
      ('10348','CANAL LISO 6 METROS AMANCO',1,1185.00,'PLOMERIA'),
      ('10347','CANAL COLONIAL 6 METROS AMANCO',1,875.00,'PLOMERIA')
    ) as x(supplier_code,name,quantity,unit_cost,category_code)
  loop
    -- Si la línea ya fue importada, no se vuelve a sumar el stock.
    if exists (
      select 1 from public.inventory_import_lines
      where import_reference='COT-1731-2026-07-13'
        and supplier_code=r.supplier_code
    ) then
      continue;
    end if;

    select id into v_category_id
    from public.categories
    where business_unit_id=v_unit_id
      and (
        upper(coalesce(code,''))=r.category_code
        or (r.category_code='PLOMERIA' and upper(name) like '%PLOMER%')
        or (r.category_code='PERFILERIA' and (upper(name) like '%PERFIL%' or upper(name) like '%GYPS%'))
      )
    limit 1;

    if v_category_id is null then
      v_code := case when r.category_code='PERFILERIA' then 'PERFILERIA' else 'PLOMERIA' end;
      insert into public.categories(name,code,business_unit_id)
      values(case when r.category_code='PERFILERIA' then 'Perfilería y Gypsum' else 'Plomería' end,v_code,v_unit_id)
      returning id into v_category_id;
    end if;

    select id into v_product_id
    from public.products
    where supplier_code=r.supplier_code
      and business_unit_id=v_unit_id
    limit 1;

    if v_product_id is null then
      insert into public.products(
        internal_code,barcode,supplier_code,supplier_name,name,category_id,
        brand,unit_type,sale_type,allows_decimal,purchase_price,public_price,
        sale_price,profit_margin,allow_manual_price,stock,min_stock,max_stock,
        business_unit_id,status,last_cost_update
      ) values (
        'FER-'||r.supplier_code,r.supplier_code,r.supplier_code,'FERRETERIA LA PRINCIPAL',
        r.name,v_category_id,
        case when r.name like '%AMANCO%' then 'AMANCO' when r.name like '%KNAUF%' then 'KNAUF' else 'SIN MARCA' end,
        'UND','UNIDAD',false,r.unit_cost,round(r.unit_cost*1.35,2),
        round(r.unit_cost*1.35,2),35,false,r.quantity,0,0,
        v_unit_id,'ACTIVE',now()
      ) returning id into v_product_id;
    else
      update public.products
      set name=r.name,
          supplier_name='FERRETERIA LA PRINCIPAL',
          category_id=v_category_id,
          purchase_price=r.unit_cost,
          public_price=round(r.unit_cost*1.35,2),
          sale_price=round(r.unit_cost*1.35,2),
          profit_margin=35,
          allow_manual_price=false,
          stock=coalesce(stock,0)+r.quantity,
          last_cost_update=now()
      where id=v_product_id;
    end if;

    insert into public.inventory_import_lines(
      import_reference,supplier_code,product_id,quantity,unit_cost
    ) values (
      'COT-1731-2026-07-13',r.supplier_code,v_product_id,r.quantity,r.unit_cost
    );
  end loop;
end $$;

commit;

-- Resumen de verificación: debe devolver 14 líneas y C$ 12,405.00.
select count(*) as productos_importados,
       sum(quantity*unit_cost) as costo_total
from public.inventory_import_lines
where import_reference='COT-1731-2026-07-13';
