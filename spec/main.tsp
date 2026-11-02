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
@doc("Слоты недели для гостя. Считаются на лету для даты, попадающей в нужную неделю.")
op listSlots(
  @doc("Любая дата недели (YYYY-MM-DD)")
  @query date: plainDate,
): {
  @body body: WeekSlots;
};
