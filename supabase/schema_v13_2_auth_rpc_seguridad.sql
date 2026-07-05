-- ============================================================
-- MYM Comercial ERP - V13.2 Seguridad y Autenticación Operativa
-- Objetivo:
--   - Evitar que el sistema dependa de UPDATE directo desde JavaScript.
--   - Permitir cambio obligatorio/voluntario de contraseña desde el ERP.
--   - Permitir crear, editar, inactivar y resetear usuarios desde el ERP.
--   - Corregir bloqueos por RLS sin tener que ejecutar SQL manual por usuario.
-- Ejecutar UNA VEZ en Supabase SQL Editor antes de publicar esta versión.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE app_users
SET status = 'active'
WHERE status IS NULL OR upper(status) IN ('ACTIVE','ACTIVO','ENABLED');

UPDATE app_users
SET status = 'inactive'
WHERE upper(status) IN ('INACTIVE','INACTIVO','DISABLED','BAJA');

UPDATE app_users
SET failed_login_attempts = COALESCE(failed_login_attempts,0),
    must_change_password = COALESCE(must_change_password,false),
    force_password_change = COALESCE(force_password_change,false),
    permissions = COALESCE(permissions,'{}'::jsonb),
    updated_at = COALESCE(updated_at,NOW());

CREATE TABLE IF NOT EXISTS app_user_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username TEXT,
  action TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(lower(username));
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);
CREATE INDEX IF NOT EXISTS idx_app_user_audit_user ON app_user_audit(user_id);

-- ------------------------------------------------------------
-- Función: validar si el actor es administrador.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_is_admin(p_actor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app_users
    WHERE id = p_actor_id
      AND lower(coalesce(status,'')) = 'active'
      AND upper(coalesce(role,'')) = 'ADMIN'
  );
$$;

-- ------------------------------------------------------------
-- Cambio de contraseña desde login o desde el ERP.
-- Verifica la contraseña actual por hash antes de actualizar.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_auth_change_password(
  p_username TEXT,
  p_current_hash TEXT,
  p_new_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_user
  FROM app_users
  WHERE lower(username) = lower(trim(p_username))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND', 'message', 'Usuario no encontrado.');
  END IF;

  IF lower(coalesce(v_user.status,'')) <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USER_INACTIVE', 'message', 'Usuario inactivo.');
  END IF;

  IF v_user.locked_until IS NOT NULL AND v_user.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USER_LOCKED', 'message', 'Usuario bloqueado temporalmente.');
  END IF;

  IF coalesce(v_user.password_hash,'') <> coalesce(p_current_hash,'') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURRENT_PASSWORD', 'message', 'La contraseña actual no es correcta.');
  END IF;

  UPDATE app_users
  SET password_hash = p_new_hash,
      must_change_password = false,
      force_password_change = false,
      failed_login_attempts = 0,
      locked_until = NULL,
      last_login_at = now(),
      last_password_change = now(),
      updated_at = now()
  WHERE id = v_user.id;

  INSERT INTO app_user_audit(user_id, username, action, description, created_by)
  VALUES(v_user.id, v_user.username, 'PASSWORD_CHANGE', 'Contraseña actualizada desde el sistema', v_user.id);

  SELECT * INTO v_user FROM app_users WHERE id = v_user.id;

  RETURN jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'email', v_user.email,
      'phone', v_user.phone,
      'role', v_user.role,
      'status', v_user.status,
      'permissions', coalesce(v_user.permissions,'{}'::jsonb),
      'must_change_password', v_user.must_change_password,
      'force_password_change', v_user.force_password_change,
      'failed_login_attempts', v_user.failed_login_attempts,
      'locked_until', v_user.locked_until,
      'last_login_at', v_user.last_login_at
    )
  );
END;
$$;

