import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, X } from "lucide-react";
import type { SiteFacets } from "@/lib/cordial-site/contract";
import {
  filterLocations,
  locationLabel,
  morarLocations,
  type LocationOption,
} from "@/lib/cordial-site/morar-search";
import { MorarIcon } from "./MorarIcon";

export function MorarLocationCombobox({
  id,
  facets,
  city,
  district,
  error,
  resetKey,
  onChange,
  onPendingChange,
}: {
  id: string;
  facets: SiteFacets;
  city: string;
  district: string;
  error?: string;
  resetKey: number;
  onChange: (city: string, district: string) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [text, setText] = useState(() => locationLabel(city, district));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const allOptions = useMemo(() => morarLocations(facets), [facets]);
  const selectedLabel = locationLabel(city, district);
  // A selected location opens the catalog again; typing immediately searches the official labels.
  const options = filterLocations(allOptions, text === selectedLabel ? "" : text);
  useEffect(() => {
    // Clearing applied coordinates while typing must not erase the text being edited.
    if (city || district) setText(locationLabel(city, district));
  }, [city, district]);
  useEffect(() => {
    if (resetKey) {
      setText("");
      setOpen(false);
      setActiveIndex(-1);
    }
  }, [resetKey]);
  const choose = (option: LocationOption) => {
    onChange(option.city, option.district);
    onPendingChange(false);
    setText(option.label);
    setOpen(false);
    setActiveIndex(-1);
  };
  useEffect(() => {
    if (open && activeIndex >= 0)
      document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, id]);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className="ms-location-input">
          <input
            ref={input}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-label="Cidade ou bairro"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? `${id}-options` : undefined}
            aria-activedescendant={
              open && options[activeIndex] ? `${id}-option-${activeIndex}` : undefined
            }
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            placeholder="Cidade ou bairro"
            value={text}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(event) => {
              const next = event.target.value;
              setText(next);
              onChange("", "");
              onPendingChange(!!next.trim());
              setActiveIndex(0);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => {
                  if (!options.length) return -1;
                  if (current < 0) return event.key === "ArrowDown" ? 0 : options.length - 1;
                  return (
                    (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
                    options.length
                  );
                });
              } else if (event.key === "Enter" && open) {
                event.preventDefault();
                event.stopPropagation();
                if (!event.nativeEvent.isComposing && options[activeIndex])
                  choose(options[activeIndex]);
              } else if (event.key === "Escape" && open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              } else if (event.key === "Tab") setOpen(false);
            }}
          />
          {text ? (
            <button
              type="button"
              className="ms-location-clear"
              aria-label="Limpar localização"
              onClick={() => {
                setText("");
                onChange("", "");
                onPendingChange(false);
                setActiveIndex(-1);
                input.current?.focus();
              }}
            >
              <MorarIcon icon={X} />
            </button>
          ) : (
            <span className="ms-location-chevron">
              <MorarIcon icon={ChevronDown} />
            </span>
          )}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="cordial-site morar-site ms-location-options"
          id={`${id}-options`}
          role="listbox"
          aria-label="Cidades e bairros da Morar"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (
              event.target instanceof Node &&
              input.current?.parentElement?.contains(event.target)
            )
              event.preventDefault();
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.key}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={city === option.city && district === option.district}
              data-highlighted={index === activeIndex || undefined}
              onPointerDown={(event) => {
                if (event.pointerType === "mouse") event.preventDefault();
              }}
              onClick={() => choose(option)}
            >
              {option.label}
            </div>
          ))}
          {!options.length && <p role="status">Nenhuma cidade ou bairro encontrado.</p>}
        </Popover.Content>
      </Popover.Portal>
      {error && (
        <small id={`${id}-error`} className="cs-field-error">
          {error}
        </small>
      )}
    </Popover.Root>
  );
}
