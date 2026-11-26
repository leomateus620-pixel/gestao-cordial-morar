import { parseMobiliado } from "@/lib/imoveis/mobiliado";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-mock";
import { cn } from "@/lib/utils";
import {
  buildRoomPlan,
  emptyMeters,
  INSPECTION_KINDS,
  itemsForRoom,
  KIND_LABEL,
  METER_LABEL,
  METER_STATUS_LABEL,
  propertyFamily,
  type InspectionKind,
  type Meters,
  type MeterStatus,
  type PlanRoom,
  type RoomKind,
} from "@/lib/vistoria/model";
import { useCreationDraft } from "@/lib/vistoria/use-creation-draft";
import { useFieldViewport } from "@/lib/vistoria/use-field-viewport";
import { getContractEntryInspectionState } from "@/lib/rentals/rentals.functions";
import {
  readRememberedCompetence,
  rentalSearch,
  type RentalSearch,
} from "@/lib/rentals/competence-nav";
import { entryInspectionAction, exitInspectionAction } from "@/lib/rentals/entry-inspection";
import { inspectionAddress, inspectionPropertyCodes } from "@/lib/vistoria/ui";
import {
  createInspection,
  getContractInspectionProperty,
  listInspectionResponsibles,
  searchInspectionProperties,
  type PropertyForInspection,
} from "@/lib/vistoria/vistoria.functions";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const field = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
const label = "mb-1 block text-xs font-semibold text-foreground/60";
const ROOM_KINDS: Array<{ v: RoomKind; l: string }> = [
  { v: "sala", l: "Sala" },
  { v: "dormitorio", l: "Dormitório" },
  { v: "suite", l: "Suíte" },
  { v: "banheiro", l: "Banheiro" },
  { v: "cozinha", l: "Cozinha" },
  { v: "servico", l: "Área de serviço" },
  { v: "garagem", l: "Garagem" },
  { v: "externa", l: "Área externa / varanda" },
  { v: "comercial", l: "Sala comercial" },
  { v: "terreno", l: "Terreno" },
  { v: "outro", l: "Outro" },
];

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const numOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v))));

