-- =====================================================================
-- Asistencia - Aviso automático de la verificación (cada 5 minutos)
--
-- Supabase llama a la app cada 5 minutos para avisar en el celular a los
-- empleados a los que ya les toca la verificación. Es gratis.
--
-- Antes de correrlo:
--   1. Database > Extensions: activa "pg_cron" y "pg_net".
--   2. Cambia TU-APP.vercel.app por la dirección real de la app.
--   3. Cambia TU-CRON-SECRET por el mismo valor de CRON_SECRET en Vercel.
--
-- Para quitarlo: select cron.unschedule('asistencia-verificaciones');
-- =====================================================================

select cron.schedule(
  'asistencia-verificaciones',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://TU-APP.vercel.app/api/cron/verificaciones',
    headers := jsonb_build_object('Authorization', 'Bearer TU-CRON-SECRET')
  );
  $$
);
