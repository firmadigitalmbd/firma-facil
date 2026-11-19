-- =====================================================================
-- Asistencia - Fase 4
-- Correr DESPUÉS de asistencia.sql, asistencia-fase2.sql y asistencia-fase3.sql.
-- Se puede correr más de una vez sin problema.
-- =====================================================================

-- 1. Correcciones de la administradora --------------------------------
-- manual = registro agregado a mano (no lo hizo el empleado).
-- original_recorded_at = la hora que tenía antes de corregirla.
-- voided_at = registro anulado: se conserva pero no cuenta para nada.
alter table att_records add column if not exists manual boolean not null default false;
alter table att_records add column if not exists original_recorded_at timestamptz;
alter table att_records add column if not exists edited_at timestamptz;
alter table att_records add column if not exists edited_by text;
alter table att_records add column if not exists edit_note text;
alter table att_records add column if not exists voided_at timestamptz;

-- 2. Ubicación de las sedes -------------------------------------------
-- Si la sede tiene coordenadas, se mide la distancia de cada marcación.
alter table att_sites add column if not exists lat double precision;
alter table att_sites add column if not exists lng double precision;
alter table att_sites add column if not exists radius_m integer not null default 150;

alter table att_records add column if not exists distance_m double precision;
alter table att_records add column if not exists out_of_range boolean not null default false;

-- Bloquear (true) o solo avisar (false) cuando marcan lejos de la sede.
alter table att_settings add column if not exists geofence_block boolean not null default false;

-- 3. Aviso al celular para la verificación ----------------------------
create table if not exists att_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  employee_id uuid not null references att_employees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text
);
create index if not exists att_push_subscriptions_employee_idx on att_push_subscriptions (employee_id);
alter table att_push_subscriptions enable row level security;

-- Cuándo se le avisó al empleado de esa entrada (para no repetir el aviso).
alter table att_records add column if not exists verify_notified_at timestamptz;
create index if not exists att_records_kind_time_idx on att_records (kind, recorded_at);
