import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { guideFor } from "@/lib/guides";

const storageKey = (key: string) => `mobieer.guia.${key}`;

/** Na primeira visita, aberto no computador e recolhido no celular; depois, do jeito que a pessoa deixou. */
function readOpen(key: string): boolean {
  const wide = typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches;
  try {
    const saved = localStorage.getItem(storageKey(key));
    return saved ? saved === "aberto" : Boolean(wide);
  } catch {
    return Boolean(wide);
  }
}

/**
 * "Como usar esta tela": passo a passo curto e o que tem em cada aba, no topo
 * da tela. Os textos ficam em lib/guides.ts.
 */
export function PageGuide() {
  const { pathname } = useLocation();
  const found = guideFor(pathname);
  const [open, setOpen] = useState(() => (found ? readOpen(found.key) : false));
  useEffect(() => { if (found) setOpen(readOpen(found.key)); }, [found?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!found) return null;
  const { guide, key } = found;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(storageKey(key), next ? "aberto" : "fechado");
    } catch {
      // sem armazenamento: vale só até recarregar
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 text-sm">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={open}>
        <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
        <span className="font-medium">Como usar esta tela</span>
        <span className="hidden truncate text-muted-foreground sm:inline">· {guide.intro}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{open ? "recolher" : "ver passos"}</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {open && (
        <div className="grid gap-4 border-t border-primary/10 px-3 pb-3 pt-2 md:grid-cols-2">
          <div>
            <p className="mb-1 text-muted-foreground sm:hidden">{guide.intro}</p>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Passo a passo</p>
            <ol className="list-decimal space-y-1 pl-5">
              {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
          {(guide.sections?.length || guide.tip) && (
            <div className="space-y-3">
              {guide.sections?.length ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">O que tem em cada aba</p>
                  <ul className="space-y-1">
                    {guide.sections.map(([name, text]) => <li key={name}><span className="font-medium">{name}:</span> <span className="text-muted-foreground">{text}</span></li>)}
                  </ul>
                </div>
              ) : null}
              {guide.tip && <p className="rounded-md bg-background/70 p-2 text-xs"><span className="font-semibold">Dica:</span> {guide.tip}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
