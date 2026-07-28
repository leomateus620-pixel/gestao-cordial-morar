import assert from "node:assert/strict";
import test from "node:test";
import {
  getNotificationTypeConfig,
  groupNotifications,
  resolveNotificationDestination,
  type NotificationRecord,
} from "./notification-system.ts";

const attendanceId = "11111111-1111-4111-8111-111111111111";

function notification(id: string, overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id,
    type: "atendimento_atribuido",
    category: "attendance",
    title: "Novo atendimento",
    message: null,
    link: `/atendimentos?id=${attendanceId}`,
    read: false,
    readAt: null,
    createdAt: "2026-07-27T12:00:00.000Z",
    agency: "cordial",
    entityType: "attendance",
    entityId: attendanceId,
    actorId: null,
    ...overrides,
  };
}

test("maps every real producer to deterministic motion, sound and CTA", () => {
  assert.deepEqual(
    [
      "atendimento_atribuido",
      "atendimento_iniciado",
      "agenda_lembrete",
      "venda_vencimento",
      "google_calendar",
    ].map((type) => {
      const config = getNotificationTypeConfig(type);
      return [type, config.category, config.motion, config.sound, config.ctaLabel];
    }),
    [
      ["atendimento_atribuido", "attendance", "from-right", "important", "Abrir atendimento"],
      ["atendimento_iniciado", "attendance", "fade", "soft", "Abrir atendimento"],
      ["agenda_lembrete", "agenda", "from-bottom", "important", "Ver compromisso"],
      ["venda_vencimento", "financial", "from-top", "warning", "Ver venda"],
      ["google_calendar", "system", "scale", "soft", "Abrir configurações"],
    ],
  );
});

test("groups only same-type, same-tenant events inside a sliding five-minute window", () => {
  const groups = groupNotifications([
    notification("a"),
    notification("b", { createdAt: "2026-07-27T12:04:59.000Z" }),
    notification("c", { agency: "morar" }),
    notification("d", { createdAt: "2026-07-27T12:05:01.000Z" }),
    notification("a"),
  ]);

  const groupedIds = groups.map((group) => group.notifications.map((item) => item.id).sort());
  assert.ok(groupedIds.some((ids) => ids.join(",") === "b,d"));
  assert.ok(groupedIds.some((ids) => ids.join(",") === "a"));
  assert.ok(groupedIds.some((ids) => ids.join(",") === "c"));
});

test("never groups financial deadline alerts that require independent action", () => {
  const groups = groupNotifications([
    notification("sale-1", { type: "venda_vencimento", category: "financial" }),
    notification("sale-2", { type: "venda_vencimento", category: "financial" }),
  ]);
  assert.equal(groups.length, 2);
});

test("allows only known internal destinations and valid entity identifiers", () => {
  assert.deepEqual(resolveNotificationDestination(notification("safe")), {
    path: "/atendimentos",
    search: { id: attendanceId },
  });
  assert.deepEqual(
    resolveNotificationDestination(
      notification("unsafe", {
        type: "desconhecido",
        category: "system",
        entityId: null,
        link: "https://example.com/roubo",
      }),
    ),
    null,
  );
  assert.deepEqual(
    resolveNotificationDestination(
      notification("agenda", {
        type: "agenda_lembrete",
        category: "agenda",
        entityId: "não-é-uuid",
        link: "/agenda?id=tambem-invalido",
      }),
    ),
    null,
  );
});
