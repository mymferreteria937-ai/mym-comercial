-- =========================================================
-- MYM Comercial ERP - V14 Reportes, gastos y finanzas
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS business_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Otros',
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    business_unit_code TEXT NOT NULL DEFAULT 'GENERAL',
    payment_method TEXT DEFAULT 'EFECTIVO',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_expenses_date ON business_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_business_expenses_unit ON business_expenses(business_unit_code);

-- Campos auxiliares para filtrar por unidad de negocio sin romper versiones anteriores.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS business_unit_code TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS business_unit_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS business_unit_code TEXT;


-- Catálogo contable simple para estado de resultados y balance básico.
CREATE TABLE IF NOT EXISTS accounting_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','COSTO','GASTO')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO accounting_accounts(code,name,account_type) VALUES
('1000','Caja y Bancos','ACTIVO'),
('1100','Inventario','ACTIVO'),
('2000','Cuentas por pagar','PASIVO'),
('3000','Capital / Patrimonio','PATRIMONIO'),
('4000','Ingresos por ventas','INGRESO'),
('5000','Costo de ventas','COSTO'),
('6000','Gastos operativos','GASTO')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS accounting_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference TEXT,
    description TEXT,
    account_code TEXT REFERENCES accounting_accounts(code),
    debit NUMERIC(14,2) DEFAULT 0,
    credit NUMERIC(14,2) DEFAULT 0,
    business_unit_code TEXT DEFAULT 'GENERAL',
    source_table TEXT,
    source_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_date ON accounting_journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_account ON accounting_journal_entries(account_code);

-- Vistas de apoyo. El frontend calcula también, pero estas vistas sirven para BI o reportes futuros.
CREATE OR REPLACE VIEW v_daily_sales_report AS
SELECT
    DATE(created_at) AS sale_date,
    COALESCE(business_unit_code, business_unit_id::text, 'FER') AS business_unit_code,
    COUNT(*) AS invoices,
    COALESCE(SUM(total),0) AS total_sales,
    COALESCE(SUM(profit_total),0) AS gross_profit
FROM sales
GROUP BY DATE(created_at), COALESCE(business_unit_code, business_unit_id::text, 'FER');

CREATE OR REPLACE VIEW v_monthly_expenses_report AS
SELECT
    DATE_TRUNC('month', expense_date)::date AS month_date,
    business_unit_code,
    category,
    COALESCE(SUM(amount),0) AS total_expenses
FROM business_expenses
GROUP BY DATE_TRUNC('month', expense_date)::date, business_unit_code, category;

-- RLS simple para el modelo actual con anon key. Cuando migremos a Supabase Auth real, se endurece.
ALTER TABLE business_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_expenses_all_anon ON business_expenses;
CREATE POLICY business_expenses_all_anon ON business_expenses
FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS accounting_accounts_read_anon ON accounting_accounts;
CREATE POLICY accounting_accounts_read_anon ON accounting_accounts
FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS accounting_journal_all_anon ON accounting_journal_entries;
CREATE POLICY accounting_journal_all_anon ON accounting_journal_entries
FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON business_expenses TO anon;
GRANT SELECT ON accounting_accounts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_journal_entries TO anon;
