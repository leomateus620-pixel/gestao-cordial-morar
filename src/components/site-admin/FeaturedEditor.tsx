import type { Dispatch, SetStateAction } from "react";
import type { SiteSettings } from "@/lib/cordial-site/contract";

const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
export type PropertyOption = {
  public_id: string;
  public_reference: string | null;
  tipo: string | null;
  cidade: string | null;
  bairro: string | null;
};

/** Escolha manual e ordem dos cinco destaques — mesma regra nas duas marcas. */
export function FeaturedEditor({
  values,
  setValues,
  options,
}: {
  values: SiteSettings;
  setValues: Dispatch<SetStateAction<SiteSettings>>;
  options: PropertyOption[];
}) {
  return (
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Destaques editoriais da home</legend>
        <label className="grid gap-1 text-sm">
          Como escolher os cinco destaques
          <select
            className={input}
            value={values.featuredMode}
            onChange={(e) =>
              setValues((v) => ({ ...v, featuredMode: e.target.value as "recentes" | "editorial" }))
            }
          >
            <option value="recentes">Mais recentes com foto (padrão)</option>
            <option value="editorial">Escolha manual, até cinco em ordem</option>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          A home mostra cinco destaques, sempre com foto de capa. Na escolha manual, imóveis
          retirados ou sem foto são trocados pelos mais recentes com foto.
        </p>
        {values.featuredPropertyIds.length > 5 && (
          <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
            Há {values.featuredPropertyIds.length} imóveis escolhidos. Só os cinco primeiros aparecem
            na home; os itens {6}–{values.featuredPropertyIds.length} ficam de fora. Remova os
            excedentes para salvar uma lista de cinco.
          </p>
        )}
        <label className="grid gap-1 text-sm">
          Adicionar imóvel publicado
          <select
            className={input}
            value=""
            disabled={values.featuredPropertyIds.length >= 5}
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
  );
}
