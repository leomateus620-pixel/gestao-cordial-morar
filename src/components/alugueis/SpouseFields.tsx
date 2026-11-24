import {
  spousePending,
  SPOUSE_ROLE_LABEL,
  type GuarantorSpouse,
  type SpouseRole,
} from "@/lib/rentals/guarantor-spouse";

const inputCls =
  "w-full rounded-xl border border-border/70 bg-background px-3.5 py-2.5 text-sm font-medium text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25";

/** Cônjuge que assina junto com ESTE fiador (preso ao card do fiador). */
export function SpouseFields({
  value,
  onChange,
  fieldPrefix,
}: {
  value: GuarantorSpouse;
  onChange: (v: GuarantorSpouse) => void;
  fieldPrefix?: string;
}) {
  const set = (patch: Partial<GuarantorSpouse>) => onChange({ ...value, ...patch });
  const pending = spousePending(value);
  const field = (
    label: string,
    key: "nome" | "cpf" | "rg" | "profissao" | "telefone",
    wide = false,
  ) => (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/75">
        {label}
      </span>
      <input
        data-rental-field={
          fieldPrefix
            ? `${fieldPrefix}-${{ nome: "name", cpf: "cpf", rg: "rg", profissao: "profession", telefone: "phone" }[key]}`
            : undefined
        }
        value={value[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        inputMode={key === "cpf" || key === "telefone" ? "numeric" : undefined}
        className={`mt-1.5 ${inputCls}`}
      />
    </label>
  );
  return (
    <div className="sm:col-span-2 rounded-xl border border-border/60 bg-muted/30 p-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className="size-4 accent-primary"
        />
        Incluir esposa/cônjuge na assinatura
      </label>
      {value.enabled && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex gap-2" role="radiogroup" aria-label="Papel do cônjuge">
            {(Object.keys(SPOUSE_ROLE_LABEL) as SpouseRole[]).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={value.papel === r}
                onClick={() => set({ papel: r })}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${value.papel === r ? "bg-primary text-primary-foreground ring-primary" : "ring-border text-foreground/70"}`}
              >
                {SPOUSE_ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          {field("Nome completo", "nome", true)}
          {field("CPF", "cpf")}
          {field("RG", "rg")}
          {field("Profissão", "profissao")}
          {field("Telefone", "telefone")}
          {pending.length > 0 && (
            <p className="sm:col-span-2 text-xs font-medium text-destructive">
              Falta: {pending.join(", ")}. O rascunho pode ser salvo, mas o contrato só é gerado
              completo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
