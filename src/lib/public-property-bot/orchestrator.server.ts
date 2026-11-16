import {
  chatInputSchema,
  draftSchema,
  interpretationSchema,
  turnResultSchema,
  type BotAction,
  type BotBrand,
  type BotEvent,
  type BotQuestion,
  type ChatInput,
  type SearchDraft,
  type TurnResult,
  emptyFilters,
  rangeSchema,
} from "./contracts";
import {
  repository,
  type PublicRepository,
  type Acceptance,
  type Session,
  type BotConfiguration,
} from "./repository.server";
import { interpret } from "./provider.server";
import { localGreeting, normalizeText, parseBudget, reduceDraft } from "./state";
import { BotError } from "./errors";
import { sha256, secondsToRenewal } from "./quota.server";
import { featureEvidence } from "./features";
import { hardMatch } from "./ranking";
import { toCard } from "./cards";
import {
  nextQuestion,
  questionText,
  resultsAnswer,
  searchPublicProperties,
  validateLocations,
} from "./search.server";
import { QUOTA_MESSAGE } from "./brand-config";
import { redactIncidentalData } from "./privacy";
import { guardTextPatch } from "./text-patch";
import { recordTurnInsight } from "./insights.server";

export type TurnDependencies = { repo: PublicRepository; interpret: typeof interpret };
const defaults: TurnDependencies = { repo: repository, interpret };
const CHURRASCARIA_QUESTION = "Você quis dizer churrasqueira no imóvel?";
export type PreparedTurn = {
  input: ChatInput;
  brand: BotBrand;
  tokenHash: string;
  acceptance: Acceptance;
  config: BotConfiguration;
  history: Session["turns"];
};
export class TurnNotAccepted extends BotError {
  constructor(
    code: string,
    status: number,
    public draft: SearchDraft,
    retryAfter = 60,
  ) {
    super(code, status, retryAfter);
  }
}
export async function prepareTurn(
  brand: BotBrand,
  tokenHash: string,
  identity: { key: string; day: string },
  raw: unknown,
  signal: AbortSignal,
  deps: TurnDependencies = defaults,
): Promise<PreparedTurn> {
  const input = chatInputSchema.parse(raw);
  const config = await deps.repo.configuration(brand, signal);
  if (!config.enabled) throw new BotError("service_unavailable");
  const acceptance = await deps.repo.accept(
    brand,
    tokenHash,
    identity,
    input,
    await sha256(
      JSON.stringify({
        ...input,
        action:
          input.action.kind === "text"
            ? { ...input.action, text: redactIncidentalData(input.action.text) }
            : input.action,
      }),
    ),
    signal,
  );
  switch (acceptance.state) {
    case "exhausted":
      throw new TurnNotAccepted("quota_exhausted", 429, acceptance.draft, secondsToRenewal());
    case "burst":
      throw new TurnNotAccepted("burst", 429, acceptance.draft);
    case "busy":
      throw new TurnNotAccepted("busy", 409, acceptance.draft, 3);
    case "stale":
      throw new TurnNotAccepted("stale_revision", 409, acceptance.draft, 0);
    case "interrupted":
      throw new TurnNotAccepted("interrupted", 409, acceptance.draft, 0);
  }
  if (acceptance.state === "accepted" || acceptance.state === "replay") {
    await recordTurnInsight(deps.repo, brand, tokenHash, input.requestId, input.action);
  }
  // Only IDs and controlled historical answers. Never an employee or caller-supplied transcript.
  const session = await deps.repo.readSession(brand, tokenHash, signal);
  return { input, brand, tokenHash, acceptance, config, history: session.turns };
}
function baseResult(turn: PreparedTurn): TurnResult {
  return {
    requestId: turn.input.requestId,
    draft: { ...turn.acceptance.draft, revision: turn.acceptance.draft.revision + 1 },
    answer: "",
    cards: [],
    question: null,
    exhausted: turn.acceptance.exhausted,
    unavailable: false,
  };
}
function simpleOffScope(text: string) {
  return /\b(senha|credencia[il]|token|system prompt|prompt do sistema|cpf|comiss[aã]o|propriet[aá]rio|clientes cadastrados|contratos privados|banco de dados|sql|execute|mcp|troque a marca|outra imobili[aá]ria)\b/i.test(
    text,
  );
}
async function answerProperty(
  turn: PreparedTurn,
  action: Extract<BotAction, { kind: "property_question" }>,
  signal: AbortSignal,
  deps: TurnDependencies,
  result: TurnResult,
) {
  const previous = turn.history.find((t) => t.requestId === action.turnId);
  if (!previous?.ids.includes(action.publicId)) {
    result.answer = "Selecione um imóvel mostrado nesta conversa para consultar esse diferencial.";
    return;
  }
  const current = await deps.repo.resolve(turn.brand, [action.publicId], signal);
  const document = current.find((d) => d.brand === turn.brand && d.property.id === action.publicId);
  if (!document) {
    result.answer =
      "Esse imóvel não está mais disponível neste site. Posso buscar outras opções ou encaminhar você à equipe.";
    return;
  }
  const evidence = featureEvidence(document.property, action.feature, action.scope);
  const name = `${action.feature}${action.scope === "condominium" ? " no condomínio" : " privativa"}`;
  result.answer =
    evidence.state === "unknown"
      ? `Esse anúncio não informa ${name}. Você pode confirmar com nossa equipe pelo WhatsApp.`
      : evidence.state === "present"
        ? `O anúncio informa ${name}. Quer ver os detalhes ou falar com nossa equipe?`
        : `O anúncio informa que não há ${name}. Quer buscar outra opção?`;
  result.cards = [toCard(document, turn.config.whatsapp)];
}
export async function runTurn(
  turn: PreparedTurn,
  signal: AbortSignal,
  emit: (event: BotEvent) => void,
  deps: TurnDependencies = defaults,
): Promise<TurnResult> {
  let sequence = 0;
  let result = baseResult(turn);
  const send = (type: BotEvent["type"], message?: string, final?: TurnResult) =>
    emit({
      requestId: turn.input.requestId,
      sequence: sequence++,
      revision: final?.draft.revision ?? turn.acceptance.draft.revision,
      type,
      ...(message ? { message } : {}),
      ...(final ? { result: final } : {}),
    });
  send("accepted");
  if (turn.acceptance.state === "replay") {
    const saved = turn.acceptance.result;
    if (!saved) throw new BotError("service_unavailable");
    const docs = await deps.repo.resolve(turn.brand, saved.ids, signal);
    const current = new Map(
      docs
        .filter((d) => d.brand === turn.brand && hardMatch(d.property, saved.draft.filters))
        .map((d) => [d.property.id, d]),
    );
    const cards = saved.ids.flatMap((id) =>
      current.has(id) ? [toCard(current.get(id)!, turn.config.whatsapp)] : [],
    );
    const { ids: _ids, ...savedResult } = saved;
    result = turnResultSchema.parse({
      ...savedResult,
      draft: turn.acceptance.draft,
      cards,
      question: saved.draft.revision === turn.acceptance.draft.revision ? saved.question : null,
    });
    if (saved.ids.length)
      result.answer = cards.length
        ? "Atualizei as opções desta resposta com os anúncios disponíveis agora."
        : "Os imóveis desta resposta não estão mais disponíveis para esses critérios. Você pode ajustar a busca ou falar com nossa equipe.";
    send("done", undefined, result);
    return result;
  }
  const started = Date.now();
  try {
    let action: BotAction = turn.input.action;
    let skipQuestions = action.kind === "search";
    let pendingQuestion: BotQuestion | null = null;
    if (action.kind === "text") {
      if (localGreeting(action.text)) {
        result.question = nextQuestion(turn.acceptance.draft) ?? { kind: "operation" };
        result.answer = `Tudo bem! ${questionText(result.question)}`;
      } else if (simpleOffScope(action.text)) {
        result.answer =
          "Posso ajudar com os imóveis publicados neste site. Você procura comprar ou alugar?";
      } else if (
        turn.history.at(-1)?.answer === CHURRASCARIA_QUESTION &&
        (!action.replyTo || action.replyTo === turn.history.at(-1)?.requestId) &&
        /^(?:sim(?:,? churrasqueira)?|isso|isso mesmo|exato|exatamente|churrasqueira)[!.?\s]*$/.test(
          normalizeText(action.text),
        )
      ) {
        action = {
          kind: "filters",
          patch: {
            features: [
              ...turn.acceptance.draft.filters.features.filter(
                (f) => !(f.name === "churrasqueira" && f.scope === "private"),
              ),
              { name: "churrasqueira", scope: "private", state: "present", required: true },
            ],
          },
        };
      } else {
        send("status", "Entendendo seu pedido");
        const facets = await deps.repo.facets(turn.brand, signal);
        await deps.repo.reserveCost(turn.brand, turn.tokenHash, turn.input.requestId, signal);
        const response = await deps.interpret(
          action.text,
          turn.acceptance.draft,
          turn.brand,
          facets,
          signal,
        );
        const interpretation = interpretationSchema.parse(response.interpretation);
        if (
          ["search", "clarify"].includes(interpretation.intent) &&
          /\bchurrascaria\b/.test(normalizeText(action.text))
        )
          interpretation.ambiguity = "churrascaria";
        interpretation.patch = guardTextPatch(
          interpretation.patch,
          turn.acceptance.draft.filters,
          action.text,
        );
        const statedBudget = parseBudget(action.text);
        if (statedBudget && ["search", "clarify"].includes(interpretation.intent)) {
          const previous =
            interpretation.patch.operation &&
            interpretation.patch.operation !== turn.acceptance.draft.filters.operation
              ? null
              : turn.acceptance.draft.filters.budget;
          const combined = {
            min: statedBudget.min ?? previous?.min ?? null,
            max: statedBudget.max ?? previous?.max ?? null,
          };
          if (!rangeSchema.safeParse(combined).success) {
            result.question = {
              kind: "clarify",
              message:
                "Esse valor conflita com sua faixa atual. Qual valor mínimo e máximo você prefere?",
            };
            result.answer = result.question.message;
          } else interpretation.patch.budget = combined;
          interpretation.budgetAnswered = true;
        }
        if (["search", "clarify"].includes(interpretation.intent)) {
          const merged = new Map(
            turn.acceptance.draft.filters.features.map((f) => [`${f.name}:${f.scope}`, f]),
          );
          for (const feature of interpretation.patch.features ?? [])
            merged.set(`${feature.name}:${feature.scope}`, feature);
          const text = normalizeText(action.text);
          for (const name of ["piscina", "churrasqueira", "sala", "cozinha"] as const) {
            const remove = new RegExp(
              `nao (?:precisa|preciso|necessita|necessito)(?: ter| de)?(?: de)? (?:uma? )?${name}|sem preferencia (?:de |por |quanto a )?${name}|(?:retir[a-z]*|remov[a-z]*|tirar|tire|tira|desconsider[a-z]*) (?:a |o |uma? )?(?:exigencia de |filtro de )?${name}\\b`,
            ).test(text);
            if (remove) {
              merged.delete(`${name}:private`);
              merged.delete(`${name}:condominium`);
            }
          }
          if (
            interpretation.patch.features ||
            merged.size !== turn.acceptance.draft.filters.features.length
          )
            interpretation.patch.features = [...merged.values()];
        }
        await deps.repo
          .usage(
            turn.brand,
            turn.input.requestId,
            response.model,
            Date.now() - started,
            response.inputTokens,
            response.outputTokens,
            "ok",
          )
          .catch(() => {});
        if (interpretation.intent === "out_of_scope")
          result.answer =
            "Posso ajudar com os imóveis publicados neste site. Você tem algum bairro em mente?";
        else if (interpretation.intent === "greeting") {
          result.question = nextQuestion(turn.acceptance.draft) ?? { kind: "operation" };
          result.answer = questionText(result.question);
        } else if (interpretation.intent === "detail") {
          const replyTo = action.replyTo;
          const previous = replyTo
            ? turn.history.find((t) => t.requestId === replyTo)
            : [...turn.history].reverse().find((t) => t.ids.length);
          const id = interpretation.ordinal && previous?.ids[interpretation.ordinal - 1];
          if (!id || !previous || !interpretation.feature)
            result.answer = "Qual imóvel e diferencial você quer consultar?";
          else
            await answerProperty(
              turn,
              {
                kind: "property_question",
                publicId: id,
                turnId: previous.requestId,
                feature: interpretation.feature,
                scope: interpretation.scope,
              },
              signal,
              deps,
              result,
            );
        } else {
          if (interpretation.ambiguity === "churrascaria") {
            pendingQuestion = { kind: "clarify", message: CHURRASCARIA_QUESTION };
            if (interpretation.patch.features)
              interpretation.patch.features = [
                ...interpretation.patch.features.filter((f) => f.name !== "churrasqueira"),
                ...turn.acceptance.draft.filters.features.filter((f) => f.name === "churrasqueira"),
              ];
          } else if (interpretation.intent === "clarify" && interpretation.ambiguity === "other") {
            pendingQuestion = {
              kind: "clarify",
              message: "Pode explicar qual característica do imóvel você procura?",
            };
          }
          action = {
            kind: "filters",
            patch: interpretation.patch,
            countsAnswered: interpretation.countsAnswered || turn.acceptance.draft.countsAnswered,
            budgetAnswered:
              interpretation.budgetAnswered ||
              ((!interpretation.patch.operation ||
                interpretation.patch.operation === turn.acceptance.draft.filters.operation) &&
                turn.acceptance.draft.budgetAnswered),
          };
        }
      }
    }
    if (!result.answer) {
      if (action.kind === "property_question")
        await answerProperty(turn, action, signal, deps, result);
      else if (action.kind !== "text") {
        // A draft containing unvalidated text must never reach the persistence/catch path.
        const proposed = reduceDraft(turn.acceptance.draft, turn.input.revision, action);
        if (action.kind === "reset") {
          result.draft = proposed;
          result.question = { kind: "operation" };
          result.answer = "Vamos começar uma nova busca. Você procura comprar ou alugar?";
        } else {
          const facets = await deps.repo.facets(turn.brand, signal);
          const checked = validateLocations(proposed.filters, facets);
          proposed.filters = checked.filters;
          for (const field of checked.rejected)
            proposed.filters[field] = turn.acceptance.draft.filters[field];
          if (checked.rejected.includes("city"))
            proposed.filters.district = turn.acceptance.draft.filters.district;
          for (const field of ["reference", "stage"] as const) {
            const value = proposed.filters[field];
            if (!value) continue;
            const proof =
              redactIncidentalData(value) !== value
                ? []
                : await deps.repo.candidates(
                    turn.brand,
                    { ...emptyFilters(), [field]: value },
                    signal,
                  );
            const matched = proof.find(
              (d) =>
                d.brand === turn.brand &&
                normalizeText(d.property[field] ?? "") === normalizeText(value),
            );
            if (matched) proposed.filters[field] = matched.property[field];
            else {
              proposed.filters[field] = turn.acceptance.draft.filters[field];
              checked.question = {
                kind: "clarify",
                message:
                  field === "reference"
                    ? "Não localizei essa referência neste site. Quer revisar o código ou buscar pelas características?"
                    : "Não localizei esse estágio no catálogo. Quer buscar sem essa preferência?",
              };
            }
          }
          // Only canonical catalog values (or the previous valid draft) become durable state.
          result.draft = draftSchema.parse(proposed);
          result.question =
            pendingQuestion ??
            checked.question ??
            (skipQuestions ? null : nextQuestion(result.draft));
          if (result.question) result.answer = questionText(result.question);
          else {
            send(
              "status",
              turn.acceptance.draft.revision ? "Refinando sua busca" : "Buscando opções",
            );
            result.cards = await searchPublicProperties(
              deps.repo,
              turn.brand,
              result.draft.filters,
              turn.config.whatsapp,
              signal,
            );
            result.answer = resultsAnswer(result.cards);
          }
        }
      }
    }
    if (!result.answer) {
      result.question = nextQuestion(result.draft) ?? {
        kind: "clarify",
        message: "Conte o que você procura em um imóvel.",
      };
      result.answer = questionText(result.question);
    }
  } catch (error) {
    result.cards = [];
    result.unavailable = true;
    result.question = nextQuestion(result.draft);
    result.answer = signal.aborted
      ? "Busca interrompida. Seus filtros foram preservados."
      : "Não consegui concluir agora. Você pode continuar pelos filtros, usar a busca do site ou falar com nossa equipe.";
    // The accepted turn stays charged. No automatic retry of a potentially paid request.
    await deps.repo
      .usage(
        turn.brand,
        turn.input.requestId,
        "none",
        Date.now() - started,
        0,
        0,
        signal.aborted ? "cancelled" : error instanceof BotError ? error.code : "failed",
      )
      .catch(() => {});
  }
  result = turnResultSchema.parse(result);
  await deps.repo.complete(turn.brand, turn.tokenHash, result);
  send("filters_updated", undefined, result);
  if (result.question) send("question", undefined, result);
  if (result.cards.length) send("results", undefined, result);
  send("answer", result.answer, result);
  if (result.exhausted) send("quota_exhausted", QUOTA_MESSAGE, result);
  send("done", undefined, result);
  return result;
}
