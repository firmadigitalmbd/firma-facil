-- =====================================================================
-- Asistencia, FASE 2: PIN, salario, reglas de nómina y festivos.
-- Ejecuta DESPUÉS de sql/asistencia.sql. Se puede correr más de una vez.
-- =====================================================================

-- PIN de 4 dígitos: solo la administradora lo asigna o cambia. Se guarda
-- cifrado (scrypt). Tras 5 intentos fallidos se bloquea 15 minutos.
alter table att_employees add column if not exists pin_hash text;
alter table att_employees add column if not exists pin_failed int not null default 0;
alter table att_employees add column if not exists pin_locked_until timestamptz;

-- Salario mensual (opcional): con él se calcula el valor de recargos y extras.
alter table att_employees add column if not exists monthly_salary numeric;

-- Reglas de nómina (editables desde Asistencia > Reglas).
-- Los porcentajes son el recargo sobre el valor de la hora ordinaria.
-- Valores iniciales según la normativa colombiana vigente a nov. 2026
-- (Ley 2466 de 2025 y Ley 2101 de 2021): confírmalos con tu contador.
alter table att_settings add column if not exists night_start text not null default '19:00';
alter table att_settings add column if not exists night_end text not null default '06:00';
alter table att_settings add column if not exists daily_limit_hours numeric not null default 8;
alter table att_settings add column if not exists weekly_limit_hours numeric not null default 42;
alter table att_settings add column if not exists monthly_hours numeric not null default 210;
alter table att_settings add column if not exists rates jsonb not null default '{
  "ordinary_day": 0,
  "ordinary_night": 35,
  "ordinary_holiday_day": 90,
  "ordinary_holiday_night": 125,
  "extra_day": 25,
  "extra_night": 75,
  "extra_holiday_day": 115,
  "extra_holiday_night": 165
}'::jsonb;

-- Festivos y domingos pagan recargo. Los domingos se detectan solos; aquí
-- van los festivos (la pantalla puede generarlos por año).
create table if not exists att_holidays (
  day date primary key,
  name text not null
);
alter table att_holidays enable row level security;
