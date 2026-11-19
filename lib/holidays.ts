// Festivos de Colombia calculados por año (Ley Emiliani, Ley 51 de 1983):
//  - Fijos: 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic.
//  - Trasladados al lunes siguiente: 6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov, 11 nov.
//  - Según la Pascua: Jueves y Viernes Santo (sin traslado), y Ascensión,
//    Corpus Christi y Sagrado Corazón (trasladados al lunes).
// La administradora puede agregar o quitar días después de generarlos.

export type Holiday = { day: string; name: string };

function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(date: Date, n: number) {
  return new Date(date.getTime() + n * 86_400_000);
}

// Si no cae lunes, pasa al lunes siguiente.
function nextMonday(date: Date) {
  const dow = date.getUTCDay(); // 0 domingo ... 1 lunes
  return dow === 1 ? date : addDays(date, (8 - dow) % 7);
}

// Domingo de Pascua (algoritmo gregoriano anónimo).
function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function colombianHolidays(year: number): Holiday[] {
  const pascua = easter(year);
  const list: Holiday[] = [
    { day: iso(utc(year, 1, 1)), name: "Año Nuevo" },
    { day: iso(nextMonday(utc(year, 1, 6))), name: "Reyes Magos" },
    { day: iso(nextMonday(utc(year, 3, 19))), name: "San José" },
    { day: iso(addDays(pascua, -3)), name: "Jueves Santo" },
    { day: iso(addDays(pascua, -2)), name: "Viernes Santo" },
    { day: iso(utc(year, 5, 1)), name: "Día del Trabajo" },
    { day: iso(nextMonday(addDays(pascua, 39))), name: "Ascensión del Señor" },
    { day: iso(nextMonday(addDays(pascua, 60))), name: "Corpus Christi" },
    { day: iso(nextMonday(addDays(pascua, 68))), name: "Sagrado Corazón" },
    { day: iso(nextMonday(utc(year, 6, 29))), name: "San Pedro y San Pablo" },
    { day: iso(utc(year, 7, 20)), name: "Día de la Independencia" },
    { day: iso(utc(year, 8, 7)), name: "Batalla de Boyacá" },
    { day: iso(nextMonday(utc(year, 8, 15))), name: "Asunción de la Virgen" },
    { day: iso(nextMonday(utc(year, 10, 12))), name: "Día de la Raza" },
    { day: iso(nextMonday(utc(year, 11, 1))), name: "Todos los Santos" },
    { day: iso(nextMonday(utc(year, 11, 11))), name: "Independencia de Cartagena" },
    { day: iso(utc(year, 12, 8)), name: "Inmaculada Concepción" },
    { day: iso(utc(year, 12, 25)), name: "Navidad" },
  ];
  return list.sort((a, b) => a.day.localeCompare(b.day));
}
