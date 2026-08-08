-- Validación de solo lectura para MYM Comercial ERP V13.16.
select
  case when to_regclass('public.quotations') is not null then 'OK' else 'FALTA' end as tabla_cotizaciones,
  case when to_regclass('public.quotation_items') is not null then 'OK' else 'FALTA' end as tabla_detalle,
  case when to_regclass('public.quotation_status_history') is not null then 'OK' else 'FALTA' end as tabla_historial,
  case when to_regprocedure('public.mm_save_quotation_v1316(uuid,uuid,jsonb,jsonb)') is not null then 'OK' else 'FALTA' end as guardar,
  case when to_regprocedure('public.mm_list_quotations_v1316(uuid)') is not null then 'OK' else 'FALTA' end as listar,
  case when to_regprocedure('public.mm_get_quotation_v1316(uuid,uuid)') is not null then 'OK' else 'FALTA' end as consultar,
  case when to_regprocedure('public.mm_set_quotation_status_v1316(uuid,uuid,text)') is not null then 'OK' else 'FALTA' end as cambiar_estado;
