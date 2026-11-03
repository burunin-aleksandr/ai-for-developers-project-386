import "@typespec/http";

using TypeSpec.Http;

@service(#{
  title: "Calendar — запись на звонок",
})
namespace Calendar;

/** Длительность типа встречи — только пресеты 15/30/45/60 минут. */
alias DurationMinutes = 15 | 30 | 45 | 60;

/** Тип встречи: карточка, которую создаёт владелец. */
model MeetingType {
  id: int64;

  @doc("Название типа встречи")
  name: string;

  @doc("Описание типа встречи")
  description?: string;

  @doc("Длительность в минутах (пресет)")
  durationMinutes: DurationMinutes;
}

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

@get
@route("/meeting-types")
@doc("Список типов встреч владельца.")
op listMeetingTypes(): {
  @body body: {
    meetingTypes: MeetingType[];
  };
};

@post
@route("/meeting-types")
@doc("Создать тип встречи.")
op createMeetingType(
  @body body: MeetingTypeInput,
): {
  @statusCode _: 201;
  @body body: MeetingType;
};

@put
@route("/meeting-types/{id}")
@doc("Отредактировать тип встречи. Удаление не предусмотрено.")
op updateMeetingType(
  @path id: int64,
  @body body: MeetingTypeInput,
): {
  @body body: MeetingType;
};

/** Входные данные типа встречи (без id). */
model MeetingTypeInput {
  @doc("Название типа встречи")
  name: string;

  @doc("Описание типа встречи")
  description?: string;

  @doc("Длительность в минутах (пресет)")
  durationMinutes: DurationMinutes;
}

/** Статус слота для гостя. */
alias SlotStatus = "free" | "busy";

/** Событие админа: интервал доступного времени поверх дефолтной сетки. */
model AdminEvent {
  @doc("Идентификатор события")
  id: int64;

  @doc("Начало события (UTC)")
  start: utcDateTime;

  @doc("Конец события (UTC)")
  end: utcDateTime;
}

/** Входные данные события админа (интервал в пределах окна 10:00–18:00 UTC+3). */
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

  @doc("Комментарий гостя")
  comment?: string;
}

/** Входные данные записи (валидируются на сервере). */
model BookingInput {
  @doc("Начало слота (UTC) — бронируется только целый слот")
  slotStart: utcDateTime;

  @doc("Длительность выбранного типа встречи — по ней нарезан сет, который видел гость")
  durationMinutes: DurationMinutes;

  @doc("Имя гостя (обязательно)")
  name: string;

  @doc("Email гостя (обязательно)")
  email: string;

  @doc("Комментарий гостя (необязательно)")
  comment?: string;
}

/** Слот недели. Время хранится в UTC; отображение — UTC+3. */
model Slot {
  @doc("Начало слота (UTC)")
  start: utcDateTime;

  @doc("Конец слота (UTC)")
  end: utcDateTime;

  @doc("Статус: free — свободно, busy — занято")
  status: SlotStatus;
}

/** Один день недели со слотами. */
model DaySlots {
  @doc("Дата дня (YYYY-MM-DD)")
  date: plainDate;

  @doc("Сколько слотов свободно в дне")
  freeCount: int32;

  @doc("Слоты дня (в UTC), прошедшее время скрыто")
  slots: Slot[];
}

/** Неделя бронирования: пн–вс. */
model WeekSlots {
  @doc("Понедельник недели (YYYY-MM-DD)")
  weekStart: plainDate;

  @doc("Дни недели, пн–вс")
  days: DaySlots[];
}

@get
@route("/slots")
@doc("Слоты недели для гостя. Считаются на лету для даты, попадающей в нужную неделю. При наличии событий админа нарезаются ими с шагом durationMinutes.")
op listSlots(
  @doc("Любая дата недели (YYYY-MM-DD)")
  @query date: plainDate,
  @doc("Длительность выбранного типа встречи для нарезки событий админа; без параметра — 15")
  @query durationMinutes?: DurationMinutes,
): {
  @body body: WeekSlots;
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
@doc("Создать событие админа — интервал в пределах окна бронирования 10:00–18:00 UTC+3.")
op createAdminEvent(
  @body body: AdminEventInput,
): {
  @statusCode _: 201;
  @body body: AdminEvent;
};

@delete
@route("/admin-events/{id}")
@doc("Удалить событие админа. Когда удалены все события, гость снова видит дефолтную сетку.")
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

@post
@route("/bookings")
@doc("Записать гостя на целый слот. Слот сразу становится «Занято» для всех гостей. Одно время нельзя занять дважды — конфликт → 409.")
op createBooking(
  @body body: BookingInput,
): {
  @statusCode _: 201;
  @body body: Booking;
} | {
  @statusCode _: 409;
  @body body: ErrorBody;
};
