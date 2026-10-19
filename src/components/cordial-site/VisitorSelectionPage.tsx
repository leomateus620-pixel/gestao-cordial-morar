import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowRight, Copy, ListPlus, Share2, Trash2 } from "lucide-react";
import { loadSummaries } from "@/lib/cordial-site/data";
import type { PublicProperty } from "@/lib/cordial-site/contract";
import { visitorSelection, useVisitorSelection } from "@/lib/selecoes/visitor-store";
import {
  createVisitorSelection,
  type VisitorPublicSelection,
} from "@/lib/selecoes/visitor.functions";
import { visitorSelectionFingerprint, VISITOR_SELECTION_LIMIT } from "@/lib/selecoes/visitor-rules";
import { PropertyCard } from "./PropertyCard";
import { SiteLink } from "./SiteShell";
import { PageIntro } from "./ContentPages";
import "./visitor-selection.css";

function SelectionShare({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="cs-selection-share">
      <label htmlFor="selection-share-url">Link de leitura da sua seleção</label>
      <input
        id="selection-share-url"
        ref={input}
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="cs-selection-actions">
        <button
          type="button"
          className="cs-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              input.current?.focus();
              input.current?.select();
            }
          }}
        >
          <Copy size={17} /> {copied ? "Link copiado" : "Copiar link"}
        </button>
        <a
          className="cs-text-link"
          href={`https://wa.me/?text=${encodeURIComponent(`Veja minha seleção de imóveis da Cordial: ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Compartilhar no WhatsApp
        </a>
        <a
          className="cs-text-link"
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Facebook
        </a>
      </div>
      <span className="cs-sr-only" role="status">
        {copied ? "Link copiado para a área de transferência." : ""}
      </span>
    </div>
  );
}

