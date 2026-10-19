import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import {
  adminSiteSnapshot,
  reviewSiteProperty,
  saveSiteContent,
  triageSiteLead,
  saveSiteResponsible,
  prepareSitePropertyMedia,
  manageSiteVideo,
  saveSiteTour,
} from "@/lib/cordial-site/admin.functions";
import type { SiteSettings } from "@/lib/cordial-site/contract";

export const Route = createFileRoute("/_app/site-administracao")({
  head: () => ({
    meta: [
      { title: "Site público — Gestão Cordial" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="configuracoes">
      <Page />
    </RequireModuleAccess>
  ),
});
const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button =
  "rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
type Snapshot = Awaited<ReturnType<typeof adminSiteSnapshot>>;
function Page() {
  const session = useSession();
  const load = useServerFn(adminSiteSnapshot);
  const qc = useQueryClient();
  const [tab, setTab] = useState("publicacoes");
  const [page, setPage] = useState(0);
  const [reference, setReference] = useState("");
  const query = useQuery({
    queryKey: ["cordial-site-admin", page, reference],
    queryFn: () => load({ data: { page, reference } }),
    enabled: isAdminUser(session),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["cordial-site-admin"] });
  if (!isAdminUser(session)) return <p>Acesso restrito à administração da Cordial.</p>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Site público Cordial</h1>
          <p className="text-sm text-muted-foreground">
            Publicação própria, conteúdo e contatos recebidos.
          </p>
        </div>
        <Link to="/site" className={button}>
          Abrir homologação
        </Link>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Seções do site">
        {[
          ["publicacoes", "Publicação de imóveis"],
          ["configuracoes", "Identidade e contatos"],
          ["responsaveis", "Responsáveis públicos"],
          ["conteudo", "Páginas e notícias"],
          ["contatos", "Contatos recebidos"],
          ["historico", "Histórico"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={tab === value ? button : "rounded-lg border px-4 py-2 text-sm"}
          >
            {label}
          </button>
        ))}
      </div>
      {query.isPending ? (
        <p role="status">Carregando…</p>
      ) : query.error ? (
        <div role="alert" className="rounded-lg border p-6">
          <p>{query.error.message}</p>
          <button className={button} onClick={() => void query.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        query.data && (
          <>
            {tab === "publicacoes" && (
              <>
                <div className="rounded-lg border bg-card p-4 text-sm">
                  A publicação exige revisão explícita para a Cordial. Campos de autorização nulos e
                  vínculos com outros fornecedores não publicam imóveis automaticamente. Confira o
                  cadastro, a descrição e todas as fotos antes de autorizar.
                </div>
                <label className="block max-w-sm text-sm">
                  Referência Cordial
                  <input
                    className={input}
                    value={reference}
                    onChange={(e) => {
                      setReference(e.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <p>
                  {query.data.total} imóveis internos · página {page + 1}
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  {query.data.properties.map((p) => (
                    <Publication key={p.id} property={p} onSaved={refresh} />
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    className={button}
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    className={button}
                    disabled={(page + 1) * 24 >= query.data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </>
            )}
            {tab === "configuracoes" && (
              <SettingsForm
                current={query.data.settings}
                options={query.data.featuredOptions}
                onSaved={refresh}
              />
            )}
            {tab === "responsaveis" && (
              <ResponsibleEditor snapshot={query.data} onSaved={refresh} />
            )}
            {tab === "conteudo" && <ContentEditor pages={query.data.pages} onSaved={refresh} />}
            {tab === "contatos" && (
              <div className="space-y-4">
                <p className="text-sm">
                  Últimos 100 contatos. Confirme finalidade e tipo antes de encaminhar ao módulo de
                  atendimentos. A mensagem recebida não confirma visita nem atendimento concluído.
                </p>
                {query.data.leads.length ? (
                  query.data.leads.map((l) => <Lead key={l.id} lead={l} onSaved={refresh} />)
                ) : (
                  <p>Nenhum contato recebido.</p>
                )}
              </div>
            )}
            {tab === "historico" && (
              <div className="space-y-3">
                {query.data.audit.map((a) => (
                  <div key={a.id} className="rounded-lg border p-3 text-sm">
                    <time>{new Date(a.created_at).toLocaleString("pt-BR")}</time> · {a.entity} ·{" "}
                    {a.action}
                    <p className="text-xs text-muted-foreground">
                      Registro: {a.entity_id} · Responsável: {a.actor ?? "sistema"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
function Publication({
  property: p,
  onSaved,
}: {
  property: Snapshot["properties"][number];
  onSaved: () => Promise<unknown>;
}) {
  const review = useServerFn(reviewSiteProperty);
  const prepare = useServerFn(prepareSitePropertyMedia);
  const manageVideo = useServerFn(manageSiteVideo);
  const saveTour = useServerFn(saveSiteTour);
  const [selectedTour, setSelectedTour] = useState(p.tour?.media_id ?? "");
  const [declaredTour, setDeclaredTour] = useState(false);
  const [mediaMessage, setMediaMessage] = useState("");
  const [checks, setChecks] = useState({
    authorize: false,
    available: false,
    content: false,
    media: false,
    areas: false,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const save = async (publish: boolean) => {
    setPending(true);
    setError("");
    try {
      await review({ data: { propertyId: p.id, publish, ...checks } });
      await onSaved();
      setChecks({ authorize: false, available: false, content: false, media: false, areas: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">
          {p.codigo_cordial ? `Ref. ${p.codigo_cordial}` : "Sem código Cordial"} ·{" "}
          {p.tipo ?? "Tipo pendente"}
        </h2>
        <p className="text-sm">
          {p.cidade} · {p.bairro} · {p.operacao}
        </p>
        <p className="text-xs text-muted-foreground">
          Origem: {p.carteira} · Site próprio: {p.publication?.state ?? "Não autorizado"}
        </p>
      </div>
      <Link to="/imoveis/$imovelId" params={{ imovelId: p.id }} className="text-sm underline">
        Revisar cadastro e galeria no Gestão
      </Link>
      {p.autorizacao === false && (
        <p className="text-sm text-destructive">
          O cadastro possui autorização negada. A publicação está bloqueada.
        </p>
      )}
      <div className="space-y-2">
        {[
          ["authorize", "Autorização de publicação na Cordial confirmada"],
          ["available", "Disponibilidade comercial confirmada"],
          ["content", "Descrição, endereço e características revisados para exposição pública"],
          ["media", "Fotos revisadas: associação, ordem, capa, direitos e marca-d’água"],
          ["areas", "Áreas cadastradas conferidas em metros quadrados"],
        ].map(([k, label]) => (
          <label className="flex items-start gap-2 text-xs" key={k}>
            <input
              type="checkbox"
              checked={checks[k as keyof typeof checks]}
              onChange={(e) => setChecks((c) => ({ ...c, [k]: e.target.checked }))}
            />
            {label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Sem revisão de fotos ou áreas, esses dados permanecem ocultos. Alterar conteúdo ou mídia
        exige nova revisão.
      </p>
      <p className="text-xs text-muted-foreground">
        Endereço exato e mapa do imóvel ficam no Gestão. Revise também textos e fotos que possam
        revelar a localização.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={
            pending ||
            !checks.authorize ||
            !checks.available ||
            !checks.content ||
            p.autorizacao === false
          }
          onClick={() => void save(true)}
        >
          Autorizar e publicar
        </button>
        {p.publication && (
          <button
            className="rounded-lg border px-3 py-2 text-sm"
            disabled={pending}
            onClick={() => void save(false)}
          >
            Retirar do site
          </button>
        )}
        {p.publication?.state === "published" && (
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setMediaMessage("Preparando imagens fora da navegação pública…");
              try {
                const result = await prepare({ data: { publicId: p.publication!.public_id } });
                setMediaMessage(
                  `${result.prepared} tamanhos preparados para as duas primeiras fotos. O worker prepara as demais.`,
                );
              } catch {
                setMediaMessage(
                  "Não foi possível preparar. Confira a migração, o armazenamento privado e o worker.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            Preparar as 2 primeiras fotos
          </button>
        )}
      </div>
      {mediaMessage && (
        <p role="status" className="text-xs">
          {mediaMessage}
        </p>
      )}
      {(!!p.tourCandidates.length || p.tour) && (
        <fieldset className="space-y-3 border-t pt-3 text-sm">
          <legend className="font-semibold">Tour 360° equiretangular</legend>
          <p className="text-xs text-muted-foreground">
            Somente fotografia pública autorizada com dimensão 2:1. A proporção não prova que a
            imagem é um panorama: confira o formato, direitos e privacidade antes de declarar. O
            servidor também mede a imagem entregue.
          </p>
          <label className="grid gap-1">
            Panorama aprovado
            <select
              value={selectedTour}
              className={input}
              onChange={(e) => {
                setSelectedTour(e.target.value);
                setDeclaredTour(false);
              }}
            >
              <option value="">Selecione uma foto 2:1</option>
              {p.tourCandidates.map((m) => (
                <option key={m.id} value={m.id}>
                  Foto {m.position + 1} · {m.width}×{m.height}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={declaredTour}
              onChange={(e) => setDeclaredTour(e.target.checked)}
            />
            Confirmei que esta é uma captura panorâmica equiretangular 360°, com exposição pública
            aprovada.
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={pending || !selectedTour || !declaredTour}
              onClick={async () => {
                const current = p.tourCandidates.find((m) => m.id === selectedTour);
                if (!current) return;
                setPending(true);
                try {
                  await saveTour({
                    data: {
                      mediaId: current.id,
                      signature: current.version,
                      approve: true,
                      declared: declaredTour,
                    },
                  });
                  await onSaved();
                  setDeclaredTour(false);
                  setMediaMessage(
                    "Tour revisado e autorizado. A visualização carrega só por solicitação do visitante.",
                  );
                } catch {
                  setMediaMessage(
                    "Não foi possível publicar: confira formato 2:1, revisão e autorização atuais.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              Medir e publicar tour revisado
            </button>
            {p.tour?.approved && (
              <button
                type="button"
                className="rounded border px-3 py-2"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  try {
                    await saveTour({
                      data: {
                        mediaId: p.tour!.media_id,
                        signature: p.tour!.signature,
                        approve: false,
                        declared: false,
                      },
                    });
                    await onSaved();
                    setMediaMessage("Tour retirado da visualização pública.");
                  } catch {
                    setMediaMessage("Não foi possível retirar o tour. Tente novamente.");
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Retirar tour
              </button>
            )}
          </div>
        </fieldset>
      )}
      {!!p.videos.length && (
        <div className="space-y-3 border-t pt-3 text-sm">
          <h3 className="font-semibold">Vídeos do cadastro</h3>
          <p className="text-xs text-muted-foreground">
            Upload já disponível na etapa Arquivos do cadastro. Publicação exige MP4 H.264/AAC sem
            metadados, até 150 MB e 3 minutos, seguido de revisão. A solicitação entra na fila; ela
            depende de um processador real configurado. Fotos continuam disponíveis.
          </p>
          {p.videos.map((video) => (
            <div key={video.id} className="rounded-lg border p-3">
              <p>{video.file_name}</p>
              <p className="text-xs">
                {video.asset
                  ? ({
                      uploaded: "Aguardando processador",
                      processing: "Processando",
                      ready: video.asset.approved ? "Pronto e publicado" : "Pronto para revisão",
                      error: "Erro no processamento",
                    }[video.asset.state as "uploaded" | "processing" | "ready" | "error"] ??
                    video.asset.state)
                  : "Arquivo recebido; ainda não solicitado"}
              </p>
              {(!video.asset || video.asset.state === "error") && (
                <button
                  type="button"
                  className="mt-2 rounded border px-3 py-2"
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    try {
                      await manageVideo({ data: { action: "prepare", id: video.id } });
                      await onSaved();
                      setMediaMessage(
                        "Solicitação registrada. A publicação aguarda processamento real e revisão.",
                      );
                    } catch {
                      setMediaMessage(
                        "Confira se o upload está pronto, o formato e o limite de 150 MB.",
                      );
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  Solicitar preparação
                </button>
              )}
              {video.asset?.state === "ready" && (
                <button
                  type="button"
                  className="mt-2 rounded border px-3 py-2"
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    try {
                      await manageVideo({
                        data: {
                          action: "review",
                          id: video.asset!.id,
                          approve: !video.asset!.approved,
                        },
                      });
                      await onSaved();
                    } catch {
                      setMediaMessage("Revise o vídeo processado antes de autorizar a publicação.");
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  {video.asset.approved ? "Retirar vídeo" : "Vídeo revisado: autorizar publicação"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function ResponsibleEditor({
  snapshot,
  onSaved,
}: {
  snapshot: Snapshot;
  onSaved: () => Promise<unknown>;
}) {
  const save = useServerFn(saveSiteResponsible);
  const [profileId, setProfileId] = useState("");
  const [values, setValues] = useState({
    name: "",
    role: "Atendimento comercial",
    whatsapp: "",
    photoUrl: "",
    active: false,
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="grid max-w-3xl gap-4 rounded-xl border bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMessage("");
        try {
          await save({ data: { profileId, ...values, photoUrl: values.photoUrl || null } });
          await onSaved();
          setMessage(
            "Projeção comercial salva. Ela só é usada nos imóveis vinculados a essa pessoa e com perfil ativo na equipe.",
          );
        } catch {
          setMessage("Confira os campos e se a pessoa mantém um papel comercial ativo no Gestão.");
        } finally {
          setPending(false);
        }
      }}
    >
      <h2 className="font-semibold">Contato comercial publicado</h2>
      <p className="text-sm text-muted-foreground">
        O responsável é o corretor vinculado no cadastro do imóvel. A aprovação abaixo publica
        somente nome, função, foto e WhatsApp comerciais informados. Sem responsável publicado e
        ativo, o site usa o WhatsApp institucional configurado.
      </p>
      <label className="grid gap-1 text-sm">
        Pessoa da equipe
        <select
          required
          className={input}
          value={profileId}
          onChange={(e) => {
            const id = e.target.value;
            setProfileId(id);
            setMessage("");
            const current = snapshot.responsibles.find((r) => r.profile_id === id);
            setValues({
              name: current?.display_name ?? snapshot.profiles.find((p) => p.id === id)?.nome ?? "",
              role: current?.display_role ?? "Atendimento comercial",
              whatsapp: current?.whatsapp ?? "",
              photoUrl: current?.photo_url ?? "",
              active: current?.active ?? false,
            });
          }}
        >
          <option value="">Selecione a pessoa responsável</option>
          {snapshot.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ["name", "Nome público aprovado"],
          ["role", "Função pública"],
          ["whatsapp", "WhatsApp comercial com país e DDD (somente números)"],
          ["photoUrl", "URL HTTPS da foto aprovada (opcional)"],
        ] as const
      ).map(([key, label]) => (
        <label className="grid gap-1 text-sm" key={key}>
          {label}
          <input
            className={input}
            required={key !== "photoUrl"}
            value={values[key]}
            type={key === "photoUrl" ? "url" : "text"}
            maxLength={key === "photoUrl" ? 1000 : 100}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
      ))}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.active}
          onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
        />
        Dados comerciais conferidos e autorizados para publicação
      </label>
      <button className={button} disabled={pending || !profileId}>
        Salvar contato público
      </button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
function SettingsForm({
  current,
  options,
  onSaved,
}: {
  current: SiteSettings;
  options: Snapshot["featuredOptions"];
  onSaved: () => Promise<unknown>;
}) {
  const [values, setValues] = useState(current);
  const [priceDraft, setPriceDraft] = useState({
    venda: current.priceSteps.venda.join("\n"),
    aluguel: current.priceSteps.aluguel.join("\n"),
  });
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const save = useServerFn(saveSiteContent);
  return (
    <form
      className="grid max-w-4xl gap-5 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMessage("");
        try {
          const priceSteps = {
            venda: priceDraft.venda.split(/\s+/).filter(Boolean).map(Number),
            aluguel: priceDraft.aluguel.split(/\s+/).filter(Boolean).map(Number),
          };
          await save({ data: { kind: "settings", content: { ...values, priceSteps } } });
          await onSaved();
          setMessage("Configurações salvas.");
        } catch {
          setMessage("Confira os campos. As configurações não foram salvas.");
        } finally {
          setPending(false);
        }
      }}
    >
      {[
        ["brand", "Nome da marca"],
        ["tagline", "Assinatura"],
        ["phone", "Telefone"],
        ["whatsapp", "WhatsApp com país e DDD (somente números)"],
        ["email", "E-mail"],
        [
          "analyticsMeasurementId",
          "Google Analytics 4 — ID real G-… (opcional, exige consentimento)",
        ],
        ["address", "Endereço da empresa"],
        ["hours", "Horários"],
        ["creci", "CRECI"],
        ["instagram", "Instagram (URL https)"],
      ].map(([k, label]) => (
        <div key={k} className={k === "analyticsMeasurementId" ? "space-y-3 md:col-span-2" : ""}>
          <label className="block text-sm">
            {label}
            <input
              className={input}
              value={String(values[k as keyof SiteSettings])}
              onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
            />
          </label>
          {k === "analyticsMeasurementId" && (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values.analyticsManualEventsOnly}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, analyticsManualEventsOnly: e.target.checked }))
                  }
                />
                Confirmei no fluxo de dados do Google Analytics que a medição automática de páginas,
                mudanças de histórico, pesquisa interna e interações com formulários estão
                desativadas.
              </label>
              <p className="text-xs text-muted-foreground">
                O carregamento do Google Analytics exige esta confirmação e o consentimento do
                visitante. O site envia somente os eventos explícitos permitidos.
              </p>
            </>
          )}
        </div>
      ))}
      {[
        ["about", "Apresentação institucional"],
        ["privacy", "Política de privacidade aprovada"],
      ].map(([k, label]) => (
        <label key={k} className="text-sm md:col-span-2">
          {label}
          <textarea
            className={input}
            rows={6}
            value={String(values[k as keyof SiteSettings])}
            onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
          />
        </label>
      ))}
      <fieldset className="space-y-3 md:col-span-2">
        <legend className="text-sm font-semibold">Destaques editoriais da home</legend>
        <p className="text-xs text-muted-foreground">
          Escolha até nove imóveis públicos e ordene a apresentação. A lista vazia mantém os
          destaques já marcados no cadastro. Itens retirados não aparecem no site e não são
          substituídos automaticamente.
        </p>
        <label className="grid gap-1 text-sm">
          Adicionar imóvel publicado
          <select
            className={input}
            value=""
            disabled={values.featuredPropertyIds.length >= 9}
            onChange={(e) => {
              if (e.target.value)
                setValues((v) => ({
                  ...v,
                  featuredPropertyIds: [...v.featuredPropertyIds, e.target.value],
                }));
            }}
          >
            <option value="">Selecione uma referência disponível</option>
            {options
              .filter((p) => !values.featuredPropertyIds.includes(p.public_id))
              .map((p) => (
                <option value={p.public_id} key={p.public_id}>
                  REF. {p.public_reference} · {p.tipo} · {p.bairro} · {p.cidade}
                </option>
              ))}
          </select>
        </label>
        <ol className="space-y-2">
          {values.featuredPropertyIds.map((id, index) => {
            const selected = options.find((p) => p.public_id === id);
            const move = (offset: number) =>
              setValues((v) => {
                const ids = [...v.featuredPropertyIds];
                [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
                return { ...v, featuredPropertyIds: ids };
              });
            return (
              <li key={id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
                <span className="mr-auto">
                  {index + 1}.{" "}
                  {selected
                    ? `REF. ${selected.public_reference} · ${selected.tipo} · ${selected.bairro}`
                    : "Imóvel indisponível no canal público"}
                </span>
                <button
                  type="button"
                  className="rounded border px-3 py-2"
                  disabled={index === 0}
                  aria-label={`Subir destaque ${index + 1}`}
                  onClick={() => move(-1)}
                >
                  Subir
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-2"
                  disabled={index === values.featuredPropertyIds.length - 1}
                  aria-label={`Descer destaque ${index + 1}`}
                  onClick={() => move(1)}
                >
                  Descer
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-2"
                  aria-label={`Remover destaque ${index + 1}`}
                  onClick={() =>
                    setValues((v) => ({
                      ...v,
                      featuredPropertyIds: v.featuredPropertyIds.filter(
                        (current) => current !== id,
                      ),
                    }))
                  }
                >
                  Remover
                </button>
              </li>
            );
          })}
        </ol>
      </fieldset>
      <fieldset className="space-y-3 md:col-span-2">
        <legend className="text-sm font-semibold">Atalhos de valor na busca</legend>
        <p className="text-xs text-muted-foreground">
          Tetos em reais, um por linha, sem separador de milhar, em ordem crescente. Venda e aluguel
          usam valores próprios. O visitante também pode informar valores personalizados.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {(["venda", "aluguel"] as const).map((operation) => (
            <label key={operation} className="grid gap-1 text-sm">
              {operation === "venda" ? "Tetos de venda" : "Tetos de aluguel mensal"}
              <textarea
                className={input}
                rows={4}
                value={priceDraft[operation]}
                onChange={(e) => setPriceDraft((d) => ({ ...d, [operation]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-3 md:col-span-2">
        <legend className="text-sm font-semibold">Links de financiamento aprovados</legend>
        {values.links.map((link, i) => (
          <div className="flex flex-wrap gap-2" key={i}>
            <input
              aria-label={`Título do link ${i + 1}`}
              className={input}
              value={link.label}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  links: v.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                }))
              }
            />
            <input
              aria-label={`URL do link ${i + 1}`}
              className={input}
              type="url"
              value={link.url}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  links: v.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                }))
              }
            />
            <button
              type="button"
              onClick={() => setValues((v) => ({ ...v, links: v.links.filter((_, j) => j !== i) }))}
            >
              Remover link
            </button>
          </div>
        ))}
        <button
          type="button"
          className={button}
          disabled={values.links.length >= 12}
          onClick={() => setValues((v) => ({ ...v, links: [...v.links, { label: "", url: "" }] }))}
        >
          Adicionar link
        </button>
      </fieldset>
      <p role="status" className="text-sm md:col-span-2">
        {message}
      </p>
      <button className={button} disabled={pending}>
        Salvar configurações
      </button>
    </form>
  );
}
const blank = {
  slug: "",
  kind: "page" as "page" | "news" | "district",
  title: "",
  summary: "",
  body: "",
  published: false,
};
function ContentEditor({
  pages,
  onSaved,
}: {
  pages: Snapshot["pages"];
  onSaved: () => Promise<unknown>;
}) {
  const [values, setValues] = useState(blank);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const save = useServerFn(saveSiteContent);
  return (
    <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
      <aside className="space-y-2">
        <button className={button} onClick={() => setValues(blank)}>
          Novo conteúdo
        </button>
        {pages.map((p) => (
          <button
            className="block w-full rounded-lg border p-3 text-left text-sm"
            key={p.slug}
            onClick={() => setValues({ ...p, kind: p.kind as typeof blank.kind })}
          >
            {p.title} · {p.published ? "Publicado" : "Rascunho"}
          </button>
        ))}
      </aside>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setMessage("");
          try {
            await save({ data: { kind: "page", content: values } });
            await onSaved();
            setMessage("Conteúdo salvo.");
          } catch {
            setMessage("Não foi possível salvar. Confira os campos.");
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="block text-sm">
          Endereço curto (sobre, financiamento, correspondente ou novo título)
          <input
            required
            pattern="[a-z0-9-]{1,100}"
            className={input}
            value={values.slug}
            onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          Tipo
          <select
            className={input}
            value={values.kind}
            onChange={(e) =>
              setValues((v) => ({ ...v, kind: e.target.value as typeof blank.kind }))
            }
          >
            <option value="page">Página / serviço</option>
            <option value="news">Notícia</option>
            <option value="district">Conteúdo de bairro</option>
          </select>
        </label>
        {[
          ["title", "Título"],
          ["summary", "Resumo e descrição para buscas"],
        ].map(([k, label]) => (
          <label key={k} className="block text-sm">
            {label}
            <input
              required={k === "title"}
              className={input}
              value={String(values[k as keyof typeof blank])}
              onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
            />
          </label>
        ))}
        <label className="block text-sm">
          Conteúdo (texto, sem scripts ou HTML)
          <textarea
            rows={12}
            className={input}
            value={values.body}
            onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
          />
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.published}
            onChange={(e) => setValues((v) => ({ ...v, published: e.target.checked }))}
          />
          Publicar conteúdo
        </label>
        <p role="status" className="text-sm">
          {message}
        </p>
        <button className={button} disabled={pending}>
          Salvar conteúdo
        </button>
      </form>
    </div>
  );
}
function Lead({
  lead: l,
  onSaved,
}: {
  lead: Snapshot["leads"][number];
  onSaved: () => Promise<unknown>;
}) {
  const [operation, setOperation] = useState<"compra" | "aluguel" | "ambos">(
    l.operation === "aluguel" ? "aluguel" : "compra",
  );
  const [type, setType] = useState<
    "casa" | "apartamento" | "terreno" | "sala_comercial" | "area_rural" | "sitio_chacara" | "outro"
  >("outro");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const triage = useServerFn(triageSiteLead);
  return (
    <article className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">
        {l.name} · {l.kind} {l.public_reference ? `· Ref. ${l.public_reference}` : ""}
      </h2>
      <p className="text-sm">
        {l.phone} · {l.email} · {new Date(l.created_at).toLocaleString("pt-BR")}
      </p>
      <p className="whitespace-pre-wrap text-sm">{l.message}</p>
      <p className="text-xs text-muted-foreground">
        Entrada: {l.entry_path} · Tipo informado: {l.property_type ?? "Não informado"}
      </p>
      {l.attendance_id ? (
        <Link to="/atendimentos" className="text-sm underline">
          Encaminhado ao módulo de atendimentos
        </Link>
      ) : (
        <div className="flex flex-wrap gap-3">
          <label className="text-xs">
            Finalidade
            <select
              className={input}
              value={operation}
              onChange={(e) => setOperation(e.target.value as typeof operation)}
            >
              <option value="compra">Compra</option>
              <option value="aluguel">Aluguel</option>
              <option value="ambos">Ambos</option>
            </select>
          </label>
          <label className="text-xs">
            Tipo de interesse
            <select
              className={input}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {[
                ["casa", "Casa"],
                ["apartamento", "Apartamento"],
                ["terreno", "Terreno"],
                ["sala_comercial", "Sala comercial"],
                ["area_rural", "Área rural"],
                ["sitio_chacara", "Sítio / chácara"],
                ["outro", "Outro"],
              ].map(([v, text]) => (
                <option key={v} value={v}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <button
            className={button}
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await triage({ data: { id: l.id, operation, type } });
                await onSaved();
              } catch {
                setError("Não foi possível encaminhar. O contato continua preservado.");
              } finally {
                setPending(false);
              }
            }}
          >
            Confirmar e abrir atendimento
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}
