-- =====================================================================
-- Asistencia, FASE 3: verificación durante el turno y cierre de periodo.
-- Ejecuta DESPUÉS de asistencia.sql y asistencia-fase2.sql. Se puede
-- correr más de una vez.
-- =====================================================================

-- Nuevo tipo de registro: 'verify' (verificación a mitad del turno).
alter table att_records drop constraint if exists att_records_kind_check;
alter table att_records add constraint att_records_kind_check
  check (kind in ('in', 'out', 'verify'));

-- Cuando el cierre de periodo borra la foto, queda la fecha del borrado
-- (el registro con hora, sede y ubicación se conserva).
alter table att_records add column if not exists photo_deleted_at timestamptz;

-- Verificación opcional: la administradora la activa o desactiva.
-- verify_enabled_since evita marcar como "sin verificación" los turnos
-- anteriores al momento en que se activó.
alter table att_settings add column if not exists verify_enabled boolean not null default false;
alter table att_settings add column if not exists verify_after_hours numeric not null default 4;
alter table att_settings add column if not exists verify_enabled_since timestamptz;

-- Periodos cerrados (quincena, mes o cada pago). Guarda una copia del
-- resumen de horas y pagos con las reglas que se usaron.
create table if not exists att_periods (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  from_day date not null,
  to_day date not null,
  closed_by text,
  photos_deleted int not null default 0,
  summary jsonb not null,
  constraint att_periods_range check (from_day <= to_day)
);
create unique index if not exists att_periods_range_idx on att_periods (from_day, to_day);
alter table att_periods enable row level security;
