/** Отображаемый часовой пояс — UTC+3 (захардкоженный дефолт). */
export const DISPLAY_UTC_OFFSET_HOURS = 3;

/** Сегодняшняя дата в отображаемом поясе (UTC+3), YYYY-MM-DD. */
export function todayInDisplayZone(): string {
  return new Date(Date.now() + DISPLAY_UTC_OFFSET_HOURS * 3600_000)
    .toISOString()
    .slice(0, 10);
}

export function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Понедельник недели, в которую попадает дата (пн–вс). */
export function weekStartOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const offsetToMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → DD.MM.YYYY. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** UTC ISO → HH:MM в UTC+3. */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = (d.getUTCHours() + DISPLAY_UTC_OFFSET_HOURS) % 24;
  return `${String(h).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
