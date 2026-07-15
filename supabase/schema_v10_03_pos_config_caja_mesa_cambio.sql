-- =========================================================
-- MYM Comercial V10.03
-- POS + Política comercial + Arqueo US$ + Mesa de Cambio estable
-- Ejecutar después de los schemas V10/V11/V14 existentes.
-- =========================================================

-- 1) Política comercial configurable
CREATE TABLE IF NOT EXISTS commercial_policy_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_discount_percent numeric NOT NULL DEFAULT 7,
    transfer_discount_percent numeric NOT NULL DEFAULT 0,
    card_fee_included boolean NOT NULL DEFAULT true,
    require_transfer_reference boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

INSERT INTO commercial_policy_settings
(cash_discount_percent, transfer_discount_percent, card_fee_included, require_transfer_reference, status)
SELECT 7, 0, true, true, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM commercial_policy_settings WHERE status='ACTIVE');

-- 2) Detalle real del pago POS
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS payment_cash_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_card_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_transfer_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS auto_discount_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS commercial_policy jsonb DEFAULT '{}'::jsonb;

-- Normalizar método de pago histórico si existe TRANSFERENCIA simple.
UPDATE sales SET payment_method='TRANSFERENCIA BANCARIA' WHERE payment_method='TRANSFERENCIA';

-- 3) Arqueo separado por método y moneda
ALTER TABLE cash_sessions
ADD COLUMN IF NOT EXISTS counted_card numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS counted_transfer numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS counted_cash_usd numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS expected_cash_usd numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS difference_cash_usd numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS closing_note text;

-- 4) Mesa de Cambio: compatibilidad con versiones que buscaban customer_document
ALTER TABLE exchange_operations
ADD COLUMN IF NOT EXISTS customer_document text,
ADD COLUMN IF NOT EXISTS customer_document_type text,
ADD COLUMN IF NOT EXISTS customer_document_number text,
ADD COLUMN IF NOT EXISTS customer_phone text,
ADD COLUMN IF NOT EXISTS provider_name text DEFAULT 'BAC',
ADD COLUMN IF NOT EXISTS provider_buy_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS provider_sell_rate numeric DEFAULT 0;

UPDATE exchange_operations
SET customer_document = COALESCE(customer_document, CONCAT_WS(': ', customer_document_type, customer_document_number), reference)
WHERE customer_document IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_cash_session_payment ON sales(cash_session_id, payment_method);
CREATE INDEX IF NOT EXISTS idx_exchange_operations_customer_document_alias ON exchange_operations(customer_document);