export function VisitorSelectionPage() {
  const { ids } = useVisitorSelection();
  const fingerprint = visitorSelectionFingerprint([...ids]);
  const [items, setItems] = useState<PublicProperty[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{
    url: string;
    fingerprint: string;
    expiresAt: string;
  } | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("cordial:availability-refresh", refresh);
    return () => window.removeEventListener("cordial:availability-refresh", refresh);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setPending(true);
    setFailed(false);
    setError("");
    const idsToRead = fingerprint ? fingerprint.split(",") : [];
    if (!idsToRead.length) {
      setItems([]);
      setMissing([]);
      setPending(false);
      return;
    }
    // This bounded summary read never downloads a complete gallery or details per property.
    void loadSummaries(idsToRead, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setItems(result.items);
          setMissing(result.missingIds);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setPending(false);
      });
    return () => abort.abort();
  }, [fingerprint, retry]);

  return (
    <div className="cs-container cs-content-page">
      <PageIntro
        eyebrow="Separe, compare, compartilhe"
        title="Minha seleção."
        description={`Escolha até ${VISITOR_SELECTION_LIMIT} imóveis e gere um link para abrir em outro dispositivo ou compartilhar. Favoritos continuam separados.`}
      />
      <div className="cs-selection-toolbar">
        <strong>
          {ids.length} de {VISITOR_SELECTION_LIMIT} imóveis
        </strong>
        {ids.length > 0 && (
          <button
            type="button"
            className="cs-text-link"
            disabled={pending}
            onClick={() => setRetry((value) => value + 1)}
          >
            Atualizar disponibilidade
          </button>
        )}
        <SiteLink className="cs-text-link" to="/site/buscar">
          Continuar buscando <ArrowRight size={18} />
        </SiteLink>
        {ids.length > 0 && (
          <button type="button" className="cs-text-link" onClick={() => visitorSelection.clear()}>
            <Trash2 size={16} /> Limpar seleção
          </button>
        )}
      </div>
      {pending && <p role="status">Atualizando disponibilidade…</p>}
      {failed && (
        <p role="alert">
          Não foi possível atualizar sua seleção.{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {missing.length > 0 && (
        <div className="cs-inline-state">
          <p>
            {missing.length}{" "}
            {missing.length === 1 ? "imóvel ficou indisponível" : "imóveis ficaram indisponíveis"}.
            Seus dados não são mais exibidos.
          </p>
          <button
            type="button"
            className="cs-text-link"
            onClick={() => missing.forEach((id) => visitorSelection.remove(id))}
          >
            Remover indisponíveis da seleção
          </button>
        </div>
      )}
      {!ids.length && (
        <div className="cs-state">
          <ListPlus size={36} />
          <h2>Suas escolhas começam no catálogo.</h2>
          <p>Use “Selecionar” nos imóveis que deseja comparar ou compartilhar.</p>
          <SiteLink className="cs-button" to="/site/buscar">
            Explorar imóveis <ArrowRight size={18} />
          </SiteLink>
        </div>
      )}
      {items.length > 0 && (
        <div className="cs-property-grid">
          {ids
            .flatMap((id) => items.find((item) => item.id === id) ?? [])
            .map((item) => (
              <div key={item.id} className="cs-selection-item">
                <PropertyCard property={item} />
                <div className="cs-selection-item-controls">
                  <button
                    type="button"
                    aria-label={`Mover referência ${item.reference} para antes`}
                    disabled={ids.indexOf(item.id) === 0}
                    onClick={() => visitorSelection.move(item.id, -1)}
                  >
                    <ArrowUp size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover referência ${item.reference} para depois`}
                    disabled={ids.indexOf(item.id) === ids.length - 1}
                    onClick={() => visitorSelection.move(item.id, 1)}
                  >
                    <ArrowDown size={18} />
                  </button>
                  <button type="button" onClick={() => visitorSelection.remove(item.id)}>
                    <Trash2 size={16} /> Remover
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
      {ids.length > 0 && (
        <section className="cs-selection-save" aria-labelledby="selection-share-heading">
          <h2 id="selection-share-heading">Leve suas escolhas com você.</h2>
          <p>
            O link contém apenas os imóveis escolhidos. Não inclui seus favoritos, histórico ou
            dados pessoais. Validade de 30 dias; a disponibilidade é consultada novamente a cada
            abertura.
          </p>
          <button
            type="button"
            className="cs-button"
            disabled={saving || pending || failed || missing.length > 0}
            onClick={async () => {
              if (saving) return;
              setSaving(true);
              setError("");
              const submitted = fingerprint;
              try {
                if (request.current?.fingerprint !== fingerprint)
                  request.current = { fingerprint, id: crypto.randomUUID() };
                const result = await createVisitorSelection({
                  data: { ids: [...ids], requestId: request.current.id },
                });
                if (result.ok)
                  setSaved({
                    url: new URL(`/site/selecao/${result.token}`, window.location.origin).href,
                    expiresAt: result.expiresAt,
                    fingerprint: submitted,
                  });
                else {
                  if (result.error === "expired" || result.error === "request_reused")
                    request.current = null;
                  setError(
                    result.error === "rate_limited"
                      ? "Muitos links foram solicitados agora. Aguarde um minuto e tente novamente."
                      : result.error === "unavailable"
                        ? "Não foi possível gerar o link agora. Sua seleção continua salva neste navegador. Atualize a disponibilidade e tente novamente."
                        : "A seleção mudou ou o pedido expirou. Atualize a disponibilidade e gere um novo link.",
                  );
                }
              } catch {
                setError(
                  "Não foi possível gerar o link. Sua seleção foi preservada; tente novamente.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <Share2 size={18} /> {saving ? "Gerando link…" : "Gerar link da seleção"}
          </button>
          {error && <p role="alert">{error}</p>}
          {saved && saved.fingerprint === fingerprint && (
            <>
              <SelectionShare url={saved.url} />
              <p>
                Válido até{" "}
                {new Date(saved.expiresAt).toLocaleDateString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
                .
              </p>
            </>
          )}
          {saved && saved.fingerprint !== fingerprint && (
            <p role="status">
              A seleção foi alterada. Gere um novo link para compartilhar as escolhas atuais. O link
              anterior mantém seu conjunto original.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export function SharedVisitorSelectionPage({
  selection,
  retry,
}: {
  selection: VisitorPublicSelection;
  retry: () => void;
}) {
  return (
    <div className="cs-container cs-content-page">
      <PageIntro
        eyebrow="Escolhas para um próximo passo"
        title="Seleção de imóveis Cordial."
        description="Uma seleção compartilhada. A disponibilidade é atualizada quando você abre este link."
      />
      {selection.state === "ok" ? (
        <>
          <p>
            Válida até{" "}
            {new Date(selection.expiresAt).toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
            . Este link permite apenas consultar a seleção.
          </p>
          <div className="cs-property-grid">
            {selection.items.map((item) =>
              item.available ? (
                <PropertyCard key={item.key} property={item.property} />
              ) : (
                <div key={item.key} className="cs-inline-state">
                  <h2>Imóvel {item.key} indisponível</h2>
                  <p>
                    Este imóvel foi retirado do catálogo. Nenhuma outra opção foi colocada em seu
                    lugar.
                  </p>
                </div>
              ),
            )}
          </div>
        </>
      ) : (
        <div className="cs-inline-state" role="status">
          <h2>
            {selection.state === "expired"
              ? "Este link expirou."
              : selection.state === "invalid"
                ? "Seleção não encontrada."
                : "A seleção não pôde ser consultada agora."}
          </h2>
          <p>
            {selection.state === "rate_limited"
              ? "Aguarde um minuto antes de tentar novamente."
              : selection.state === "expired"
                ? "Peça um novo link a quem compartilhou a seleção."
                : "Confira o link recebido ou continue explorando o catálogo."}
          </p>
          {(selection.state === "unavailable" || selection.state === "rate_limited") && (
            <button type="button" className="cs-button" onClick={retry}>
              Tentar novamente
            </button>
          )}
        </div>
      )}
      <SiteLink className="cs-text-link" to="/site/buscar">
        Explorar o catálogo <ArrowRight size={18} />
      </SiteLink>
    </div>
  );
}
