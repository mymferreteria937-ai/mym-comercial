-- =========================================================
-- MM Comercial ERP V11.4 - Autenticación Release Candidate
-- Ejecutar en Supabase SQL Editor antes de publicar en Vercel.
-- No elimina datos existentes. Adapta app_users a login por usuario.
-- =========================================================

ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true;

ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS failed_login_attempts integer DEFAULT 0;

ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS locked_until timestamp with time zone;

ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_unique
ON public.app_users (lower(username))
WHERE username IS NOT NULL;

-- Auditoría simple de seguridad y operación.
CREATE TABLE IF NOT EXISTS public.app_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  username text NULL,
  module text NOT NULL DEFAULT 'GENERAL',
  action text NOT NULL,
  status text NOT NULL DEFAULT 'SUCCESS',
  notes text NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- SHA-256 de la contraseña temporal 123456.
-- El sistema obliga a cambiarla en el primer ingreso.
-- 123456 -> 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92

UPDATE public.app_users
SET username = 'jurguen.marin',
    name = 'Jurguen Marin',
    role = 'ADMIN',
    status = 'ACTIVE',
    password_hash = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
    must_change_password = true,
    failed_login_attempts = 0,
    locked_until = null,
    permissions = '{"all":true}'::jsonb,
    updated_at = now()
WHERE username = 'jurguen.marin'
   OR email IN ('jurguen@mmcomercial.local','jurguen.marin@mmcomercial.local')
   OR name ILIKE '%Jurguen%';

UPDATE public.app_users
SET username = 'mayquelin.mayorga',
    name = 'Mayquelin Mayorga',
    role = 'ADMIN',
    status = 'ACTIVE',
    password_hash = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
    must_change_password = true,
    failed_login_attempts = 0,
    locked_until = null,
    permissions = '{"all":true}'::jsonb,
    updated_at = now()
WHERE username = 'mayquelin.mayorga'
   OR email IN ('mayquelin@mmcomercial.local','mayquelin.mayorga@mmcomercial.local')
   OR name ILIKE '%Mayquelin%';

UPDATE public.app_users
SET username = 'caja.mm',
    name = 'Caja MM',
    role = 'CAJERO',
    status = 'ACTIVE',
    password_hash = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
    must_change_password = true,
    failed_login_attempts = 0,
    locked_until = null,
    permissions = '{"pos":true,"cash":true,"exchange":true}'::jsonb,
    updated_at = now()
WHERE username = 'caja.mm'
   OR email = 'caja@mmcomercial.local'
   OR name ILIKE '%Caja%';

INSERT INTO public.app_users (name, username, email, phone, role, status, password_hash, must_change_password, failed_login_attempts, locked_until, permissions)
SELECT 'Jurguen Marin', 'jurguen.marin', 'jurguen@mmcomercial.local', null, 'ADMIN', 'ACTIVE', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', true, 0, null, '{"all":true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.app_users WHERE username = 'jurguen.marin');

INSERT INTO public.app_users (name, username, email, phone, role, status, password_hash, must_change_password, failed_login_attempts, locked_until, permissions)
SELECT 'Mayquelin Mayorga', 'mayquelin.mayorga', 'mayquelin@mmcomercial.local', null, 'ADMIN', 'ACTIVE', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', true, 0, null, '{"all":true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.app_users WHERE username = 'mayquelin.mayorga');

INSERT INTO public.app_users (name, username, email, phone, role, status, password_hash, must_change_password, failed_login_attempts, locked_until, permissions)
SELECT 'Caja MM', 'caja.mm', 'caja@mmcomercial.local', null, 'CAJERO', 'ACTIVE', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', true, 0, null, '{"pos":true,"cash":true,"exchange":true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.app_users WHERE username = 'caja.mm');

SELECT username, name, role, status, must_change_password, failed_login_attempts, locked_until
FROM public.app_users
WHERE username IN ('jurguen.marin','mayquelin.mayorga','caja.mm')
ORDER BY username;
