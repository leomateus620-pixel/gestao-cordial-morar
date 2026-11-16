import { lazy, Suspense, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  Maximize2,
  MessageCircle,
  Minimize2,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import {
  newDraft,
  type BotAction,
  type BotBrand,
  type BotCard,
  type ChatInput,
  type SearchDraft,
  type Suggestion,
  type TurnResult,
} from "@/lib/public-property-bot/contracts";
import { botBrand, QUOTA_MESSAGE } from "@/lib/public-property-bot/brand-config";
import { centralContact } from "@/lib/public-property-bot/cards";
import { getSiteBrand } from "@/lib/cordial-site/brand";
import { openSession, publicErrorText, sendTurn, TransportError } from "./transport";
import { Question } from "./Questions";
import { FilterChips } from "./FilterChips";
import { PropertyCards } from "./PropertyCards";
import { suggestionEvent } from "./events";
import { Mascot, type MascotState } from "./Mascot";
import { BotBoundary } from "./BotBoundary";
import "./panel.css";
const VoiceCapture = lazy(() => import("./VoiceCapture"));
type Message = {
  requestId: string;
  user?: string;
  answer?: string;
  cards: BotCard[];
  result?: TurnResult;
  sourceSuggestion?: Suggestion;
};
type Props = {
  brand: BotBrand;
  whatsapp: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  id: string;
};
export default function PublicPropertyBotPanel({
  brand,
  whatsapp,
  open,
  onOpenChange,
  triggerRef,
  id,
}: Props) {
  const config = botBrand(brand),
    site = getSiteBrand(brand);
  const [expanded, setExpanded] = useState(false),
    [loading, setLoading] = useState(false),
    [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<SearchDraft>(newDraft),
    [text, setText] = useState(""),
    [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [voice, setVoice] = useState(false),
    [voicePhase, setVoicePhase] = useState<"idle" | "permission" | "recording" | "transcribing">(
      "idle",
    );
  const [audioReview, setAudioReview] = useState(false),
    [busy, setBusy] = useState(false),
    [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState(""),
    [errorCode, setErrorCode] = useState(""),
    [status, setStatus] = useState("");
  const [contact, setContact] = useState(centralContact(brand, whatsapp)),
    [newResponse, setNewResponse] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null),
    scroller = useRef<HTMLDivElement>(null),
    nearEnd = useRef(true);
  const scrollIntent = useRef<{ kind: "end" } | { kind: "answer"; requestId: string } | null>(null),
    revealedRequest = useRef<string | null>(null),
    latestResponse = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    pending = useRef<ChatInput | null>(null),
    busyRef = useRef(false);
  const currentDraft = useRef(draft);
  const previousBrand = useRef(brand),
    opening = useRef(0),
    sentEvents = useRef(new Set<string>());
  currentDraft.current = draft;
  const onVoiceStatus = useCallback(
    (next: "idle" | "permission" | "recording" | "transcribing") => setVoicePhase(next),
    [],
  );
  const onTranscript = useCallback((transcript: string) => {
    setText((current) => [current.trim(), transcript].filter(Boolean).join(" "));
    setAudioReview(true);
    queueMicrotask(() => input.current?.focus());
  }, []);
  function recordSuggestion(
    kind: "impression" | "search" | "open" | "whatsapp",
    suggestion: Suggestion,
    scope: string,
  ) {
    const key = `${brand}:${scope}:${kind}:${suggestion.id}`;
    if (sentEvents.current.has(key)) return;
    if (suggestionEvent(brand, kind, suggestion)) sentEvents.current.add(key);
  }
  useEffect(() => {
    if (!open || loading || !ready || messages.length) return;
    suggestions.forEach((suggestion) =>
      recordSuggestion("impression", suggestion, `opening-${opening.current}`),
    );
  }, [open, loading, ready, messages.length, suggestions, brand]);
  function scrollToEnd() {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    nearEnd.current = true;
    setNewResponse(false);
  }
  function scrollToAnswer(requestId: string | null) {
    const container = scroller.current;
    const turn =
      container &&
      Array.from(container.querySelectorAll<HTMLElement>(".ppb-turn")).find(
        (element) => element.dataset.requestId === requestId,
      );
    const answer = turn?.querySelector<HTMLElement>(".ppb-bot-message");
    if (!container || !answer) return scrollToEnd();
    container.scrollTop = Math.max(
      0,
      container.scrollTop +
        answer.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        12,
    );
    setNewResponse(false);
  }
  useEffect(() => {
    const intent = scrollIntent.current;
    if (!open || !intent) return;
    if (nearEnd.current) {
      const frame = requestAnimationFrame(() => {
        if (scrollIntent.current !== intent) return;
        scrollIntent.current = null;
        if (intent.kind === "answer") scrollToAnswer(intent.requestId);
        else scrollToEnd();
      });
      return () => cancelAnimationFrame(frame);
    }
    scrollIntent.current = null;
    setNewResponse(true);
  }, [messages, open]);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const update = () => {
      const root = document.getElementById(id);
      root?.style.setProperty(
        "--ppb-visible-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      root?.style.setProperty("--ppb-visible-top", `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open, id, loading]);
  async function refresh() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const run = ++generation.current;
    setLoading(true);
    setError("");
    setErrorCode("");
    setReady(false);
    try {
      const session = await openSession(brand, request.signal);
      if (run !== generation.current) return;
      setDraft(session.draft);
      currentDraft.current = session.draft;
      setVoice(session.voice);
      // Only the server's São Paulo day and global IP quota determine renewal.
      setExhausted(session.exhausted ?? false);
      revealedRequest.current = session.turns.at(-1)?.requestId ?? null;
      latestResponse.current = revealedRequest.current;
      scrollIntent.current = { kind: "end" };
      nearEnd.current = true;
      setReady(session.enabled);
      setContact(
        /^https:\/\/wa\.me\/55\d{10,11}\?text=/.test(session.contactHref) ||
          session.contactHref === `${site.basePath}/contato`
          ? session.contactHref
          : centralContact(brand, whatsapp),
      );
      // Opening revalidates historical cards. Typed text and suggestion attribution stay only in this mounted client.
      const waiting = pending.current;
      const recovered =
        waiting && session.turns.some((turn) => turn.requestId === waiting.requestId);
      if (recovered || (waiting && waiting.revision < session.draft.revision))
        pending.current = null;
      setMessages((previous) => {
        const next = session.turns.map((turn) => {
          const local = previous.find((message) => message.requestId === turn.requestId);
          return { ...turn, user: local?.user, sourceSuggestion: local?.sourceSuggestion };
        });
        const incomplete =
          pending.current &&
          previous.find((message) => message.requestId === pending.current!.requestId);
        return incomplete ? [...next, { ...incomplete, cards: [] }] : next;
      });
      setSuggestions(session.suggestions);
      if (pending.current) {
        setErrorCode("interrupted");
        setError(publicErrorText("interrupted"));
      }
      if (!session.enabled) setError(publicErrorText("service_unavailable"));
    } catch {
      if (run === generation.current && !request.signal.aborted) {
        setError(publicErrorText("service_unavailable"));
        setErrorCode("service_unavailable");
      }
    } finally {
      if (run === generation.current) {
        setLoading(false);
        setBusy(false);
        busyRef.current = false;
        controller.current = null;
      }
    }
  }
  useEffect(() => {
    if (previousBrand.current !== brand) {
      previousBrand.current = brand;
      pending.current = null;
      sentEvents.current.clear();
      setMessages([]);
      setText("");
      setSuggestions([]);
      setDraft(newDraft());
      setExhausted(false);
      setContact(centralContact(brand, whatsapp));
    }
    if (open) {
      opening.current++;
      void refresh();
    } else {
      generation.current++;
      controller.current?.abort();
      controller.current = null;
      busyRef.current = false;
      setBusy(false);
      setReady(false);
    }
    return () => {
      generation.current++;
      controller.current?.abort();
      controller.current = null;
    };
  }, [open, brand]);
  async function send(
    action: BotAction,
    label: string,
    retry?: ChatInput,
    sourceSuggestion?: Suggestion,
  ) {
    if (!ready || busyRef.current || exhausted || voicePhase !== "idle") return;
    const request = retry ?? {
      requestId: crypto.randomUUID(),
      revision: currentDraft.current.revision,
      action,
    };
    pending.current = request;
    const run = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setErrorCode("");
    setStatus("Enviando pedido");
    nearEnd.current = true;
    scrollIntent.current = { kind: "end" };
    revealedRequest.current = null;
    setAudioReview(false);
    if (!retry)
      setMessages((previous) => [
        ...previous,
        { requestId: request.requestId, user: label, cards: [], sourceSuggestion },
      ]);
    let completed = false,
      streamError = false;
    try {
      await sendTurn(brand, request, abort.signal, (event) => {
        if (run !== generation.current || abort.signal.aborted) return;
        if ((event.type === "accepted" || event.type === "done") && sourceSuggestion)
          recordSuggestion("search", sourceSuggestion, request.requestId);
        if (event.type === "status")
          setStatus(
            ["Refinando sua busca", "Buscando opções", "Entendendo seu pedido"].includes(
              event.message ?? "",
            )
              ? event.message!
              : "Preparando resposta",
          );
        if (event.result && event.result.draft.revision >= currentDraft.current.revision) {
          const result = event.result;
          if (revealedRequest.current !== request.requestId) {
            revealedRequest.current = request.requestId;
            latestResponse.current = request.requestId;
            scrollIntent.current = { kind: "answer", requestId: request.requestId };
          }
          setDraft(result.draft);
          currentDraft.current = result.draft;
          setExhausted(result.exhausted);
          setMessages((previous) =>
            previous.map((message) =>
              message.requestId === request.requestId
                ? { ...message, answer: result.answer, cards: result.cards, result }
                : message,
            ),
          );
        }
        if (event.type === "quota_exhausted") setExhausted(true);
        if (event.type === "error") {
          streamError = true;
          setErrorCode(event.code ?? "interrupted");
          setError(publicErrorText(event.code ?? "interrupted"));
        }
        if (event.type === "done") {
          completed = true;
          if (!streamError) pending.current = null;
        }
      });
      if (!completed) throw new TransportError("interrupted");
    } catch (reason) {
      if (run !== generation.current) return;
      const code =
        reason instanceof TransportError
          ? reason.code
          : abort.signal.aborted
            ? "interrupted"
            : "service_unavailable";
      if (code === "quota_exhausted" || code === "exhausted") {
        setExhausted(true);
        pending.current = null;
      } else {
        setErrorCode(code);
        setError(publicErrorText(code));
        if (request.action.kind === "text") {
          const original = request.action.text;
          setText((current) => current || original);
        }
      }
    } finally {
      if (run === generation.current) {
        setBusy(false);
        busyRef.current = false;
        setStatus("");
        controller.current = null;
      }
    }
  }
  function stop() {
    controller.current?.abort();
    setStatus("");
  }
  function submit() {
    const message = text.trim();
    if (!message || message.length > 1800 || busy || !ready || exhausted || voicePhase !== "idle")
      return;
    setText("");
    void send({ kind: "text", text: message }, message);
  }
  const latest = messages.at(-1);
  const mascotState: MascotState =
    voicePhase === "recording"
      ? "listening"
      : busy || loading || voicePhase === "transcribing"
        ? "searching"
        : latest?.answer && !error
          ? "complete"
          : "neutral";
  const unavailable = !ready && !loading;
  const resumedQuestion =
    !latest?.result?.question &&
    (!draft.filters.operation
      ? { kind: "operation" as const }
      : !draft.countsAnswered
        ? { kind: "counts" as const }
        : !draft.budgetAnswered
          ? { kind: "budget" as const, operation: draft.filters.operation }
          : null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ppb-overlay" />
        <Dialog.Content
          id={id}
          className={`ppb-panel${expanded ? " ppb-expanded" : ""}`}
          data-brand={brand}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef?.current?.focus();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <header className="ppb-heading">
            <Mascot brand={brand} state={mascotState} />
            <div>
              <Dialog.Title>{config.name}</Dialog.Title>
              <Dialog.Description>Assistente virtual</Dialog.Description>
            </div>
            <a
              className="ppb-icon ppb-heading-contact"
              href={contact}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                contact.startsWith("https:")
                  ? "Falar com a equipe pelo WhatsApp"
                  : "Abrir contato da equipe"
              }
            >
              <MessageCircle size={22} />
            </a>
            <button
              type="button"
              className="ppb-icon ppb-expand"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Reduzir conversa" : "Expandir conversa"}
              aria-pressed={expanded}
            >
              {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <Dialog.Close className="ppb-icon" aria-label="Fechar conversa">
              <X size={22} />
            </Dialog.Close>
          </header>
          <div
            className="ppb-scroll"
            ref={scroller}
            onScroll={() => {
              if (!scroller.current) return;
              nearEnd.current =
                scroller.current.scrollHeight -
                  scroller.current.scrollTop -
                  scroller.current.clientHeight <
                90;
              if (nearEnd.current) setNewResponse(false);
            }}
          >
            {!messages.length && (
              <section className="ppb-welcome">
                <Mascot brand={brand} size={64} state={mascotState} />
                <h2>Vamos encontrar seu lugar?</h2>
                <p>Conte o que você procura. Eu busco os imóveis deste site.</p>
                {!loading && ready && (
                  <div className="ppb-suggestions">
                    {suggestions.map((suggestion) => (
                      <button
                        type="button"
                        disabled={busy || exhausted || voicePhase !== "idle"}
                        key={suggestion.id}
                        onClick={() => {
                          void send(
                            { kind: "filters", patch: suggestion.patch },
                            suggestion.label,
                            undefined,
                            suggestion,
                          );
                        }}
                      >
                        {suggestion.label}
                        <ArrowUp size={15} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
            {loading && (
              <p className="ppb-status" role="status">
                Abrindo sua busca…
              </p>
            )}
            {!loading && ready && (
              <FilterChips
                key={draft.revision}
                filters={draft.filters}
                disabled={busy || exhausted || voicePhase !== "idle"}
                onApply={(patch) =>
                  void send({ kind: "filters", patch }, "Atualizar os filtros da busca")
                }
              />
            )}
            <div className="ppb-messages" aria-label="Conversa">
              {messages.map((message) => (
                <section
                  className="ppb-turn"
                  data-request-id={message.requestId}
                  key={message.requestId}
                >
                  {message.user && (
                    <p className="ppb-user-message">
                      <span className="ppb-sr-only">Você: </span>
                      {message.user}
                    </p>
                  )}
                  {message.answer && (
                    <div className="ppb-bot-message">
                      <span className="ppb-sr-only">{config.name}: </span>
                      <p>{message.answer}</p>
                    </div>
                  )}
                  {ready && !loading ? (
                    <PropertyCards
                      cards={message.cards}
                      brand={brand}
                      onAction={
                        message.sourceSuggestion
                          ? (kind) =>
                              recordSuggestion(kind, message.sourceSuggestion!, message.requestId)
                          : undefined
                      }
                    />
                  ) : message.cards.length ? (
                    <p className="ppb-status">
                      {loading
                        ? "Conferindo os anúncios desta resposta…"
                        : "Não foi possível confirmar estes anúncios agora."}
                    </p>
                  ) : null}
                  {message.result?.question && (
                    <Question
                      question={message.result.question}
                      draft={message.result.draft}
                      disabled={
                        !ready ||
                        loading ||
                        busy ||
                        exhausted ||
                        voicePhase !== "idle" ||
                        latest?.requestId !== message.requestId ||
                        message.result.draft.revision !== draft.revision
                      }
                      onSubmit={(action, label) => void send(action, label)}
                    />
                  )}
                </section>
              ))}
            </div>
            {ready && !loading && !busy && !exhausted && resumedQuestion && (
              <Question
                key={`resume-${draft.revision}`}
                question={resumedQuestion}
                draft={draft}
                disabled={voicePhase !== "idle"}
                onSubmit={(action, label) => void send(action, label)}
              />
            )}
            {busy && (
              <div className="ppb-loading">
                <p className="ppb-status" role="status">
                  {status || "Buscando opções"}
                </p>
                {["Buscando opções", "Refinando sua busca"].includes(status) && (
                  <div className="ppb-skeleton" aria-hidden="true">
                    <span />
                    <div>
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                )}
              </div>
            )}
            <span className="ppb-sr-only" aria-live="polite" aria-atomic="true">
              {!busy && latest?.answer ? latest.answer : ""}
            </span>
            {error && (
              <div className="ppb-error" role="alert">
                <p>{error}</p>
                <div>
                  {pending.current &&
                    !["stale", "stale_revision", "session_expired"].includes(errorCode) &&
                    ready && (
                      <button
                        className="ppb-secondary"
                        type="button"
                        disabled={busy || voicePhase !== "idle"}
                        onClick={() => {
                          const request = pending.current;
                          if (request)
                            void send(
                              request.action,
                              "",
                              request,
                              messages.find((message) => message.requestId === request.requestId)
                                ?.sourceSuggestion,
                            );
                        }}
                      >
                        Recuperar envio
                      </button>
                    )}
                  {(!ready ||
                    ["stale", "stale_revision", "session_expired"].includes(errorCode)) && (
                    <button className="ppb-secondary" type="button" onClick={() => void refresh()}>
                      Reabrir busca
                    </button>
                  )}
                  <a href={`${site.basePath}/buscar`} className="ppb-text-button">
                    Usar busca do site
                  </a>
                </div>
              </div>
            )}
            {exhausted && (
              <div className="ppb-quota" role="status">
                <p>{QUOTA_MESSAGE}</p>
                <a className="ppb-primary" href={contact} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={18} />
                  {contact.startsWith("https:") ? "Continuar no WhatsApp" : "Falar com a equipe"}
                </a>
              </div>
            )}
            {unavailable && (
              <a
                className="ppb-primary ppb-unavailable-contact"
                href={contact}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={18} />
                Falar com a equipe
              </a>
            )}
            {ready && messages.length > 0 && !exhausted && (
              <button
                type="button"
                className="ppb-text-button ppb-new-search"
                disabled={busy || voicePhase !== "idle"}
                onClick={() => void send({ kind: "reset" }, "Nova busca")}
              >
                <RotateCcw size={15} />
                Nova busca
              </button>
            )}
          </div>
          {newResponse && (
            <button
              type="button"
              className="ppb-new-response"
              onClick={() => scrollToAnswer(latestResponse.current)}
            >
              <ArrowDown size={16} />
              Nova resposta
            </button>
          )}
          <footer className="ppb-composer-footer">
            {audioReview && (
              <p className="ppb-audio-review" role="status">
                Revise o texto e envie quando quiser.
              </p>
            )}
            {text.length > 1800 && (
              <p id={`${id}-length`} className="ppb-audio-review" role="alert">
                Seu rascunho e a transcrição foram preservados. Encurte a mensagem para até 1.800
                caracteres antes de enviar.
              </p>
            )}
            <form
              className="ppb-composer"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <label htmlFor={`${id}-message`} className="ppb-sr-only">
                Sua mensagem para o {config.name}
              </label>
              <textarea
                ref={input}
                id={`${id}-message`}
                value={text}
                rows={2}
                maxLength={1800}
                aria-invalid={text.length > 1800 || undefined}
                aria-describedby={text.length > 1800 ? `${id}-length` : undefined}
                placeholder={
                  exhausted
                    ? "Continue com a equipe pelo WhatsApp"
                    : "Descreva o imóvel que você procura"
                }
                disabled={exhausted}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="ppb-composer-actions">
                <BotBoundary
                  onError={() => setVoicePhase("idle")}
                  fallback={
                    <span className="ppb-voice-unavailable" role="status">
                      Voz indisponível
                    </span>
                  }
                >
                  <Suspense fallback={null}>
                    <VoiceCapture
                      brand={brand}
                      enabled={voice && ready}
                      active={open}
                      blocked={busy || exhausted || loading}
                      onText={onTranscript}
                      onStatus={onVoiceStatus}
                    />
                  </Suspense>
                </BotBoundary>
                {busy ? (
                  <button
                    type="button"
                    className="ppb-send"
                    onClick={stop}
                    aria-label="Interromper resposta"
                  >
                    <Square size={17} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="ppb-send"
                    disabled={
                      !text.trim() ||
                      text.length > 1800 ||
                      !ready ||
                      exhausted ||
                      voicePhase !== "idle" ||
                      loading
                    }
                    aria-label="Enviar mensagem"
                  >
                    <ArrowUp size={22} />
                  </button>
                )}
              </div>
            </form>
            <p className="ppb-privacy">
              IA e voz ajudam na busca.{" "}
              <a href={`${site.basePath}/privacidade`} target="_blank" rel="noopener noreferrer">
                Privacidade
              </a>
            </p>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