export function CreationWorkspace({
  contractId,
  rentalKind = "entrada",
}: {
  contractId?: string;
  rentalKind?: "entrada" | "saida";
} = {}) {
  useFieldViewport();
  const session = useSession();
  const navigate = useNavigate();
  const search = useServerFn(searchInspectionProperties);
  const create = useServerFn(createInspection);
  const responsiblesFn = useServerFn(listInspectionResponsibles);
  const entryStateFn = useServerFn(getContractEntryInspectionState);
  const contractPropertyFn = useServerFn(getContractInspectionProperty);
  const draft = useCreationDraft(
    session?.id,
    () => ({
      id: crypto.randomUUID(),
      step: 0,
      q: "",
      prop: null as PropertyForInspection | null,
      kind: rentalKind as InspectionKind,
      agency: "cordial" as "cordial" | "morar",
      responsibleId: "",
      when: toLocalInput(new Date()),
      participants: [] as Array<{ nome: string; papel: string }>,
      furnished: "nao_informado" as "nao_informado" | "nao" | "semimobiliado" | "mobiliado",
      cleaning: "nao_informado" as "nao_informado" | "limpo" | "parcial" | "sujo" | "nao_se_aplica",
      keys: [] as Array<{ descricao: string; quantidade: number }>,
      meters: emptyMeters(),
      counts: { tipo: "", dormitorios: "", suites: "", banheiros: "", vagas: "", salas: "" },
      rooms: [] as PlanRoom[],
      planConfirmed: false,
      newRoom: { name: "", kind: "outro" as RoomKind },
    }),
    contractId ? `new:${contractId}:${rentalKind}` : "new",
  );
  const {
    id,
    step,
    q,
    prop,
    kind,
    agency,
    responsibleId,
    when,
    participants,
    furnished,
    cleaning,
    keys,
    meters,
    counts,
    rooms,
    planConfirmed,
    newRoom,
  } = draft.form;
  const setStep = (v: typeof step | ((p: typeof step) => typeof step)) => draft.set("step", v);
  const setQ = (v: typeof q | ((p: typeof q) => typeof q)) => draft.set("q", v);
  const setProp = (v: typeof prop | ((p: typeof prop) => typeof prop)) => draft.set("prop", v);
  const setKind = (v: typeof kind | ((p: typeof kind) => typeof kind)) => draft.set("kind", v);
  const setAgency = (v: typeof agency | ((p: typeof agency) => typeof agency)) =>
    draft.set("agency", v);
  const setResponsibleId = (
    v: typeof responsibleId | ((p: typeof responsibleId) => typeof responsibleId),
  ) => draft.set("responsibleId", v);
  const setWhen = (v: typeof when | ((p: typeof when) => typeof when)) => draft.set("when", v);
  const setParticipants = (
    v: typeof participants | ((p: typeof participants) => typeof participants),
  ) => draft.set("participants", v);
  const setFurnished = (v: typeof furnished | ((p: typeof furnished) => typeof furnished)) =>
    draft.set("furnished", v);
  const setCleaning = (v: typeof cleaning | ((p: typeof cleaning) => typeof cleaning)) =>
    draft.set("cleaning", v);
  const setKeys = (v: typeof keys | ((p: typeof keys) => typeof keys)) => draft.set("keys", v);
  const setMeters = (v: typeof meters | ((p: typeof meters) => typeof meters)) =>
    draft.set("meters", v);
  const setCounts = (v: typeof counts | ((p: typeof counts) => typeof counts)) =>
    draft.set("counts", v);
  const setRooms = (v: typeof rooms | ((p: typeof rooms) => typeof rooms)) => draft.set("rooms", v);
  const setPlanConfirmed = (
    v: typeof planConfirmed | ((p: typeof planConfirmed) => typeof planConfirmed),
  ) => draft.set("planConfirmed", v);
  const setNewRoom = (v: typeof newRoom | ((p: typeof newRoom) => typeof newRoom)) =>
    draft.set("newRoom", v);
  const [results, setResults] = useState<PropertyForInspection[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const responsibles = useQuery({
    queryKey: ["inspection-responsibles", session?.id],
    queryFn: () => responsiblesFn(),
  });

  const entry = useQuery({
    queryKey: ["inspection-entry-contract", session?.id, contractId],
    enabled: Boolean(contractId),
    queryFn: () => {
      if (!contractId) throw new Error("Contrato inválido.");
      return entryStateFn({ data: { contractId } });
    },
  });

  const contractProperty = useQuery({
    queryKey: ["inspection-entry-property", session?.id, contractId],
    enabled: Boolean(contractId),
    // Imóvel que não existe mais deve aparecer na hora, sem nova tentativa.
    retry: false,
    queryFn: () => {
      if (!contractId) throw new Error("Contrato inválido.");
      return contractPropertyFn({ data: { contractId } });
    },
  });

  const agreement = entry.data;
  const rentalAction =
    !contractId || !agreement
      ? null
      : rentalKind === "saida"
        ? exitInspectionAction({
            contractId,
            entry: {
              id: agreement.existingInspectionId,
              status: agreement.existingInspectionStatus,
              hasDocument: agreement.entryHasDocument,
            },
            existingExitId: agreement.exitInspectionId,
          })
        : entryInspectionAction({
            contractId,
            gate: {
              unlocked: agreement.unlocked,
              reviewedDocumentId: null,
              reviewedAt: agreement.reviewedAt,
              missing: agreement.missing,
            },
            existingInspectionId: agreement.existingInspectionId,
          });
  const existingId = rentalAction?.kind === "open" ? rentalAction.inspectionId : undefined;
  useEffect(() => {
    if (existingId)
      void navigate({
        to: "/vistorias/$vistoriaId",
        params: { vistoriaId: existingId },
        replace: true,
      });
  }, [existingId, navigate]);

  // O imóvel da locação vem do contrato após a leitura das permissões.
  useEffect(() => {
    const p = contractProperty.data;
    if (!draft.ready || !p || prop || rentalAction?.kind !== "start") return;
    choose(p);
    setKind(rentalKind);
    // Vistoria de aluguel começa vazia; na saída sugere só os nomes da entrada.
    setRooms(
      rentalKind === "saida"
        ? (entry.data?.entryRooms ?? []).map((r) => ({
            name: r.name,
            kind: r.kind as PlanRoom["kind"],
            items: [],
          }))
        : [],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractProperty.data, prop, rentalAction?.kind, draft.ready]);

  const contractProp = contractProperty.data ?? null;

  useEffect(() => {
    const term = q.trim();
    let current = true;
    setSearchError("");
    if (contractId || term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(
      () =>
        void search({ data: { q: term } })
          .then((rows) => {
            if (current) setResults(rows);
          })
          .catch((e) => {
            if (current) setSearchError(e.message || "Falha na busca. Tente novamente.");
          })
          .finally(() => {
            if (current) setSearching(false);
          }),
      300,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [contractId, q, search]);

  const isFurnished = furnished === "mobiliado" || furnished === "semimobiliado";
  const confirmed = useMemo(
    () => ({
      tipo: counts.tipo || null,
      dormitorios: numOrNull(counts.dormitorios),
      suites: numOrNull(counts.suites),
      banheiros: numOrNull(counts.banheiros),
      vagas: numOrNull(counts.vagas),
      salas: numOrNull(counts.salas),
    }),
    [counts],
  );
  const regenerate = () => {
    setRooms(buildRoomPlan({ ...confirmed, furnished: isFurnished }));
    setPlanConfirmed(false);
  };

  function choose(p: PropertyForInspection) {
    setProp(p);
    const brand = (p as { brand?: string | null }).brand;
    setAgency(
      brand === "morar"
        ? "morar"
        : brand === "cordial"
          ? "cordial"
          : p.codigo_cordial
            ? "cordial"
            : p.codigo_morar
              ? "morar"
              : "cordial",
    );
    const c = {
      tipo: p.tipo ?? "",
      dormitorios: p.dormitorios == null ? "" : String(p.dormitorios),
      suites: p.suites == null ? "" : String(p.suites),
      banheiros: p.banheiros == null ? "" : String(p.banheiros),
      vagas: p.vagas == null ? "" : String(p.vagas),
      salas: p.salas == null ? "" : String(p.salas),
    };
    setCounts(c);
    const fm = (p.mobiliado ?? "").toLowerCase();
    const parsed = parseMobiliado(p.mobiliado);
    const f = parsed === true ? "mobiliado" : parsed === false ? "nao" : fm.includes("semi")
      ? "semimobiliado"
      : fm.startsWith("s") || fm.includes("mobil")
        ? "mobiliado"
        : fm.startsWith("n")
          ? "nao"
          : "nao_informado";
    setFurnished(f);
    setRooms(
      buildRoomPlan({
        tipo: p.tipo,
        dormitorios: p.dormitorios,
        suites: p.suites,
        banheiros: p.banheiros,
        vagas: p.vagas,
        salas: p.salas,
        furnished: f === "mobiliado" || f === "semimobiliado",
      }),
    );
    setPlanConfirmed(false);
  }

  async function submit() {
    if (!prop || !session) return;
    if (!when) return toast.error("Informe data e hora.");
    if (busy) return;
    if (contractId && rentalAction?.kind !== "start") return;
    setBusy(true);
    try {
      await draft.flush();
      if (draft.error) throw new Error(draft.error);
      const res = await create({
        data: {
          id,
          propertyId: prop.id,
          contractId: contractId ?? null,
          ...(contractId ? { rentalKind } : {}),
          kind: contractId ? rentalKind : kind,
          agency,
          responsibleId: responsibleId || null,
          inspectedAt: new Date(when).toISOString(),
          participants: participants.filter((p) => p.nome.trim()),
          furnished,
          cleaning,
          keys: keys.filter((k) => k.descricao.trim()),
          meters,
          confirmed,
          rooms,
          planConfirmed,
        },
      });
      await draft.clear();
      toast.success(res.reused ? "Vistoria já criada — abrindo." : "Vistoria criada.");
      navigate({ to: "/vistorias/$vistoriaId", params: { vistoriaId: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a vistoria.");
    } finally {
      setBusy(false);
    }
  }

  const exitLocation = contractId
    ? {
        to: "/alugueis" as const,
        search: rentalSearch<RentalSearch>(
          { competencia: readRememberedCompetence() },
          { id: contractId, etapa: "vistorias" },
        ),
      }
    : { to: "/vistorias" as const };
  const blocked =
    contractId && (rentalAction?.kind !== "start" || contractProperty.isError || !contractProp);
  const selectedKind = contractId ? rentalKind : kind;
  const fam = propertyFamily(counts.tipo);

  if (!draft.ready)
    return (
      <p role="status" className="p-4">
        {draft.error || "Recuperando criação neste aparelho…"}
      </p>
    );
  return (
    <div className="inspection-workspace mx-auto w-full max-w-3xl pb-36">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Link
            {...exitLocation}
            aria-label={contractId ? "Voltar à locação" : "Voltar às vistorias"}
            className="grid size-11 place-items-center rounded-xl hover:bg-foreground/5"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-xl font-bold tracking-tight">Nova vistoria</h1>
          <button
            type="button"
            className="min-h-11 px-2 text-sm"
            onClick={() => setCancelOpen(true)}
          >
            Cancelar
          </button>
        </div>
        <p role="status" className="ml-11 text-xs text-foreground/60">
          {draft.error
            ? `Falha ao salvar: ${draft.error}`
            : draft.status === "persisting"
              ? "Gravando no aparelho…"
              : draft.status
                ? "No aparelho · criação recuperável"
                : null}
        </p>
        <ol aria-label="Etapas da criação" className="mt-3 grid grid-cols-4 gap-1 text-xs">
          {["Imóvel e tipo", "Preparação", "Cômodos", "Revisão"].map((label, i) => (
            <li
              key={label}
              aria-current={step === i ? "step" : undefined}
              className={cn(
                "border-t-2 pt-2",
                step === i
                  ? "border-primary font-bold text-primary"
                  : "border-border text-foreground/60",
              )}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </header>
      {contractId && blocked && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-card p-4 text-sm">
          {existingId ? (
            <Link
              to="/vistorias/$vistoriaId"
              params={{ vistoriaId: existingId }}
              className="inline-flex min-h-11 items-center font-semibold text-primary"
            >
              Abrir vistoria de {rentalKind === "saida" ? "saída" : "entrada"}
            </Link>
          ) : rentalAction?.kind === "blocked" ? (
            <p role="status">{rentalAction.reason}</p>
          ) : entry.isError || contractProperty.isError ? (
            <p role="alert">
              Confira o contrato e o imóvel da locação antes de iniciar a vistoria.
            </p>
          ) : (
            <p role="status" className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Conferindo a locação…
            </p>
          )}
        </div>
      )}
      {prop && step > 0 && !blocked && (
        <div className="mb-4 rounded-2xl border border-primary/25 bg-card px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold text-primary">
            Vistoria de {KIND_LABEL[selectedKind].toLocaleLowerCase("pt-BR")}
          </p>
          <p className="mt-1 break-words text-base font-semibold">
            {inspectionAddress(prop) || "Endereço não informado"}
          </p>
          {inspectionPropertyCodes(prop) && (
            <p className="mt-1 text-sm text-foreground/60">{inspectionPropertyCodes(prop)}</p>
          )}
        </div>
      )}
      {draft.recoveries.length > 0 && (
        <details className="mb-4 rounded-xl border p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">
            Criações recuperadas de outra aba ({draft.recoveries.length})
          </summary>
          <p className="mb-2 text-sm">
            Confira a versão antes de substituir a criação aberta. Nenhuma vistoria enviada será
            apagada.
          </p>
          {draft.recoveries.map((v) => {
            const recovered = v.entry.patch.form as typeof draft.form;
            return (
              <div key={v.entry.key} className="border-t py-2 text-sm">
                <p>{new Date(v.entry.updatedAt).toLocaleString("pt-BR")}</p>
                <p>
                  {recovered.prop
                    ? `${recovered.prop.tipo} · ${recovered.prop.logradouro ?? ""}, ${recovered.prop.numero ?? ""} · ${recovered.prop.complemento ?? ""}`
                    : "Imóvel ainda não selecionado"}
                </p>
                <p>
                  Etapa {recovered.step + 1} de 4 · {recovered.rooms.length} ambientes. Ao retomar,
                  confira os dados nas etapas.
                </p>
                <button
                  type="button"
                  className="min-h-11 text-primary underline"
                  onClick={() =>
                    void draft.recover(v.entry.key).catch((e) => toast.error(String(e)))
                  }
                >
                  Substituir criação aberta por esta versão
                </button>
                <button
                  type="button"
                  className="min-h-11 px-2 text-destructive"
                  onClick={() => {
                    if (window.confirm("Descartar esta versão recuperada da criação?"))
                      void draft.discardRecovery(v.entry.key);
                  }}
                >
                  Descartar esta versão
                </button>
              </div>
            );
          })}
        </details>
      )}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogTitle>Continuar esta criação depois?</DialogTitle>
          <DialogDescription>
            O rascunho pertence a esta conta e fica neste aparelho. Nenhuma vistoria existente será
            apagada.
          </DialogDescription>
          <Link
            {...exitLocation}
            className="min-h-11 rounded-xl bg-primary p-3 text-center text-primary-foreground"
          >
            Continuar depois
          </Link>
          <button
            type="button"
            className="min-h-11 text-destructive"
            onClick={async () => {
              await draft.clear();
              void navigate(exitLocation);
            }}
          >
            Descartar só o rascunho local
          </button>
        </DialogContent>
      </Dialog>

      {step === 0 && !blocked && (
        <section className="premium-card mb-4 rounded-2xl p-4 sm:p-5">
          <h2 className="mb-3 text-base font-semibold">Imóvel</h2>
          {results.some((p, i) =>
            results.some(
              (other, j) =>
                i !== j &&
                p.id !== other.id &&
                ((p.codigo_cordial && p.codigo_cordial === other.codigo_cordial) ||
                  (p.codigo_morar && p.codigo_morar === other.codigo_morar)),
            ),
          ) && (
            <p className="mb-3 text-sm text-amber-800">
              Há imóveis distintos com o mesmo código externo. Compare tipo, endereço, complemento e
              carteira; confirme o imóvel escolhido na próxima ação.
            </p>
          )}
          {searchError && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {searchError} Edite a busca para tentar novamente.
            </p>
          )}
          {prop ? (
            <div className="flex items-start justify-between gap-2 rounded-xl bg-primary/6 p-3">
              <div className="min-w-0 text-sm">
                <p className="break-words text-base font-semibold">
                  {inspectionAddress(prop) || "Endereço não informado"}
                </p>
                <p className="mt-1 text-foreground/65">
                  {[prop.tipo, inspectionPropertyCodes(prop)].filter(Boolean).join(" · ")}
                </p>
              </div>
              {!contractId && (
                <button
                  type="button"
                  onClick={() => setProp(null)}
                  aria-label="Trocar imóvel"
                  className="grid size-11 shrink-0 place-items-center rounded-xl"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ) : (
            <>
              <label className="relative block">
                <span className="sr-only">Buscar imóvel</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Código Cordial, Morar ou endereço"
                  className="h-11 pl-9"
                />
              </label>
              {searching && (
                <Loader2 className="mx-auto mt-3 size-4 animate-spin text-foreground/50" />
              )}
              <ul className="mt-2 space-y-1">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choose(p)}
                      className="min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-foreground/5"
                    >
                      <span className="block break-words font-semibold">
                        {inspectionAddress(p) || "Endereço não informado"}
                      </span>
                      <span className="text-foreground/65">
                        {[p.tipo, inspectionPropertyCodes(p)].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
                {q.trim().length >= 2 && !searching && !results.length && (
                  <li className="px-3 py-2 text-sm text-foreground/55">
                    Nenhum imóvel encontrado.
                  </li>
                )}
              </ul>
            </>
          )}
        </section>
      )}

      {step === 0 && !blocked && (
        <fieldset className="premium-card mb-4 rounded-2xl p-4 sm:p-5">
          <div className="mb-3 text-base font-semibold" id="creation-inspection-kind">
            Tipo de vistoria
          </div>
          {contractId ? (
            <p className="font-medium text-primary">{KIND_LABEL[rentalKind]}</p>
          ) : (
            <div
              role="group"
              aria-labelledby="creation-inspection-kind"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {INSPECTION_KINDS.map((k) => (
                <button
                  type="button"
                  key={k}
                  aria-pressed={kind === k}
                  className={cn(
                    "min-h-11 rounded-xl border px-2 text-sm font-medium",
                    kind === k
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border",
                  )}
                  onClick={() => setKind(k)}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {prop && !blocked && (
        <>
          {step === 1 && (
            <section className="premium-card mb-4 space-y-4 rounded-2xl p-4 sm:p-5">
              <h2 className="text-base font-semibold">Data e equipe</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                  <span className={label}>Data e hora (horário local)</span>
                  <Input
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    className="h-11"
                  />
                </label>
                <label>
                  <span className={label}>Imobiliária do laudo</span>
                  <select
                    value={agency}
                    onChange={(e) => setAgency(e.target.value as "cordial" | "morar")}
                    className={field}
                  >
                    <option value="cordial">Cordial</option>
                    <option value="morar">Morar</option>
                  </select>
                </label>
              </div>
              {responsibles.data?.canChoose ? (
                <label className="block">
                  <span className={label}>Responsável</span>
                  <select
                    value={responsibleId}
                    onChange={(e) => setResponsibleId(e.target.value)}
                    className={field}
                  >
                    <option value="">Eu ({session?.nome})</option>
                    {responsibles.data.options
                      .filter((o) => o.id !== session?.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nome}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs text-foreground/55">Responsável: {session?.nome}</p>
              )}
              <details>
                <summary className="min-h-11 cursor-pointer text-sm font-semibold text-primary">
                  Informações complementares (opcional)
                </summary>
                <p className="mb-3 text-sm text-foreground/60">
                  Você pode completar participantes, medidores e chaves durante a visita.
                </p>
                <div>
                  <span className={label}>Participantes (opcional)</span>
                  {participants.map((p, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <Input
                        aria-label="Nome"
                        placeholder="Nome"
                        value={p.nome}
                        onChange={(e) =>
                          setParticipants((l) =>
                            l.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)),
                          )
                        }
                        className="h-11"
                      />
                      <Input
                        aria-label="Papel"
                        placeholder="Papel (ex.: locatário)"
                        value={p.papel}
                        onChange={(e) =>
                          setParticipants((l) =>
                            l.map((x, j) => (j === i ? { ...x, papel: e.target.value } : x)),
                          )
                        }
                        className="h-11"
                      />
                      <button
                        type="button"
                        aria-label="Remover participante"
                        onClick={() => setParticipants((l) => l.filter((_, j) => j !== i))}
                        className="grid size-11 shrink-0 place-items-center rounded-xl"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setParticipants((l) => [...l, { nome: "", papel: "" }])}
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"
                  >
                    <Plus className="size-4" /> Participante
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    <span className={label}>Mobiliado</span>
                    <select
                      value={furnished}
                      onChange={(e) => setFurnished(e.target.value as typeof furnished)}
                      className={field}
                    >
                      <option value="nao_informado">Não informado</option>
                      <option value="nao">Não</option>
                      <option value="semimobiliado">Semimobiliado</option>
                      <option value="mobiliado">Mobiliado</option>
                    </select>
                  </label>
                  <label>
                    <span className={label}>Limpeza</span>
                    <select
                      value={cleaning}
                      onChange={(e) => setCleaning(e.target.value as typeof cleaning)}
                      className={field}
                    >
                      <option value="nao_informado">Não informado</option>
                      <option value="limpo">Limpo</option>
                      <option value="parcial">Parcialmente limpo</option>
                      <option value="sujo">Sujo</option>
                      <option value="nao_se_aplica">Não se aplica</option>
                    </select>
                  </label>
                </div>
                <div>
                  <span className={label}>Medidores</span>
                  {(Object.keys(METER_LABEL) as Array<keyof Meters>).map((k) => (
                    <div
                      key={k}
                      className="mb-2 grid grid-cols-[4rem_1fr] items-center gap-2 sm:grid-cols-[4rem_1fr_1fr]"
                    >
                      <span className="text-sm font-medium">{METER_LABEL[k]}</span>
                      <select
                        aria-label={`Situação do medidor de ${METER_LABEL[k]}`}
                        value={meters[k].status}
                        onChange={(e) =>
                          setMeters((m) => ({
                            ...m,
                            [k]: { ...m[k], status: e.target.value as MeterStatus },
                          }))
                        }
                        className={field}
                      >
                        {(Object.keys(METER_STATUS_LABEL) as MeterStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {METER_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      {meters[k].status === "informado" && (
                        <Input
                          aria-label={`Leitura de ${METER_LABEL[k]}`}
                          inputMode="decimal"
                          placeholder="Leitura"
                          value={meters[k].reading ?? ""}
                          onChange={(e) =>
                            setMeters((m) => ({ ...m, [k]: { ...m[k], reading: e.target.value } }))
                          }
                          className="col-span-2 h-11 sm:col-span-1"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <span className={label}>Chaves e controles</span>
                  {keys.map((k, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <Input
                        aria-label="Quantidade"
                        type="number"
                        min={0}
                        value={k.quantidade}
                        onChange={(e) =>
                          setKeys((l) =>
                            l.map((x, j) =>
                              j === i ? { ...x, quantidade: Number(e.target.value) || 0 } : x,
                            ),
                          )
                        }
                        className="h-11 w-20"
                      />
                      <Input
                        aria-label="Descrição"
                        placeholder="Ex.: chave porta principal"
                        value={k.descricao}
                        onChange={(e) =>
                          setKeys((l) =>
                            l.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)),
                          )
                        }
                        className="h-11"
                      />
                      <button
                        type="button"
                        aria-label="Remover"
                        onClick={() => setKeys((l) => l.filter((_, j) => j !== i))}
                        className="grid size-11 shrink-0 place-items-center rounded-xl"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setKeys((l) => [...l, { descricao: "", quantidade: 1 }])}
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"
                  >
                    <Plus className="size-4" /> Chave/controle
                  </button>
                </div>
              </details>
            </section>
          )}

          {step === 2 && (
            <section className="premium-card mb-4 space-y-4 rounded-2xl p-4 sm:p-5">
              <div>
                <h2 className="text-base font-semibold">Cômodos do imóvel</h2>
                <p className="mt-0.5 text-xs text-foreground/55">
                  Dormitórios já incluem suítes, e banheiros já incluem os das suítes, como no
                  cadastro. Ajuste e confirme.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(["tipo", "dormitorios", "suites", "banheiros", "vagas", "salas"] as const).map(
                  (k) => (
                    <label key={k}>
                      <span className={label}>
                        {
                          {
                            tipo: "Tipo",
                            dormitorios: "Dormitórios",
                            suites: "Suítes",
                            banheiros: "Banheiros",
                            vagas: "Vagas",
                            salas: "Salas",
                          }[k]
                        }
                      </span>
                      <Input
                        inputMode={k === "tipo" ? "text" : "numeric"}
                        value={counts[k]}
                        placeholder={k === "tipo" ? "" : "Não informado"}
                        onChange={(e) => setCounts((c) => ({ ...c, [k]: e.target.value }))}
                        className="h-11"
                      />
                    </label>
                  ),
                )}
              </div>
              <button
                type="button"
                onClick={regenerate}
                className="min-h-11 rounded-xl border border-input px-3 text-sm font-medium"
              >
                Gerar sugestão de novo
              </button>
              {fam === "outro" && (
                <p className="text-xs text-foreground/60">
                  Tipo não reconhecido: adicione os ambientes manualmente.
                </p>
              )}
              <ol className="space-y-1">
                {rooms.map((r, i) => (
                  <li key={i} className="flex items-center gap-1 rounded-xl bg-foreground/4 px-2">
                    <Input
                      aria-label={`Nome do ambiente ${i + 1}`}
                      value={r.name}
                      onChange={(e) =>
                        setRooms((l) =>
                          l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                        )
                      }
                      className="h-11 border-0 bg-transparent"
                    />
                    <span className="hidden shrink-0 text-[11px] text-foreground/50 sm:inline">
                      {r.items.length} itens
                    </span>
                    <button
                      type="button"
                      aria-label="Subir"
                      disabled={i === 0}
                      onClick={() => setRooms((l) => swap(l, i, i - 1))}
                      className="grid size-11 shrink-0 place-items-center disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Descer"
                      disabled={i === rooms.length - 1}
                      onClick={() => setRooms((l) => swap(l, i, i + 1))}
                      className="grid size-11 shrink-0 place-items-center disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remover ambiente"
                      onClick={() => setRooms((l) => l.filter((_, j) => j !== i))}
                      className="grid size-11 shrink-0 place-items-center"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="Nome do novo ambiente"
                  placeholder="Novo ambiente (ex.: Varanda)"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom((n) => ({ ...n, name: e.target.value }))}
                  className="h-11"
                />
                <select
                  aria-label="Tipo do novo ambiente"
                  value={newRoom.kind}
                  onChange={(e) => setNewRoom((n) => ({ ...n, kind: e.target.value as RoomKind }))}
                  className={cn(field, "sm:w-48")}
                >
                  {ROOM_KINDS.map((k) => (
                    <option key={k.v} value={k.v}>
                      {k.l}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!newRoom.name.trim()}
                  onClick={() => {
                    setRooms((l) => [
                      ...l,
                      {
                        name: newRoom.name.trim(),
                        kind: newRoom.kind,
                        items: itemsForRoom(newRoom.kind, isFurnished),
                      },
                    ]);
                    setNewRoom({ name: "", kind: "outro" });
                  }}
                  className="min-h-11 rounded-xl bg-primary/10 px-4 text-sm font-semibold text-primary disabled:opacity-40"
                >
                  Adicionar
                </button>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={planConfirmed}
                  onChange={(e) => setPlanConfirmed(e.target.checked)}
                />
                Confirmo que a lista de ambientes corresponde ao imóvel
              </label>
            </section>
          )}
        </>
      )}

      {step === 3 && prop && !blocked && (
        <section className="premium-card space-y-3 rounded-2xl p-4">
          <h2 className="text-base font-semibold">Confira a data e os cômodos</h2>
          <p className="text-sm">{new Date(when).toLocaleString("pt-BR")}</p>
          <p className="text-sm">
            Responsável:{" "}
            {responsibles.data?.options.find((p) => p.id === responsibleId)?.nome || session?.nome}
          </p>
          <p className="font-semibold">{rooms.length} ambientes confirmados</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {rooms.map((r, i) => (
              <li key={i}>
                {r.name} · {r.items.length} itens
              </li>
            ))}
          </ol>
          <p className="text-sm text-foreground/60">
            Os itens começam pendentes para registrar só o que for observado.
          </p>
        </section>
      )}
      {!blocked && (
        <footer className="inspection-footer fixed inset-x-0 bottom-0 z-40 px-4 pt-3">
          <div className="mx-auto flex max-w-3xl gap-2">
            {step > 0 && (
              <button
                type="button"
                className="min-h-12 rounded-xl border px-4"
                onClick={() => {
                  setStep(step - 1);
                  window.scrollTo({ top: 0 });
                }}
              >
                Voltar
              </button>
            )}
            <button
              type="button"
              disabled={
                busy ||
                Boolean(draft.error) ||
                !prop ||
                (step === 1 && !when) ||
                (step >= 2 && (!planConfirmed || !rooms.length))
              }
              onClick={() => {
                if (step < 3) {
                  setStep(step + 1);
                  window.scrollTo({ top: 0 });
                } else void submit();
              }}
              className="min-h-12 flex-1 rounded-xl bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-40"
            >
              {busy
                ? "Criando…"
                : step === 0
                  ? "Preparar vistoria"
                  : step === 3
                    ? "Iniciar vistoria"
                    : step === 1
                      ? "Selecionar cômodos"
                      : "Revisar vistoria"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function swap<T>(l: T[], a: number, b: number) {
  const c = l.slice();
  [c[a], c[b]] = [c[b], c[a]];
  return c;
}
