-- ============================================================
-- MM Comercial ERP - V12.6 Seguridad de Usuarios y Permisos
-- Ejecutar en Supabase SQL Editor ANTES de publicar la versión.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Normaliza estados para que el JS no dependa de ACTIVE/active mezclados.
UPDATE app_users
SET status = 'active'
WHERE status IS NULL OR upper(status) IN ('ACTIVE','ACTIVO','ENABLED');

UPDATE app_users
SET status = 'inactive'
WHERE upper(status) IN ('INACTIVE','INACTIVO','DISABLED','BAJA');

-- Asegura valores base.
UPDATE app_users
SET failed_login_attempts = COALESCE(failed_login_attempts,0),
    must_change_password = COALESCE(must_change_password,false),
    permissions = COALESCE(permissions,'{}'::jsonb),
    updated_at = COALESCE(updated_at,NOW());

-- Permisos base por rol. Puedes ajustarlos después desde el módulo Usuarios.
UPDATE app_users SET permissions = '{
  "dashboard": true, "pos": true, "clients": true, "products": true,
  "barcode": true, "cash": true, "exchange": true, "users": true,
  "promos": true, "profitability": true, "sales": true, "settings": true
}'::jsonb
WHERE upper(role)='ADMIN' AND (permissions = '{}'::jsonb OR permissions IS NULL);

UPDATE app_users SET permissions = '{
  "dashboard": true, "pos": true, "clients": true, "products": true,
  "barcode": true, "cash": true, "exchange": true, "users": false,
  "promos": true, "profitability": true, "sales": true, "settings": false
}'::jsonb
WHERE upper(role)='SUPERVISOR' AND (permissions = '{}'::jsonb OR permissions IS NULL);

UPDATE app_users SET permissions = '{
  "dashboard": true, "pos": true, "clients": true, "products": false,
  "barcode": false, "cash": true, "exchange": false, "users": false,
  "promos": false, "profitability": false, "sales": true, "settings": false
}'::jsonb
WHERE upper(role)='CAJERO' AND (permissions = '{}'::jsonb OR permissions IS NULL);

UPDATE app_users SET permissions = '{
  "dashboard": true, "pos": false, "clients": false, "products": true,
  "barcode": true, "cash": false, "exchange": false, "users": false,
  "promos": false, "profitability": false, "sales": false, "settings": false
}'::jsonb
WHERE upper(role)='BODEGA' AND (permissions = '{}'::jsonb OR permissions IS NULL);

UPDATE app_users SET permissions = '{
  "dashboard": true, "pos": false, "clients": true, "products": true,
  "barcode": false, "cash": false, "exchange": false, "users": false,
  "promos": false, "profitability": false, "sales": true, "settings": false
}'::jsonb
WHERE upper(role)='CONSULTA' AND (permissions = '{}'::jsonb OR permissions IS NULL);

-- Auditoría ligera para seguridad. Si ya existe, no rompe nada.
CREATE TABLE IF NOT EXISTS app_user_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username TEXT,
  action TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);
CREATE INDEX IF NOT EXISTS idx_app_user_audit_user ON app_user_audit(user_id);
