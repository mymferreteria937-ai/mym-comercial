-- =========================================================
-- MM Comercial ERP V11.3.1 - Portal de ingreso y usuarios
-- Compatible con app_users existente: name, email, phone, role, status.
-- Ejecutar en Supabase SQL Editor antes de publicar en Vercel.
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
ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_unique
ON public.app_users (lower(username))
WHERE username IS NOT NULL;

-- Actualizar usuarios si ya existen por email o nombre
UPDATE public.app_users
SET username = 'jurguen.marin',
    name = 'Jurguen Marin',
    role = 'ADMIN',
    status = 'ACTIVE',
    password_hash = COALESCE(password_hash, '123456'),
    must_change_password = true,
    permissions = '{"all":true}'::jsonb,
    updated_at = now()
WHERE email IN ('jurguen@mmcomercial.local','jurguen.marin@mmcomercial.local')
   OR name ILIKE '%Jurguen%';

UPDATE public.app_users
SET username = 'mayquelin.mayorga',
    name = 'Mayquelin Mayorga',
    role = 'ADMIN',
    status = 'ACTIVE',
    password_hash = COALESCE(password_hash, '123456'),
    must_change_password = true,
    permissions = '{"all":true}'::jsonb,
    updated_at = now()
WHERE email IN ('mayquelin@mmcomercial.local','mayquelin.mayorga@mmcomercial.local')
   OR name ILIKE '%Mayquelin%';

UPDATE public.app_users
SET username = 'caja.mm',
    name = 'Caja MM',
    role = 'CAJERO',
    status = 'ACTIVE',
    password_hash = COALESCE(password_hash, '123456'),
    must_change_password = true,
    permissions = '{"pos":true,"cash":true,"exchange":true}'::jsonb,
    updated_at = now()
WHERE email = 'caja@mmcomercial.local'
   OR name ILIKE '%Caja%';

-- Insertar faltantes sin usar ON CONFLICT, porque tu tabla no nació con ganas de cooperar.
INSERT INTO public.app_users (name, username, email, phone, role, status, password_hash, must_change_password, permissions)
SELECT 'Jurguen Marin', 'jurguen.marin', 'jurguen@mmcomercial.local', null, 'ADMIN', 'ACTIVE', '123456', true, '{"all":true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.app_users WHERE username = 'jurguen.marin');

INSERT INTO public.app_users (name, username, email, phone, role, status, password_hash, must_change_password, permissions)
SELECT 'Mayquelin Mayorga', 'mayquelin.mayorga', 'mayquelin@mmcomercial.local', null, 'ADMIN', 'ACTIVE', '123456', true, '{"all":true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.app_users WHERE username = 'mayquelin.mayorga');

INSERT INTO public.app_users (name, username, email, phone, role, status, password_hash, must_change_password, permissions)
SELECT 'Caja MM', 'caja.mm', 'caja@mmcomercial.local', null, 'CAJERO', 'ACTIVE', '123456', true, '{"pos":true,"cash":true,"exchange":true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.app_users WHERE username = 'caja.mm');

SELECT username, name, role, status, must_change_password
FROM public.app_users
WHERE username IN ('jurguen.marin','mayquelin.mayorga','caja.mm')
ORDER BY username;
