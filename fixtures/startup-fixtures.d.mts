/** Типы для стартовых фикстур (fixtures/startup-fixtures.mjs). */

export type FixtureAdminEvent = {
  start: string;
  end: string;
};

export type FixtureBooking = {
  slotStart: string;
  name: string;
  email: string;
};

/** HTTP-клиент загрузки фикстур: fetch — для команды, inject — для тестов. */
export type FixtureClient = {
  post: (
    path: string,
    body: object,
  ) => Promise<{ ok: boolean; status: number }>;
};

export declare function startAdminEvents(now?: Date): FixtureAdminEvent[];

export declare function startBookings(now?: Date): FixtureBooking[];

/** HTTP-клиент на fetch для загрузки фикстур в работающий сервер. */
export declare function fetchClient(baseUrl?: string): FixtureClient;

export declare function loadFixtures(
  client: FixtureClient,
): Promise<{ adminEvents: number; bookings: number }>;
