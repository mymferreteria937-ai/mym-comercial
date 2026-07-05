-- =========================================================
-- MM Comercial ERP V11.2
-- Mesa de Cambio controlada + clientes de cambio + dashboard
-- Ejecutar después de schema_v11_1_mesa_cambio.sql
-- =========================================================

CREATE TABLE IF NOT EXISTS exchange_rate_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name text NOT NULL DEFAULT 'BAC',
    provider_buy_rate numeric NOT NULL DEFAULT 36.30,
    provider_sell_rate numeric NOT NULL DEFAULT 37.14,
    mm_buy_rate numeric NOT NULL DEFAULT 36.20,
    mm_sell_rate numeric NOT NULL DEFAULT 37.25,
    effective_date date NOT NULL DEFAULT CURRENT_DATE,
    status text NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

INSERT INTO exchange_rate_settings
(provider_name, provider_buy_rate, provider_sell_rate, mm_buy_rate, mm_sell_rate, effective_date, status)
VALUES ('BAC', 36.30, 37.14, 36.20, 37.25, CURRENT_DATE, 'ACTIVE');

CREATE TABLE IF NOT EXISTS exchange_customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type text NOT NULL CHECK (document_type IN ('CEDULA','PASAPORTE','RESIDENCIA')),
    document_number text NOT NULL,
    full_name text NOT NULL,
    phone text,
    operations_count integer NOT NULL DEFAULT 0,
    last_operation_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(document_type, document_number)
);

ALTER TABLE exchange_operations
ADD COLUMN IF NOT EXISTS customer_document_type text,
ADD COLUMN IF NOT EXISTS customer_document_number text,
ADD COLUMN IF NOT EXISTS customer_phone text,
ADD COLUMN IF NOT EXISTS provider_name text DEFAULT 'BAC',
ADD COLUMN IF NOT EXISTS provider_buy_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS provider_sell_rate numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_exchange_customers_document ON exchange_customers(document_type, document_number);
CREATE INDEX IF NOT EXISTS idx_exchange_operations_customer_document ON exchange_operations(customer_document_type, customer_document_number);

CREATE OR REPLACE VIEW v_exchange_operations_detail AS
SELECT
    eo.*,
    CASE WHEN eo.operation_type='SELL_USD' THEN 'Cliente compra dólares' ELSE 'Cliente vende dólares' END AS operation_label,
    CASE WHEN eo.operation_type='SELL_USD' THEN eo.amount_nio ELSE 0 END AS nio_in,
    CASE WHEN eo.operation_type='BUY_USD' THEN eo.amount_nio ELSE 0 END AS nio_out,
    CASE WHEN eo.operation_type='BUY_USD' THEN eo.amount_usd ELSE 0 END AS usd_in,
    CASE WHEN eo.operation_type='SELL_USD' THEN eo.amount_usd ELSE 0 END AS usd_out
FROM exchange_operations eo;
