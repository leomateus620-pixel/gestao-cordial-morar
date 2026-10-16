import type { AssistantChoice } from "@/lib/agent/stream";
import { useState } from "react";

export function ChoiceQuestion({
  choice,
  disabled,
  onChoose,
  onOther,
}: {
  choice: AssistantChoice;
  disabled?: boolean;
  onChoose(option: AssistantChoice["options"][number]): void;
  onOther(): void;
}) {
  const [selected, setSelected] = useState<string>();
  return (
    <fieldset
      className="my-4 rounded-2xl border border-border p-4"
      disabled={disabled || !!selected}
    >
      <legend className="px-1 text-sm font-semibold">{choice.question}</legend>
      <div className="flex flex-wrap gap-2">
        {choice.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`assistant-chip ${selected === option.id ? "!border-primary !bg-primary/8" : ""}`}
            aria-pressed={selected === option.id}
            onClick={() => {
              setSelected(option.id);
              onChoose(option);
            }}
          >
            {option.label}
          </button>
        ))}
        {choice.allowOther && (
          <button type="button" className="assistant-chip text-muted-foreground" onClick={onOther}>
            Outro…
          </button>
        )}
      </div>
    </fieldset>
  );
}
