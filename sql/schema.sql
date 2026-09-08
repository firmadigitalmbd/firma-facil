-- Ejecuta este script completo en Supabase: Panel > SQL Editor > New query > pega esto > Run

create extension if not exists pgcrypto;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  original_filename text not null,
  storage_path_original text not null,
  storage_path_signed text,

  recipient_name text not null,
  recipient_cedula text not null,
  recipient_email text not null,

  -- posición del cuadro de firma, en fracciones (0 a 1) relativas a la página
  box_page int not null default 1,
  box_x double precision not null,
  box_y double precision not null,
  box_width double precision not null,
  box_height double precision not null,

  token text not null unique,

  opened_at timestamptz,
  signed_at timestamptz,
  status text not null default 'sent' -- sent | opened | signed
);

create index if not exists documents_token_idx on documents (token);

-- Storage: crea un bucket privado llamado "documents"
-- (Panel > Storage > New bucket > nombre: documents > Public: NO)
-- Este script no puede crear el bucket por ti; hazlo desde el panel de Supabase.

-- Como usamos la Service Role Key desde el servidor (nunca desde el navegador),
-- no es necesario configurar políticas RLS públicas: el backend tiene acceso total
-- y la tabla nunca se consulta directamente desde el cliente.
alter table documents enable row level security;
-- No se crean políticas (RLS activo = nadie puede leer/escribir directo desde el
-- navegador con la clave pública; solo el backend con la service role key puede).