-- ------------------------------------------------------------
-- Crear o editar usuario desde el ERP.
-- Solo ADMIN activo puede ejecutar cambios administrativos.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_admin_save_user(
  p_actor_id UUID,
  p_user_id UUID,
  p_name TEXT,
  p_username TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_role TEXT,
  p_status TEXT,
  p_permissions JSONB,
  p_temp_hash TEXT DEFAULT NULL,
  p_force_change BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_exists UUID;
  v_actor app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM app_users WHERE id = p_actor_id LIMIT 1;
  IF NOT FOUND OR lower(coalesce(v_actor.status,'')) <> 'active' OR upper(coalesce(v_actor.role,'')) <> 'ADMIN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHORIZED', 'message', 'No tiene permisos para administrar usuarios.');
  END IF;

  IF coalesce(trim(p_name),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED', 'message', 'El nombre del usuario es obligatorio.');
  END IF;

  IF coalesce(trim(p_username),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USERNAME_REQUIRED', 'message', 'El usuario de acceso es obligatorio.');
  END IF;

  SELECT id INTO v_exists
  FROM app_users
  WHERE lower(username) = lower(trim(p_username))
    AND (p_user_id IS NULL OR id <> p_user_id)
  LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USERNAME_EXISTS', 'message', 'El usuario de acceso ya existe.');
  END IF;

  IF p_user_id IS NULL THEN
    INSERT INTO app_users(
      name, username, email, phone, role, status, permissions,
      password_hash, must_change_password, force_password_change,
      failed_login_attempts, locked_until, created_by, updated_by, updated_at
    ) VALUES (
      trim(p_name), lower(trim(p_username)), nullif(trim(coalesce(p_email,'')),''), nullif(trim(coalesce(p_phone,'')),''),
      upper(coalesce(p_role,'CAJERO')), lower(coalesce(p_status,'active')), coalesce(p_permissions,'{}'::jsonb),
      p_temp_hash, true, coalesce(p_force_change,true),
      0, NULL, p_actor_id, p_actor_id, now()
    ) RETURNING id INTO v_user_id;

    INSERT INTO app_user_audit(user_id, username, action, description, created_by)
    VALUES(v_user_id, lower(trim(p_username)), 'USER_CREATED', 'Usuario creado desde el ERP', p_actor_id);
  ELSE
    UPDATE app_users
    SET name = trim(p_name),
        username = lower(trim(p_username)),
        email = nullif(trim(coalesce(p_email,'')),''),
        phone = nullif(trim(coalesce(p_phone,'')),''),
        role = upper(coalesce(p_role,'CAJERO')),
        status = lower(coalesce(p_status,'active')),
        permissions = coalesce(p_permissions,'{}'::jsonb),
        updated_by = p_actor_id,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING id INTO v_user_id;

    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND', 'message', 'Usuario no encontrado.');
    END IF;

    INSERT INTO app_user_audit(user_id, username, action, description, created_by)
    VALUES(v_user_id, lower(trim(p_username)), 'USER_UPDATED', 'Usuario actualizado desde el ERP', p_actor_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id);
END;
$$;

-- ------------------------------------------------------------
-- Activar / inactivar usuario desde ERP.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_admin_set_user_status(
  p_actor_id UUID,
  p_user_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor app_users%ROWTYPE;
  v_username TEXT;
  v_status TEXT;
BEGIN
  SELECT * INTO v_actor FROM app_users WHERE id = p_actor_id LIMIT 1;
  IF NOT FOUND OR lower(coalesce(v_actor.status,'')) <> 'active' OR upper(coalesce(v_actor.role,'')) <> 'ADMIN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHORIZED', 'message', 'No tiene permisos para administrar usuarios.');
  END IF;

  v_status := CASE WHEN lower(coalesce(p_status,'')) = 'inactive' THEN 'inactive' ELSE 'active' END;

  UPDATE app_users
  SET status = v_status,
      locked_until = CASE WHEN v_status = 'active' THEN NULL ELSE locked_until END,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING username INTO v_username;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND', 'message', 'Usuario no encontrado.');
  END IF;

  INSERT INTO app_user_audit(user_id, username, action, description, created_by)
  VALUES(p_user_id, v_username, 'USER_STATUS_CHANGED', 'Estado cambiado a ' || v_status, p_actor_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ------------------------------------------------------------
-- Reset de contraseña desde ERP.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_admin_reset_password(
  p_actor_id UUID,
  p_user_id UUID,
  p_temp_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor app_users%ROWTYPE;
  v_username TEXT;
BEGIN
  SELECT * INTO v_actor FROM app_users WHERE id = p_actor_id LIMIT 1;
  IF NOT FOUND OR lower(coalesce(v_actor.status,'')) <> 'active' OR upper(coalesce(v_actor.role,'')) <> 'ADMIN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHORIZED', 'message', 'No tiene permisos para restablecer contraseñas.');
  END IF;

  IF coalesce(p_temp_hash,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TEMP_HASH_REQUIRED', 'message', 'No se recibió contraseña temporal.');
  END IF;

  UPDATE app_users
  SET password_hash = p_temp_hash,
      must_change_password = true,
      force_password_change = true,
      failed_login_attempts = 0,
      locked_until = NULL,
      status = 'active',
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING username INTO v_username;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND', 'message', 'Usuario no encontrado.');
  END IF;

  INSERT INTO app_user_audit(user_id, username, action, description, created_by)
  VALUES(p_user_id, v_username, 'PASSWORD_RESET', 'Contraseña temporal generada desde el ERP', p_actor_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mm_is_admin(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_auth_change_password(TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_admin_save_user(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_admin_set_user_status(UUID,UUID,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_admin_reset_password(UUID,UUID,TEXT) TO anon, authenticated;
