import { useState } from "react";
import { Check, ListPlus } from "lucide-react";
import { visitorSelection, useVisitorSelection } from "@/lib/selecoes/visitor-store";
import { VISITOR_SELECTION_LIMIT } from "@/lib/selecoes/visitor-rules";
import { trackSiteEvent } from "@/lib/cordial-site/experience";
import "./visitor-selection.css";

export function VisitorSelectionButton({ id }: { id: string }) {
  const { ids } = useVisitorSelection();
  const active = ids.includes(id);
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        type="button"
        className="cs-selection-button"
        aria-pressed={active}
        aria-label={active ? "Remover da minha seleção" : "Adicionar à minha seleção"}
        onClick={() => {
          const changed = visitorSelection.toggle(id);
          if (changed)
            trackSiteEvent("selection_changed", {
              propertyId: id,
              active: !active,
              count: visitorSelection.get().length,
              source: "card",
            });
          setMessage(
            changed
              ? active
                ? "Imóvel removido da seleção."
                : "Imóvel adicionado à seleção."
              : `A seleção aceita até ${VISITOR_SELECTION_LIMIT} imóveis.`,
          );
        }}
      >
        {active ? <Check size={17} /> : <ListPlus size={17} />}{" "}
        {active ? "Selecionado" : "Selecionar"}
      </button>
      <span className="cs-sr-only" role="status">
        {message}
      </span>
    </>
  );
}
