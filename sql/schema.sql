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

-- Columnas de evidencia del consentimiento: guardan una "foto" del texto legal
-- que la persona vio y aceptó en el momento de firmar (aunque después
-- cambies el texto en la tabla legal_texts, el histórico queda intacto),
-- y la IP desde la que firmó.
alter table documents add column if not exists consent_data_text text;
alter table documents add column if not exists consent_signature_text text;
alter table documents add column if not exists signer_ip text;

-- Textos legales que se muestran como checks antes de firmar. Es una tabla
-- de una sola fila (id = 1) para que puedas editar el texto desde
-- Supabase > Table Editor > legal_texts, sin tocar código ni redesplegar.
create table if not exists legal_texts (
  id smallint primary key default 1,
  data_consent_text text not null,
  signature_consent_text text not null,
  updated_at timestamptz not null default now(),
  constraint legal_texts_singleton check (id = 1)
);

insert into legal_texts (id, data_consent_text, signature_consent_text)
values (
  1,
  'He leído y acepto la Política de Tratamiento de Datos Personales de [NOMBRE DE LA EMPRESA/PERSONA]. Autorizo el tratamiento de mis datos personales (nombre, cédula y correo electrónico) para efectos de este proceso de firma electrónica, de conformidad con la Ley 1581 de 2012, el Decreto 1377 de 2013 y demás normas que los reglamenten o sustituyan.',
  'Acepto firmar este documento de forma electrónica y reconozco que dicha firma tiene la misma validez y efectos jurídicos que una firma manuscrita, de conformidad con la Ley 527 de 1999 y el Decreto 2364 de 2012. Entiendo que mi firma quedará asociada a este documento junto con la fecha, hora e IP desde la que firmé.'
)
on conflict (id) do nothing;

alter table legal_texts enable row level security;

-- Storage: crea un bucket privado llamado "documents"
-- (Panel > Storage > New bucket > nombre: documents > Public: NO)
-- Este script no puede crear el bucket por ti; hazlo desde el panel de Supabase.

-- Como usamos la Service Role Key desde el servidor (nunca desde el navegador),
-- no es necesario configurar políticas RLS públicas: el backend tiene acceso total
-- y la tabla nunca se consulta directamente desde el cliente.
alter table documents enable row level security;
-- No se crean políticas (RLS activo = nadie puede leer/escribir directo desde el
-- navegador con la clave pública; solo el backend con la service role key puede).
