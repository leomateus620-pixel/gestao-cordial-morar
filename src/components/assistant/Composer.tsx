import { AtSign, ArrowRight, Check, Loader2, Mic, Paperclip, Square, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { AgentBot } from "@/lib/agent/bots";
import type { AssistantRecordContext } from "@/lib/agent/use-assistant";
import { searchAssistantRecords } from "@/lib/agent/search.functions";

type Mention = {
  kind: "client" | "property";
  id: string;
  label: string;
  detail: string;
  href: string;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export type ComposerProps = {
  bot?: AgentBot;
  value: string;
  onChange(value: string): void;
  onSend(): void;
  busy?: boolean;
  onRecordPick?(record?: AssistantRecordContext): void;
  context?: AssistantRecordContext;
  focusRequest?: number;
  onCancel?(): void;
};

/** Draft-only composer: mentions query the user's scope, speech never auto-sends. */
export function Composer({
  bot,
  value,
  onChange,
  onSend,
  busy = false,
  onRecordPick,
  onCancel,
  context,
  focusRequest = 0,
}: ComposerProps) {
  const input = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [activeRecord, setActiveRecord] = useState(0);
  useEffect(() => {
    if (focusRequest) input.current?.focus();
  }, [focusRequest]);
  useEffect(() => {
    setPicked((previous) =>
      previous?.id === context?.id && previous?.kind === context?.kind ? previous : null,
    );
  }, [context?.id, context?.kind]);
  const recognition = useRef<Recognition | null>(null);
  const [menu, setMenu] = useState<"slash" | "mention" | null>(null);
  const mentionKinds = (["client", "property"] as const).filter(
    (type) => !bot || bot.contextKinds.includes(type),
  );
  const [kind, setKind] = useState<"client" | "property">(mentionKinds[0] ?? "client");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Mention | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const draftBeforeSpeech = useRef("");
  const commands = bot?.suggestions.map((prompt, index) => ({
    label: ["/resumo", "/consultar", "/acompanhar"][index] ?? "/consultar",
    prompt,
  })) ?? [
    { label: "/agenda", prompt: "Como está minha agenda hoje?" },
    { label: "/match", prompt: "Encontre imóveis para um cliente" },
    { label: "/resumo", prompt: "Resuma meus atendimentos recentes" },
  ];
  useEffect(() => {
    setKind(mentionKinds[0] ?? "client");
    setPicked(null);
    setQuery("");
    setRecords([]);
  }, [bot?.id]);
  useEffect(() => {
    const speech = window as SpeechWindow;
    setSpeechSupported(Boolean(speech.SpeechRecognition ?? speech.webkitSpeechRecognition));
    return () => {
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);
  useEffect(() => {
    if (busy) recognition.current?.stop();
  }, [busy]);
  useEffect(() => {
    if (menu !== "mention" || query.trim().length < 2 || !mentionKinds.includes(kind)) {
      setRecords([]);
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      void searchAssistantRecords({ data: { kind, query: query.trim() }, signal: abort.signal })
        .then((rows) => {
          if (!abort.signal.aborted) setRecords(rows);
        })
        .catch(() => {
          if (!abort.signal.aborted) {
            setRecords([]);
            setError("Não foi possível consultar os registros. Tente novamente.");
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [menu, kind, query]);
  useEffect(() => setActiveRecord(0), [records]);
  useEffect(() => {
    document.getElementById(`${listId}-${activeRecord}`)?.scrollIntoView({ block: "nearest" });
  }, [activeRecord, listId]);
  function chooseRecord(record: Mention) {
    setPicked(record);
    onRecordPick?.({ kind: record.kind, id: record.id });
    onChange(`${value === "@" ? "" : value.trim()} @${record.label} `.trimStart().slice(0, 4000));
    setMenu(null);
    input.current?.focus();
  }
  function submit() {
    if (!busy && value.trim()) {
      recognition.current?.stop();
      setMenu(null);
      onSend();
    }
  }
  function dictate() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const speech = window as SpeechWindow;
    const Constructor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Constructor) return;
    const engine = new Constructor();
    recognition.current = engine;
    draftBeforeSpeech.current = value;
    engine.lang = "pt-BR";
    engine.continuous = false;
    engine.interimResults = false;
    engine.onresult = (event) => {
      const spoken = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");
      onChange(
        [draftBeforeSpeech.current.trim(), spoken.trim()].filter(Boolean).join(" ").slice(0, 4000),
      );
    };
    engine.onerror = (event) => {
      setSpeechError(
        event.error === "not-allowed"
          ? "O microfone não foi autorizado. Você pode digitar o pedido."
          : "Não consegui ouvir. Tente novamente ou digite o pedido.",
      );
      setListening(false);
    };
    engine.onend = () => setListening(false);
    try {
      setSpeechError("");
      engine.start();
      setListening(true);
    } catch {
      setSpeechError("O ditado não está disponível agora. Você pode digitar o pedido.");
    }
  }
  return (
    <div className="assistant-composer-wrap">
      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {(picked || context) && (
          <div className="mb-2 inline-flex max-w-full items-center gap-1 rounded-full bg-primary/8 pl-2.5 pr-1 text-xs text-primary">
            <Check size={11} />
            <span className="truncate">Em foco: {picked?.label ?? "registro selecionado"}</span>
            <button
              type="button"
              aria-label="Remover registro em foco"
              className="assistant-icon-button !size-8"
              disabled={busy}
              onClick={() => {
                setPicked(null);
                onRecordPick?.(undefined);
              }}
            >
              <X size={13} />
            </button>
          </div>
        )}
        {menu && (
          <div className="mb-3 rounded-xl border border-border bg-card p-2">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-[10px] font-semibold text-muted-foreground">
                {menu === "slash" ? "Comece com um pedido" : "Mencionar um registro"}
              </p>
              <button
                type="button"
                className="assistant-icon-button !size-6"
                aria-label="Fechar sugestões"
                onClick={() => setMenu(null)}
              >
                <X size={12} />
              </button>
            </div>
            {menu === "slash" ? (
              commands.map((command) => (
                <button
                  type="button"
                  key={command.label + command.prompt}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[11px] hover:bg-muted"
                  onClick={() => {
                    onChange(command.prompt);
                    setMenu(null);
                    input.current?.focus();
                  }}
                >
                  <span className="font-semibold text-primary">{command.label}</span>
                  <span className="text-muted-foreground">{command.prompt}</span>
                </button>
              ))
            ) : (
              <>
                <div className="mb-2 flex gap-2" role="group" aria-label="Tipo de registro">
                  {mentionKinds.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={kind === type}
                      onClick={() => {
                        setKind(type);
                        setRecords([]);
                      }}
                      className={`rounded-full px-3 py-1 text-[10px] ${kind === type ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {type === "client" ? "Clientes" : "Imóveis"}
                    </button>
                  ))}
                </div>
                <input
                  className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={kind === "client" ? "Nome do cliente" : "Código, bairro ou cidade"}
                  aria-label="Buscar registro para mencionar"
                  autoFocus
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={records.length > 0}
                  aria-controls={listId}
                  aria-activedescendant={records.length ? `${listId}-${activeRecord}` : undefined}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      setMenu(null);
                      input.current?.focus();
                    }
                    if (records.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                      event.preventDefault();
                      setActiveRecord(
                        (index) =>
                          (index + (event.key === "ArrowDown" ? 1 : records.length - 1)) %
                          records.length,
                      );
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (records[activeRecord]) chooseRecord(records[activeRecord]);
                    }
                  }}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  maxLength={80}
                />
                {loading ? (
                  <p className="flex gap-2 p-2 text-[11px] text-muted-foreground" role="status">
                    <Loader2 size={13} className="animate-spin" />
                    Consultando seus registros…
                  </p>
                ) : error ? (
                  <p role="alert" className="p-2 text-[11px] text-destructive">
                    {error}
                  </p>
                ) : records.length ? (
                  <ul
                    id={listId}
                    role="listbox"
                    aria-label="Registros encontrados"
                    className="max-h-48 overflow-y-auto"
                  >
                    {records.map((record, index) => (
                      <li key={record.id} role="none">
                        <button
                          type="button"
                          id={`${listId}-${index}`}
                          role="option"
                          aria-selected={activeRecord === index}
                          className={`min-h-11 w-full rounded-lg p-2 text-left hover:bg-muted focus-visible:outline-ring ${activeRecord === index ? "bg-primary/8" : ""}`}
                          onPointerMove={() => setActiveRecord(index)}
                          onClick={() => chooseRecord(record)}
                        >
                          <span className="block text-xs font-medium">{record.label}</span>
                          <span className="mt-1 block text-[10px] text-muted-foreground">
                            {record.detail}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-2 text-[10px] text-muted-foreground">
                    {query.trim().length < 2
                      ? "Digite pelo menos 2 caracteres. Só aparecem registros que você pode acessar."
                      : "Não encontrei registros com esse termo."}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <textarea
          ref={input}
          aria-label={bot ? `Mensagem para ${bot.name}` : "Mensagem para o assistente"}
          placeholder={
            bot
              ? `Escreva para ${bot.name}, ou digite / para sugestões`
              : "Pergunte ou digite @ para encontrar imóveis e clientes"
          }
          value={value}
          maxLength={4000}
          disabled={busy}
          rows={2}
          onChange={(event) => {
            onChange(event.target.value);
            if (event.target.value === "/") setMenu("slash");
            else if (event.target.value.endsWith("@")) setMenu("mention");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape" && menu) {
              event.stopPropagation();
              setMenu(null);
            }
          }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="assistant-icon-button !size-8 opacity-40"
              disabled
              aria-label="Anexos indisponíveis nesta etapa"
              title="Anexos aguardam um fluxo seguro de leitura de documentos"
            >
              <Paperclip size={15} />
            </button>
            <button
              type="button"
              className="assistant-icon-button !size-8"
              disabled={busy}
              aria-label="Buscar registro"
              aria-expanded={menu === "mention"}
              onClick={() => setMenu(menu === "mention" ? null : "mention")}
            >
              <AtSign size={16} />
            </button>
            <button
              type="button"
              className="assistant-icon-button !size-8 font-mono text-base"
              disabled={busy}
              aria-label="Sugestões de comandos"
              onClick={() => setMenu(menu === "slash" ? null : "slash")}
            >
              /
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`assistant-icon-button !size-8 ${listening ? "bg-destructive/10 text-destructive" : ""}`}
              disabled={!speechSupported || busy}
              aria-label={
                listening
                  ? "Parar ditado"
                  : speechSupported
                    ? "Ditar pedido, sem enviar"
                    : "Ditado não suportado neste navegador"
              }
              aria-pressed={listening}
              title="O ditado usa o reconhecimento de voz do navegador. Revise o texto antes de enviar."
              onClick={dictate}
            >
              <Mic size={16} />
            </button>
            {busy && onCancel ? (
              <button
                type="button"
                aria-label="Parar resposta"
                onClick={onCancel}
                className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Enviar mensagem"
                disabled={busy || !value.trim()}
                className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
              >
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        </div>
        {(listening || speechError) && (
          <p className="mt-2 text-[10px] text-muted-foreground" role="status">
            {listening ? "Ouvindo…" : speechError}
          </p>
        )}
      </form>
    </div>
  );
}
