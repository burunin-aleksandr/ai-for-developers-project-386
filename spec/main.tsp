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
