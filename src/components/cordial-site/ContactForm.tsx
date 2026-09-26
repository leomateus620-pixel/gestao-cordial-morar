import { useEffect, useId, useState } from "react";
import {
  readContactDraft,
  saveContactDraft,
  clearContactDraft,
} from "@/lib/cordial-site/contact-draft";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { leadSchema, type PublicProperty, type SiteLead } from "@/lib/cordial-site/contract";
import { sitePath } from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { useSite } from "@/lib/cordial-site/context";
export function ContactForm({
  kind = "contato",
  property,
}: {
  kind?: SiteLead["kind"];
  property?: PublicProperty;
}) {
  const { settings } = useSite();
  const id = useId();
  const draftKey = `${kind}:${property?.id ?? "general"}`;
  const [requestId, setRequestId] = useState(
    () => readContactDraft(draftKey)?.requestId ?? crypto.randomUUID(),
  );
  const [values, setValues] = useState(
    () =>
      readContactDraft(draftKey)?.values ?? {
        name: "",
        phone: "",
        email: "",
        message: property
          ? `Olá! Tenho interesse no imóvel ${property.reference}. Gostaria de receber mais informações.`
          : "",
        operation: "",
        propertyType: "",
        city: "",
        website: "",
        consent: false,
      },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) saveContactDraft(draftKey, { requestId, values });
  }, [draftKey, requestId, values, done]);
  const [failure, setFailure] = useState("");
  const field = (
    key: "name" | "phone" | "email" | "city" | "propertyType",
    label: string,
    type = "text",
    required = true,
  ) => (
    <label className="cs-field" htmlFor={`${id}-${key}`}>
      <span>
        {label}
        {!required ? " (opcional)" : ""}
      </span>
      <input
        id={`${id}-${key}`}
        type={type}
        required={required}
        autoComplete={
          key === "name" ? "name" : key === "phone" ? "tel" : key === "email" ? "email" : undefined
        }
        maxLength={key === "email" ? 200 : 120}
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
      />
      {errors[key] && (
        <small className="cs-field-error" id={`${id}-${key}-error`}>
          {errors[key]}
        </small>
      )}
    </label>
  );
  if (done)
    return (
      <div className="cs-contact-success" role="status">
        <CheckCircle2 size={35} />
        <h3>Mensagem recebida.</h3>
        <p>
          A equipe Cordial dará continuidade ao seu contato. Se você pediu uma visita, o horário
          ainda será combinado.
        </p>
        <button
          className="cs-button cs-button-light"
          onClick={() => {
            setDone(false);
            setRequestId(crypto.randomUUID());
            setValues((v) => ({ ...v, message: "" }));
          }}
        >
          Voltar ao formulário
        </button>
      </div>
    );
  return (
    <form
      className="cs-contact-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        setFailure("");
        const url = new URL(location.href);
        const campaign = Object.fromEntries(
          ["utm_source", "utm_medium", "utm_campaign"].flatMap((k) =>
            url.searchParams.has(k) ? [[k, url.searchParams.get(k)!]] : [],
          ),
        );
        const input = {
          ...values,
          requestId,
          kind,
          propertyId: property?.id,
          operation: property?.operation || values.operation || undefined,
          entryPath: location.pathname,
          campaign,
        };
        const parsed = leadSchema.safeParse(input);
        if (!parsed.success) {
          setErrors(
            Object.fromEntries(parsed.error.issues.map((x) => [x.path[0], "Confira este campo."])),
          );
          return;
        }
        setErrors({});
        setPending(true);
        try {
          const response = await fetch("/api/cordial-site/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
            credentials: "same-origin",
            signal: AbortSignal.timeout(20000),
          });
          const result = await response.json();
          if (!response.ok || result.ok !== true)
            throw new Error(result.error || "Não foi possível enviar.");
          clearContactDraft(draftKey);
          setDone(true);
        } catch (error) {
          setFailure(
            error instanceof Error && error.name !== "TimeoutError"
              ? error.message
              : "O envio não foi confirmado. Seus dados foram preservados; você pode tentar novamente.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="cs-contact-fields">
        {field("name", "Seu nome")}
        {field("phone", "Telefone / WhatsApp", "tel")}
        {field("email", "E-mail", "email", false)}
        {kind === "captacao" && (
          <>
            <label className="cs-field">
              <span>O que você pretende?</span>
              <select
                required
                value={values.operation}
                onChange={(e) => setValues((v) => ({ ...v, operation: e.target.value }))}
              >
                <option value="">Selecione</option>
                <option value="venda">Vender meu imóvel</option>
                <option value="aluguel">Alugar meu imóvel</option>
              </select>
            </label>
            {field("propertyType", "Tipo de imóvel")}
            {field("city", "Cidade do imóvel")}
          </>
        )}
        <label className="cs-field cs-span-full" htmlFor={`${id}-message`}>
          <span>
            {kind === "captacao" ? "Conte um pouco sobre o imóvel" : "Como podemos ajudar?"}
          </span>
          <textarea
            id={`${id}-message`}
            required
            minLength={10}
            maxLength={3000}
            rows={4}
            value={values.message}
            onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? `${id}-message-error` : undefined}
          />
          {errors.message && (
            <small id={`${id}-message-error`} className="cs-field-error">
              Escreva uma mensagem entre 10 e 3.000 caracteres.
            </small>
          )}
        </label>
      </div>
      <div className="cs-honeypot" aria-hidden="true">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(e) => setValues((v) => ({ ...v, website: e.target.value }))}
          />
        </label>
      </div>
      <label className="cs-consent">
        <input
          type="checkbox"
          required
          checked={values.consent}
          onChange={(e) => setValues((v) => ({ ...v, consent: e.target.checked }))}
        />
        <span>
          Autorizo o uso dos meus dados para responder a este contato, conforme a{" "}
          <SiteLink to={sitePath("/privacidade")}>Política de Privacidade</SiteLink>.
        </span>
      </label>
      {failure && (
        <p className="cs-form-error" role="alert">
          {failure}
        </p>
      )}
      {!settings.privacy && (
        <p className="cs-form-error">
          O formulário está temporariamente indisponível. Use os canais de contato disponíveis nesta
          página.
        </p>
      )}
      <button className="cs-button" type="submit" disabled={pending || !settings.privacy}>
        {pending ? "Enviando…" : "Enviar mensagem"}
        <ArrowUpRight size={18} />
      </button>
      <p className="cs-form-note">Seus dados são encaminhados à equipe Cordial.</p>
    </form>
  );
}
