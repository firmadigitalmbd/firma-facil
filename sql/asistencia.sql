-- =====================================================================
-- Módulo de ASISTENCIA (registro de entrada y salida con foto y GPS)
-- Ejecuta este script completo en Supabase: SQL Editor > New query > Run
-- =====================================================================

-- Sedes donde trabajan los empleados.
create table if not exists att_sites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  address text,
  active boolean not null default true
);
create unique index if not exists att_sites_name_idx on att_sites (lower(name));

-- Empleados. Entran solo con la cédula; la crea la administradora.
-- active=false les niega el acceso. consent_* guarda la autorización de
-- tratamiento de datos (Ley 1581 de 2012) con el texto que aceptaron.
create table if not exists att_employees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cedula text not null unique,
  full_name text not null,
  active boolean not null default true,
  consent_at timestamptz,
  consent_text text
);

-- Sedes en las que cada empleado puede registrarse.
create table if not exists att_employee_sites (
  employee_id uuid not null references att_employees(id) on delete cascade,
  site_id uuid not null references att_sites(id) on delete cascade,
  primary key (employee_id, site_id)
);

-- Cada marcación. recorded_at lo pone la base de datos (hora del servidor),
-- nunca el celular.
create table if not exists att_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references att_employees(id),
  site_id uuid not null references att_sites(id),
  kind text not null check (kind in ('in', 'out')),
  recorded_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  accuracy double precision,
  photo_path text,
  ip text,
  user_agent text
);
create index if not exists att_records_employee_time_idx on att_records (employee_id, recorded_at desc);
create index if not exists att_records_time_idx on att_records (recorded_at desc);

-- Ajustes (una sola fila). Aquí vive el texto de autorización de datos;
-- en la fase 2 se agregan las reglas de nómina.
create table if not exists att_settings (
  id smallint primary key default 1,
  consent_text text not null,
  updated_at timestamptz not null default now(),
  constraint att_settings_singleton check (id = 1)
);

insert into att_settings (id, consent_text) values (
  1,
  'Autorizo a Más Baratas Droguerías a tratar mis datos personales (nombre, número de cédula, fotografía, fecha y hora de registro y ubicación geográfica) con la única finalidad de controlar mi asistencia y calcular mi jornada laboral y los recargos de nómina, de conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013. Sé que puedo conocer, actualizar, rectificar y solicitar la supresión de mis datos, salvo que exista un deber legal que lo impida. Este texto es un modelo de referencia; debe ser revisado por un abogado.'
) on conflict (id) do nothing;

-- Solo el backend (service role key) accede a estas tablas.
alter table att_sites enable row level security;
alter table att_employees enable row level security;
alter table att_employee_sites enable row level security;
alter table att_records enable row level security;
alter table att_settings enable row level security;

-- Bucket privado para las fotos de asistencia.
insert into storage.buckets (id, name, public)
values ('attendance', 'attendance', false)
on conflict (id) do nothing;
