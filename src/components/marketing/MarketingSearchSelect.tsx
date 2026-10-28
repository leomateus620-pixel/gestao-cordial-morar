import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MarketingSelectOption = { value: string; label: string; description?: string };

/** Search keeps complete labels visible while the trigger remains compact. IDs stay canonical. */
export function MarketingSearchSelect({
  label,
  value,
  onValueChange,
  options,
  placeholder = "Selecionar",
  className,
  disabled,
  allowNumericValue = false,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: MarketingSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowNumericValue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const customId = allowNumericValue && /^\d{1,80}$/.test(search.trim()) ? search.trim() : "";
  const select = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={`${label}: ${selected?.label ?? (value || placeholder)}`}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          title={selected?.label ?? (value || placeholder)}
          disabled={disabled}
          className={cn(
            "h-11 min-w-0 justify-between gap-3 rounded-xl bg-card px-3 text-sm font-normal sm:h-10",
            className,
          )}
        >
          <span className="min-w-0 truncate">{selected?.label ?? (value || placeholder)}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-foreground/60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] min-w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))] p-0"
      >
        <Command>
          <CommandInput
            aria-label={`Pesquisar ${label.toLocaleLowerCase("pt-BR")}`}
            placeholder={`Pesquisar ${label.toLocaleLowerCase("pt-BR")}…`}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList id={listId} className="max-h-64">
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.value} ${option.label} ${option.description ?? ""}`}
                  onSelect={() => select(option.value)}
                  className="min-h-11 items-start py-2.5"
                >
                  <Check
                    className={cn("mt-0.5 size-4 shrink-0", value !== option.value && "opacity-0")}
                  />
                  <span className="min-w-0 whitespace-normal break-words">
                    {option.label}
                    {option.description && (
                      <span className="mt-0.5 block text-xs text-foreground/65">
                        {option.description}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
              {customId && !options.some((option) => option.value === customId) && (
                <CommandItem
                  value={customId}
                  onSelect={() => select(customId)}
                  className="min-h-11"
                >
                  Filtrar formulário {customId}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
