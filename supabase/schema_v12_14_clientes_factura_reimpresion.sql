-- MM Comercial ERP V12.14
-- Clientes, nombre en factura y reimpresión histórica

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_type text DEFAULT 'CONSUMIDOR FINAL',
  ADD COLUMN IF NOT EXISTS segment text DEFAULT 'NUEVO';

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text;

-- Completa el nombre en ventas anteriores que ya tenían customer_id.
UPDATE public.sales s
SET customer_name = COALESCE(s.customer_name, c.name),
    customer_phone = COALESCE(s.customer_phone, c.phone)
FROM public.customers c
WHERE s.customer_id = c.id
  AND (s.customer_name IS NULL OR s.customer_phone IS NULL);

NOTIFY pgrst, 'reload schema';
