-- =========================================================
-- MM Comercial ERP V11.1
-- Mesa de Cambio + Arqueo Bimoneda
-- Ejecutar en Supabase SQL Editor antes de usar el módulo.
-- =========================================================

CREATE TABLE IF NOT EXISTS exchange_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_session_id uuid REFERENCES cash_sessions(id) ON DELETE SET NULL,
    operation_type text NOT NULL CHECK (operation_type IN ('BUY_USD','SELL_USD')),
    currency_from text NOT NULL DEFAULT 'NIO',
    currency_to text NOT NULL DEFAULT 'USD',
    amount_usd numeric NOT NULL DEFAULT 0,
    rate numeric NOT NULL DEFAULT 0,
    amount_nio numeric NOT NULL DEFAULT 0,
    reference_rate numeric DEFAULT 0,
    profit_nio numeric NOT NULL DEFAULT 0,
    customer_name text,
    reference text,
    notes text,
    status text NOT NULL DEFAULT 'COMPLETED',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_operations_session ON exchange_operations(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_exchange_operations_created_at ON exchange_operations(created_at);
CREATE INDEX IF NOT EXISTS idx_exchange_operations_type ON exchange_operations(operation_type);

CREATE OR REPLACE VIEW v_exchange_operations_summary AS
SELECT
    eo.cash_session_id,
    COUNT(*) AS total_operations,
    COALESCE(SUM(CASE WHEN eo.operation_type='SELL_USD' THEN eo.amount_usd ELSE 0 END),0) AS usd_sold,
    COALESCE(SUM(CASE WHEN eo.operation_type='BUY_USD' THEN eo.amount_usd ELSE 0 END),0) AS usd_bought,
    COALESCE(SUM(CASE WHEN eo.operation_type='SELL_USD' THEN eo.amount_nio ELSE 0 END),0) AS nio_in,
    COALESCE(SUM(CASE WHEN eo.operation_type='BUY_USD' THEN eo.amount_nio ELSE 0 END),0) AS nio_out,
    COALESCE(SUM(CASE WHEN eo.operation_type='BUY_USD' THEN eo.amount_usd ELSE 0 END),0)
      - COALESCE(SUM(CASE WHEN eo.operation_type='SELL_USD' THEN eo.amount_usd ELSE 0 END),0) AS usd_delta,
    COALESCE(SUM(CASE WHEN eo.operation_type='SELL_USD' THEN eo.amount_nio ELSE 0 END),0)
      - COALESCE(SUM(CASE WHEN eo.operation_type='BUY_USD' THEN eo.amount_nio ELSE 0 END),0) AS nio_delta,
    COALESCE(SUM(eo.profit_nio),0) AS exchange_profit_nio
FROM exchange_operations eo
WHERE eo.status <> 'VOID'
GROUP BY eo.cash_session_id;
