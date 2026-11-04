/** Типы для стартовых фикстур (fixtures/startup-fixtures.mjs). */

export type FixtureMeetingType = {
  name: string;
  description?: string;
  durationMinutes: 15 | 30 | 45 | 60;
};

export type FixtureAdminEvent = {
  start: string;
  end: string;
};

/** HTTP-клиент загрузки фикстур: fetch — для команды, inject — для тестов. */
export type FixtureClient = {
  post: (
    path: string,
    body: object,
  ) => Promise<{ ok: boolean; status: number }>;
};

export declare const START_MEETING_TYPES: FixtureMeetingType[];

export declare function startAdminEvents(now?: Date): FixtureAdminEvent[];

/** HTTP-клиент на fetch для загрузки фикстур в работающий сервер. */
export declare function fetchClient(baseUrl?: string): FixtureClient;

export declare function loadFixtures(
  client: FixtureClient,
): Promise<{ meetingTypes: number; adminEvents: number }>;
