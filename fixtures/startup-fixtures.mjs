// Стартовые фикстуры для демо: типы встреч и события админа.
// Применяются только по команде `pnpm fixtures` — при старте сервера
// загрузка НЕ происходит автоматически (см. issue #9).

import { pathToFileURL } from "node:url";

/** Стартовые типы встреч (длительности 15/30/60 минут). */
export const START_MEETING_TYPES = [
  {
    name: "Быстрый созвон",
    description: "Уточнить детали за 15 минут",
    durationMinutes: 15,
  },
  {
    name: "Консультация",
    description: "Разбор вопросов по проекту",
    durationMinutes: 30,
  },
  {
    name: "Разбор задачи",
    description: "Подробный разбор задачи за час",
    durationMinutes: 60,
  },
];

/**
 * Стартовые события админа на два ближайших дня в будущем, внутри окна
 * 10:00–18:00 UTC+3 (07:00–15:00 UTC). Даты считаются от `now`, поэтому
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
    { start: `${day(1)}T07:00:00.000Z`, end: `${day(1)}T10:00:00.000Z` },
    { start: `${day(2)}T09:00:00.000Z`, end: `${day(2)}T12:00:00.000Z` },
  ];
}

/**
 * Загружает фикстуры через HTTP-клиент с методом post(path, body).
 * Клиент подставляется: fetch — для команды, app.inject — для тестов.
 * @param {{ post: (path: string, body: object) => Promise<{ ok: boolean, status: number }> }} client
 * @returns {Promise<{ meetingTypes: number, adminEvents: number }>}
 */
export async function loadFixtures(client) {
  const counts = { meetingTypes: 0, adminEvents: 0 };

  for (const type of START_MEETING_TYPES) {
    const res = await client.post("/meeting-types", type);
    if (!res.ok) {
      throw new Error(
        `не удалось создать тип «${type.name}» (HTTP ${res.status})`,
      );
    }
    counts.meetingTypes += 1;
  }

  for (const event of startAdminEvents()) {
    const res = await client.post("/admin-events", event);
    if (!res.ok) {
      throw new Error(`не удалось создать событие (HTTP ${res.status})`);
    }
    counts.adminEvents += 1;
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
      `Фикстуры загружены: типов встреч — ${counts.meetingTypes}, событий админа — ${counts.adminEvents}`,
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
