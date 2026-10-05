import { retentionFields, type FiscalProfileDraft } from "./nfse-profile-form";
const inputClass =
  "min-h-11 w-full rounded-lg border border-foreground/20 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:bg-foreground/5";
export function NfseFiscalProfileEditor({
  draft,
  onChange,
  disabled,
}: {
  draft: FiscalProfileDraft;
  onChange: (draft: FiscalProfileDraft) => void;
  disabled: boolean;
}) {
  const set = (key: string, value: string) => onChange({ ...draft, [key]: value });
  const select = (key: string, label: string, choices: readonly (readonly [string, string])[]) => (
    <label key={key} className="block space-y-1.5 text-sm font-semibold">
      {label}
      <select
        value={draft[key] ?? ""}
        onChange={(event) => set(key, event.target.value)}
        disabled={disabled}
        className={inputClass}
      >
        <option value="">Selecione conforme aprovação</option>
        {choices.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const field = (key: string, label: string, decimal = false) => (
    <label key={key} className="block space-y-1.5 text-sm font-semibold">
      {label}
      <input
        value={draft[key] ?? ""}
        inputMode={decimal ? "decimal" : "text"}
        onChange={(event) => set(key, event.target.value)}
        disabled={disabled}
        className={inputClass}
      />
    </label>
  );
  return (
    <fieldset disabled={disabled} className="mt-6 border-t border-foreground/15 pt-5">
      <legend className="px-1 text-base font-bold">Perfil fiscal da operação</legend>
      <p className="mb-4 text-sm leading-6 text-foreground/75">
        Registre somente o enquadramento aprovado pela contabilidade para esta empresa. Não há um
        perfil presumido. Informar credenciais ou códigos não autoriza emissão real.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {select("operation", "Operação faturada", [
          ["administracao", "Administração de imóveis"],
          ["intermediacao", "Intermediação imobiliária"],
        ])}
        {select("tomadorPapel", "Quem recebe o serviço", [
          ["proprietario", "Proprietário"],
          ["locatario", "Locatário"],
          ["outro", "Outro tomador aprovado"],
        ])}
        {select("valorOrigem", "Origem do valor", [
          ["comissao_mensal", "Comissão da referência registrada"],
          ["valor_revisado", "Valor revisado com origem documentada"],
        ])}
        {select("elegibilidade", "Quando o serviço pode ser faturado", [
          ["pagamento", "Pagamento registrado"],
          ["competencia", "Competência do serviço"],
          ["revisao_manual", "Revisão fiscal manual"],
        ])}
        {field("regime", "Regime tributário aprovado")}
        {field("localPrestacao", "Município da prestação (código TOM)")}
        {select("layout", "Layout municipal aprovado", [
          ["35/2021", "35/2021"],
          ["122/2025", "122/2025"],
        ])}
        {select("ibsCbs", "Grupo IBS/CBS aplicável", [
          ["false", "Não se aplica, conforme enquadramento"],
          ["true", "Aplicável a esta operação"],
        ])}
        <label className="space-y-1.5 text-sm font-semibold sm:col-span-2">
          Descrição do serviço aprovado
          <textarea
            rows={3}
            value={draft.descricao ?? ""}
            onChange={(event) => set("descricao", event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <p className="mb-3 mt-5 text-sm font-semibold">
        Retenções aprovadas (%) — informe zero quando não houver retenção
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {retentionFields.map(([key, label]) => field(`retencao_${key}`, label, true))}
      </div>
      {draft.ibsCbs === "true" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {field("finNFSe", "Finalidade (finNFSe)")}
          {select("indFinal", "Consumidor final (indFinal)", [
            ["0", "0 — conforme enquadramento"],
            ["1", "1 — conforme enquadramento"],
          ])}
          {field("tpOper", "Tipo de operação (tpOper)")}
        </div>
      )}
      <label className="mt-5 block space-y-1.5 text-sm font-semibold">
        Referência da aprovação contábil
        <textarea
          rows={3}
          value={draft.approvalReference ?? ""}
          onChange={(event) => set("approvalReference", event.target.value)}
          className={inputClass}
          placeholder="Responsável, data e documento que aprovaram este enquadramento (mínimo 15 caracteres)."
        />
      </label>
      <label className="mt-4 block space-y-1.5 text-sm font-semibold">
        Autorização para produção, após homologação
        <textarea
          rows={3}
          value={draft.productionAuthorization ?? ""}
          onChange={(event) => set("productionAuthorization", event.target.value)}
          className={inputClass}
          placeholder="Preencher somente após autorização expressa para esta empresa e operação."
        />
      </label>
      <p className="mt-4 text-sm leading-6 text-foreground/75">
        O fato gerador exige revisão explícita. O fluxo permanece assistido. A automação em produção
        depende de autorização com empresa, operação, elegibilidade e limites, além de um executor
        durável compatível.
      </p>
    </fieldset>
  );
}
