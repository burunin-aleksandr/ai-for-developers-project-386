import "@typespec/http";

using TypeSpec.Http;

@service(#{
  title: "Calendar — запись на звонок",
})
namespace Calendar;

/** Ответ health-check сервиса. */
model HealthStatus {
  @doc("Статус сервиса")
  status: "ok";
}

@get
@route("/health")
@doc("Health-check сервиса.")
op getHealth(): {
  @body body: HealthStatus;
};

/** Статус слота для гостя. */
alias SlotStatus = "free" | "busy";

/** Событие админа: интервал, который блокирует пересекающиеся слоты. */
model AdminEvent {
  @doc("Идентификатор события")
  id: int64;

  @doc("Начало события (UTC)")
  start: utcDateTime;

  @doc("Конец события (UTC)")
  end: utcDateTime;
}

/** Входные данные события админа (интервал в пределах окна 09:00–18:00 UTC+3). */
model AdminEventInput {
  @doc("Начало события (UTC)")
  start: utcDateTime;

  @doc("Конец события (UTC)")
  end: utcDateTime;
}

/** Запись гостя на слот. Письма не отправляются. */
model Booking {
  @doc("Идентификатор записи")
  id: int64;

  @doc("Начало слота (UTC)")
  slotStart: utcDateTime;

  @doc("Имя гостя")
  name: string;

  @doc("Email гостя")
  email: string;

  @doc("Момент создания записи (UTC)")
  createdAt: utcDateTime;
}

/** Входные данные записи (валидируются на сервере). */
model BookingInput {
  @doc("Начало слота (UTC) — бронируется только целый 30-минутный слот")
  slotStart: utcDateTime;

  @doc("Имя гостя (обязательно)")
  name: string;

  @doc("Email гостя (обязательно)")
  email: string;
}

/** Слот. Время хранится в UTC; отображение — UTC+3. */
model Slot {
  @doc("Начало слота (UTC)")
  start: utcDateTime;

  @doc("Конец слота (UTC)")
  end: utcDateTime;

  @doc("Статус: free — свободно, busy — занято")
  status: SlotStatus;
}

/** Один день сетки месяца со слотами. */
model DaySlots {
  @doc("Дата дня (YYYY-MM-DD)")
  date: plainDate;

  @doc("Сколько слотов свободно в дне")
  freeCount: int32;

  @doc("Слоты дня (в UTC), прошедшее время скрыто")
  slots: Slot[];
}

/** Месяц бронирования: сетка 6×7 пн–вс (42 дня). */
model MonthSlots {
  @doc("Первый день месяца (YYYY-MM-DD)")
  month: plainDate;

  @doc("Дни сетки: 42 дня пн–вс, с понедельника недели, в которую попадает 1-е число")
  days: DaySlots[];
}

@get
@route("/slots")
@doc("Слоты месяца для гостя. Фиксированная сетка 09:00–18:00 UTC+3 с шагом 30 минут; события админа и записи помечают пересекающиеся слоты занятыми.")
op listSlots(
  @doc("Любая дата месяца (YYYY-MM-DD)")
  @query date: plainDate,
): {
  @body body: MonthSlots;
};

@get
@route("/admin-events")
@doc("Список событий админа.")
op listAdminEvents(): {
  @body body: {
    adminEvents: AdminEvent[];
  };
};

@post
@route("/admin-events")
@doc("Создать событие админа — интервал в пределах окна бронирования 09:00–18:00 UTC+3.")
op createAdminEvent(
  @body body: AdminEventInput,
): {
  @statusCode _: 201;
  @body body: AdminEvent;
};

@delete
@route("/admin-events/{id}")
@doc("Удалить событие админа. Пересекавшиеся с ним слоты снова становятся свободными.")
op deleteAdminEvent(
  @path id: int64,
): {
  @statusCode _: 204;
};

/** Тело ответа об ошибке (например, конфликт занятости). */
model ErrorBody {
  @doc("Сообщение об ошибке")
  message: string;
}

@get
@route("/bookings")
@doc("Предстоящие записи для публичной страницы «Предстоящие события»: имя, email, слот и момент создания.")
op listBookings(): {
  @body body: {
    bookings: Booking[];
  };
};

@post
@route("/bookings")
@doc("Записать гостя на целый 30-минутный слот. Слот сразу становится «Занято» для всех гостей. Одно время нельзя занять дважды — конфликт → 409.")
op createBooking(
  @body body: BookingInput,
): {
  @statusCode _: 201;
  @body body: Booking;
} | {
  @statusCode _: 409;
  @body body: ErrorBody;
};
