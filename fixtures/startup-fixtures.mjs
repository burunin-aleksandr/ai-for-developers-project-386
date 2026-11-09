// Стартовые фикстуры для демо: события админа и записи гостей.
// Применяются только по команде `pnpm fixtures` — при старте сервера
// загрузка НЕ происходит автоматически (см. issue #9).

import { pathToFileURL } from "node:url";

/**
 * Стартовые события админа на два ближайших дня в будущем, внутри окна
 * 09:00–18:00 UTC+3 (06:00–15:00 UTC). Даты считаются от `now`, поэтому
 * события всегда в будущем и не устаревают.
 * @param {Date} now
 * @returns {Array<{ start: string; end: string }>}
 */
export function startAdminEvents(now = new Date()) {
  const day = (offset) =>
    new Date(now.getTime() + offset * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
  return [
    // 09:00–12:00 UTC+3
    { start: `${day(1)}T06:00:00.000Z`, end: `${day(1)}T09:00:00.000Z` },
    // 11:00–14:00 UTC+3
    { start: `${day(2)}T08:00:00.000Z`, end: `${day(2)}T11:00:00.000Z` },
  ];
}

/**
 * Демо-записи гостей на свободные слоты ближайших дней (не пересекаются
 * с событиями админа). Даты считаются от `now`.
 * @param {Date} now
 * @returns {Array<{ slotStart: string; name: string; email: string }>}
 */
export function startBookings(now = new Date()) {
  const day = (offset) =>
    new Date(now.getTime() + offset * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
  return [
    // 12:00 UTC+3 — после события 09:00–12:00
    {
      slotStart: `${day(1)}T09:00:00.000Z`,
      name: "Демо Гость",
      email: "demo@example.com",
    },
    // 15:00 UTC+3 — после события 11:00–14:00
    {
      slotStart: `${day(2)}T12:00:00.000Z`,
      name: "Мария Смирнова",
      email: "maria@example.com",
    },
  ];
}

/**
 * Загружает фикстуры через HTTP-клиент с методом post(path, body).
 * Клиент подставляется: fetch — для команды, app.inject — для тестов.
 * @param {{ post: (path: string, body: object) => Promise<{ ok: boolean, status: number }> }} client
 * @returns {Promise<{ adminEvents: number, bookings: number }>}
 */
export async function loadFixtures(client) {
  const counts = { adminEvents: 0, bookings: 0 };

  for (const event of startAdminEvents()) {
    const res = await client.post("/admin-events", event);
    if (!res.ok) {
      throw new Error(`не удалось создать событие (HTTP ${res.status})`);
    }
    counts.adminEvents += 1;
  }

  for (const booking of startBookings()) {
    const res = await client.post("/bookings", booking);
    if (!res.ok) {
      throw new Error(
        `не удалось создать запись «${booking.name}» (HTTP ${res.status})`,
      );
    }
    counts.bookings += 1;
  }

  return counts;
}

/**
 * HTTP-клиент на fetch для загрузки фикстур в работающий сервер.
 * @param {string} [baseUrl]
 * @returns {{ post: (path: string, body: object) => Promise<{ ok: boolean, status: number }> }}
 */
export function fetchClient(baseUrl = "http://localhost:3000") {
  return {
    post: async (path, body) => {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ok: res.ok, status: res.status };
    },
  };
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const client = fetchClient(baseUrl);

  try {
    const counts = await loadFixtures(client);
    console.log(
      `Фикстуры загружены: событий админа — ${counts.adminEvents}, записей — ${counts.bookings}`,
    );
  } catch (err) {
    console.error(`Ошибка загрузки фикстур: ${err.message}`);
    console.error(`Проверьте, что сервер запущен (BASE_URL=${baseUrl})`);
    process.exitCode = 1;
  }
}

// Запуск как CLI: node fixtures/startup-fixtures.mjs (корневой скрипт `pnpm fixtures`)
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
