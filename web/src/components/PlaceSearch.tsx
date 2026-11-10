import { useEffect, useId, useRef, useState } from "react";
import { callFunction, messageFor } from "../lib/api";
import { strings } from "../strings";
import { Spinner } from "./ui";

/**
 * Address type-ahead.
 *
 * The Google key never reaches this component — it calls our own
 * places-autocomplete, which calls Google (CLAUDE.md rule 3).
 *
 * Two things it must get right:
 *
 *   A session token, generated per search and discarded on selection. Google
 *   bills autocomplete per-request without one and per-session with one, so
 *   this is a real cost difference rather than a micro-optimisation.
 *
 *   The placeId, not the typed string. The string is what the supervisor
 *   typed; the placeId is what they meant, and coordinates come from it.
 */

export interface Place {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface Suggestion {
  place_id: string;
  primary_text: string;
  secondary_text: string;
}

export function PlaceSearch({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: Place | null;
  onSelect: (place: Place | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const sessionToken = useRef(crypto.randomUUID());
  const listId = useId();
  const inputId = useId();

  useEffect(() => {
    if (!query || query.trim().length < 2 || value?.name === query) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    // ~300ms: fast enough to feel live, slow enough not to bill every keystroke.
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await callFunction<{ suggestions: Suggestion[] }>("places-autocomplete", {
          body: { action: "suggest", query, session_token: sessionToken.current },
          signal: controller.signal,
        });
        setSuggestions(res.suggestions);
        setOpen(true);
        setActive(-1);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(messageFor(err));
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, value?.name]);

  async function choose(s: Suggestion) {
    setOpen(false);
    setQuery(s.primary_text);
    setLoading(true);
    setError(null);
    try {
      // Autocomplete gives no coordinates, so a details call is what makes the
      // selection usable. The session token ends here.
      const res = await callFunction<{ place: Place }>("places-autocomplete", {
        body: { action: "details", place_id: s.place_id, session_token: sessionToken.current },
      });
      sessionToken.current = crypto.randomUUID();
      onSelect({ ...res.place, name: res.place.name || s.primary_text });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      // Selects the highlighted suggestion; must not submit the form.
      e.preventDefault();
      if (active >= 0) void choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={strings.plan.searchPlaceholder}
          className="min-h-11 w-full rounded-[var(--radius-token)] border border-edge bg-secondary px-3 pr-10 text-text placeholder:text-muted-text focus:border-brand-2 focus:outline-none"
          value={value && value.name === query ? value.name : query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onSelect(null);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-text">
            <Spinner />
          </span>
        )}
      </div>

      {value && (
        <p className="truncate text-xs text-muted-text" title={value.address}>{value.address}</p>
      )}
      {error && <p className="text-xs text-gold">{error}</p>}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius-token)] border border-edge bg-card shadow-lg"
        >
          {suggestions.length === 0 && !loading ? (
            <li className="px-3 py-2 text-sm text-muted-text">{strings.plan.noMatches}</li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={s.place_id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-secondary" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void choose(s)}
              >
                <span className="block truncate">{s.primary_text}</span>
                <span className="block truncate text-xs text-muted-text">{s.secondary_text}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
