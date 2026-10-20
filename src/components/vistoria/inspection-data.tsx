import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDraftRow, useDrafts } from "@/lib/vistoria/drafts";
import {
  emptyMeters,
  INSPECTION_KINDS,
  KIND_LABEL,
  METER_LABEL,
  METER_STATUS_LABEL,
  type InspectionKind,
  type Meters,
  type MeterStatus,
} from "@/lib/vistoria/model";
import { useLocalQueue, useSaver } from "@/lib/vistoria/use-inspection";
import { updateInspectionBasics, type InspectionFull } from "@/lib/vistoria/vistoria.functions";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";

type Saver = ReturnType<typeof useSaver>;
type Queue = ReturnType<typeof useLocalQueue>;
export function DataTab({
  data,
  readOnly,
  saver,
}: {
  data: InspectionFull;
  readOnly: boolean;
  saver: Saver;
}) {
  const i = data.inspection;
  const upd = useServerFn(updateInspectionBasics);
  const toLocal = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const draft = useDraftRow("inspection", i, i.id);
  const current = draft.value;
  const form = {
    kind: current.kind as InspectionKind,
    when: toLocal(current.inspected_at),
    furnished: current.furnished,
    cleaning: current.cleaning,
    meters: { ...emptyMeters(), ...(current.meters as Partial<Meters>) } as Meters,
    general_notes: current.general_notes ?? "",
    conclusion: current.conclusion ?? "",
    plan_confirmed: Boolean(current.plan_confirmed),
    participants: (current.participants ?? []) as Array<{ nome: string; papel: string }>,
    keys: (current.keys ?? []) as Array<{ descricao: string; quantidade: number }>,
  };
  const { controller } = useDrafts();
  const setForm = (next: typeof form) => {
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(form) as Array<keyof typeof form>)
      if (JSON.stringify(next[k]) !== JSON.stringify(form[k]))
        patch[k === "when" ? "inspected_at" : k] =
          k === "when" ? (next.when ? new Date(next.when).toISOString() : null) : next[k];
    draft.set(patch);
  };
  const f = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  const cad = i.property_snapshot?.cadastro ?? {};
  const conf = i.property_snapshot?.confirmado ?? {};
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void controller.flush();
      }}
    >
      <section className="premium-card space-y-1 rounded-2xl p-4 text-sm">
        <h2 className="font-semibold">Identificação (registrada na criação)</h2>
        <p>
          {[
            cad.codigo_cordial && `Cordial ${cad.codigo_cordial}`,
            cad.codigo_morar && `Morar ${cad.codigo_morar}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-foreground/65">{i.property_snapshot?.endereco}</p>
        <p className="text-foreground/65">
          Tipo {conf.tipo ?? cad.tipo ?? "—"} · {conf.dormitorios ?? "—"} dorm. ({conf.suites ?? 0}{" "}
          suítes) · {conf.banheiros ?? "—"} banh. · {conf.vagas ?? "—"} vagas
        </p>
        <p className="text-foreground/65">Responsável: {i.responsible_name ?? "—"}</p>
      </section>
      <fieldset disabled={readOnly} className="premium-card space-y-3 rounded-2xl p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-foreground/60">Tipo</span>
          <select
            className={f}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as InspectionKind })}
          >
            {INSPECTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-foreground/60">Data e hora</span>
          <Input
            type="datetime-local"
            className="h-11"
            value={form.when}
            onChange={(e) => setForm({ ...form, when: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1 block text-xs font-semibold text-foreground/60">Mobiliado</span>
            <select
              className={f}
              value={form.furnished}
              onChange={(e) =>
                setForm({ ...form, furnished: e.target.value as typeof form.furnished })
              }
            >
              <option value="nao_informado">Não informado</option>
              <option value="nao">Não</option>
              <option value="semimobiliado">Semimobiliado</option>
              <option value="mobiliado">Mobiliado</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-foreground/60">Limpeza</span>
            <select
              className={f}
              value={form.cleaning}
              onChange={(e) =>
                setForm({ ...form, cleaning: e.target.value as typeof form.cleaning })
              }
            >
              <option value="nao_informado">Não informado</option>
              <option value="limpo">Limpo</option>
              <option value="parcial">Parcial</option>
              <option value="sujo">Sujo</option>
              <option value="nao_se_aplica">Não se aplica</option>
            </select>
          </label>
        </div>
        {(Object.keys(METER_LABEL) as Array<keyof Meters>).map((k) => (
          <div key={k} className="grid grid-cols-[4rem_1fr] items-center gap-2">
            <span className="text-sm font-medium">{METER_LABEL[k]}</span>
            <select
              aria-label={`Situação de ${METER_LABEL[k]}`}
              className={f}
              value={form.meters[k].status}
              onChange={(e) =>
                setForm({
                  ...form,
                  meters: {
                    ...form.meters,
                    [k]: { ...form.meters[k], status: e.target.value as MeterStatus },
                  },
                })
              }
            >
              {(Object.keys(METER_STATUS_LABEL) as MeterStatus[]).map((s) => (
                <option key={s} value={s}>
                  {METER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            {form.meters[k].status === "informado" && (
              <Input
                aria-label={`Leitura de ${METER_LABEL[k]}`}
                className="col-span-2 h-11"
                placeholder="Leitura"
                value={form.meters[k].reading ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    meters: { ...form.meters, [k]: { ...form.meters[k], reading: e.target.value } },
                  })
                }
              />
            )}
          </div>
        ))}
        <div>
          <span className="mb-1 block text-xs font-semibold text-foreground/60">Participantes</span>
          {form.participants.map((p, idx) => (
            <div key={idx} className="mb-2 flex gap-2">
              <Input
                aria-label="Nome"
                className="h-11"
                value={p.nome}
                onChange={(e) =>
                  setForm({
                    ...form,
                    participants: form.participants.map((x, j) =>
                      j === idx ? { ...x, nome: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                aria-label="Papel"
                className="h-11"
                value={p.papel}
                onChange={(e) =>
                  setForm({
                    ...form,
                    participants: form.participants.map((x, j) =>
                      j === idx ? { ...x, papel: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                aria-label="Remover"
                className="grid size-11 shrink-0 place-items-center"
                onClick={() =>
                  setForm({ ...form, participants: form.participants.filter((_, j) => j !== idx) })
                }
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="min-h-11 text-sm font-medium text-primary"
            onClick={() =>
              setForm({ ...form, participants: [...form.participants, { nome: "", papel: "" }] })
            }
          >
            + Participante
          </button>
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold text-foreground/60">
            Chaves e controles
          </span>
          {form.keys.map((k, idx) => (
            <div key={idx} className="mb-2 flex gap-2">
              <Input
                aria-label="Quantidade"
                type="number"
                min={0}
                className="h-11 w-20"
                value={k.quantidade}
                onChange={(e) =>
                  setForm({
                    ...form,
                    keys: form.keys.map((x, j) =>
                      j === idx ? { ...x, quantidade: Number(e.target.value) || 0 } : x,
                    ),
                  })
                }
              />
              <Input
                aria-label="Descrição"
                className="h-11"
                value={k.descricao}
                onChange={(e) =>
                  setForm({
                    ...form,
                    keys: form.keys.map((x, j) =>
                      j === idx ? { ...x, descricao: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                aria-label="Remover"
                className="grid size-11 shrink-0 place-items-center"
                onClick={() => setForm({ ...form, keys: form.keys.filter((_, j) => j !== idx) })}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="min-h-11 text-sm font-medium text-primary"
            onClick={() =>
              setForm({ ...form, keys: [...form.keys, { descricao: "", quantidade: 1 }] })
            }
          >
            + Chave/controle
          </button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-foreground/60">
            Observações gerais
          </span>
          <Textarea
            rows={3}
            value={form.general_notes}
            onChange={(e) => setForm({ ...form, general_notes: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-foreground/60">
            Conclusão do laudo
          </span>
          <Textarea
            rows={3}
            value={form.conclusion}
            onChange={(e) => setForm({ ...form, conclusion: e.target.value })}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={form.plan_confirmed}
            onChange={(e) => setForm({ ...form, plan_confirmed: e.target.checked })}
          />
          Ambientes do imóvel confirmados
        </label>
        <button
          type="submit"
          className="min-h-12 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground"
        >
          Salvar dados
        </button>
      </fieldset>
    </form>
  );
}

/* ============================ Revisão ============================ */
