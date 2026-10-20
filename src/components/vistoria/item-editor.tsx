import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDraftRow, useDrafts } from "@/lib/vistoria/drafts";
import { ITEM_STATE_LABEL, ITEM_STATES } from "@/lib/vistoria/model";
import type { ItemRow, RoomRow } from "@/lib/vistoria/types";
import { useLocalQueue, useSaver } from "@/lib/vistoria/use-inspection";
import { deleteItem } from "@/lib/vistoria/vistoria.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { ITEM_STATE_TONE as STATE_TONE } from "@/lib/vistoria/ui";
type Saver = ReturnType<typeof useSaver>;
type Queue = ReturnType<typeof useLocalQueue>;
export function NoPhotoReason({
  room,
  readOnly,
}: {
  room: RoomRow;
  readOnly: boolean;
  saver: Saver;
}) {
  const draft = useDraftRow("room", room, room.id, room.id);
  return (
    <label className="mt-3 block text-sm font-medium">
      Sem foto possível? Registre o motivo
      <Input
        disabled={readOnly}
        value={draft.value.no_photo_reason ?? ""}
        placeholder="Ex.: cômodo trancado"
        onChange={(e) => draft.set({ no_photo_reason: e.target.value })}
        className="mt-1 h-11"
      />
    </label>
  );
}

export function ItemCard({
  item,
  readOnly,
  saver,
  onTouched,
  photos,
  onPhoto,
  onNarrate,
  forceOpen,
}: {
  item: ItemRow;
  readOnly: boolean;
  saver: Saver;
  onTouched: () => void;
  photos: number;
  onPhoto: () => void;
  onNarrate: () => void;
  forceOpen?: boolean;
}) {
  const draft = useDraftRow("item", item, item.id, item.room_id),
    { value: i } = draft;
  const { controller } = useDrafts();
  const del = useServerFn(deleteItem);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  const textField = (
    key: "material" | "color" | "damage" | "notes" | "untested_reason",
    label: string,
    multiline = false,
  ) => (
    <label className="block text-sm font-medium">
      {label}
      {multiline ? (
        <Textarea
          disabled={readOnly}
          rows={2}
          value={i[key] ?? ""}
          onChange={(e) => draft.set({ [key]: e.target.value })}
          className="mt-1"
        />
      ) : (
        <Input
          disabled={readOnly}
          value={i[key] ?? ""}
          onChange={(e) => draft.set({ [key]: e.target.value })}
          className="mt-1 h-11"
        />
      )}
    </label>
  );
  return (
    <li id={`item-${item.id}`} className="premium-card rounded-xl p-3">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="font-semibold">{i.name}</span>
        <span
          className={cn("rounded-full border px-2 py-1 text-xs font-semibold", STATE_TONE[i.state])}
        >
          {ITEM_STATE_LABEL[i.state]}
        </span>
      </button>
      <p className="text-xs text-foreground/60">
        {[i.material, i.color, i.damage || i.notes, photos ? `${photos} foto(s)` : null]
          .filter(Boolean)
          .join(" · ") || "Abra para avaliar e registrar evidências"}
      </p>
      {open && (
        <div className="mt-3 space-y-3">
          <fieldset disabled={readOnly}>
            <legend className="mb-1 text-sm font-medium">Avaliação de {i.name}</legend>
            <div className="grid grid-cols-2 gap-2">
              {ITEM_STATES.map((state) => (
                <label
                  key={state}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm",
                    i.state === state ? "border-primary bg-primary/5" : "border-input",
                  )}
                >
                  <input
                    type="radio"
                    name={`state-${i.id}`}
                    checked={i.state === state}
                    onChange={() => {
                      draft.set({ state });
                      onTouched();
                    }}
                    className="size-4 accent-primary"
                  />
                  {ITEM_STATE_LABEL[state]}
                </label>
              ))}
            </div>
          </fieldset>
          {i.state === "nao_testado" && textField("untested_reason", "Por que não foi testado?")}
          {textField(
            "damage",
            i.state === "ruim"
              ? "Descrição da avaria (obrigatória)"
              : "Avaria observada (se houver)",
            true,
          )}
          <div className="grid grid-cols-2 gap-2">
            {textField("material", "Material")}
            {textField("color", "Cor")}
          </div>
          <label className="block text-sm font-medium">
            Quantidade
            <Input
              type="number"
              min={0}
              step="any"
              disabled={readOnly}
              value={i.quantity ?? ""}
              onChange={(e) =>
                draft.set({ quantity: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="mt-1 h-11"
            />
          </label>
          {textField("notes", "Observação", true)}
          {!readOnly && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-xl border px-2 text-sm font-semibold text-primary"
                  onClick={onPhoto}
                >
                  Fotografar este item
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-xl border px-2 text-sm font-semibold text-primary"
                  onClick={onNarrate}
                >
                  Relatar sobre este item
                </button>
              </div>
              <details>
                <summary className="min-h-11 cursor-pointer py-3 text-sm text-foreground/60">
                  Opções do item
                </summary>
                <button
                  type="button"
                  className="min-h-11 text-sm text-destructive"
                  onClick={() => {
                    if (confirm(`Remover “${i.name}” e descartar seus rascunhos?`))
                      void controller.discard(draft.key).then(() =>
                        saver.run(
                          () => del({ data: { id: i.id } }),
                          (f) => ({ ...f, items: f.items.filter((r) => r.id !== i.id) }),
                        ),
                      );
                  }}
                >
                  Remover item
                </button>
              </details>
            </>
          )}
        </div>
      )}
    </li>
  );
}
