import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Heading,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Pilcrow,
  Redo2,
  Rows3,
  Table,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Editor do contrato, como um editor de texto: o contrato abre já preenchido
 * (cláusulas, pedido e parcelas em tabelas) e a pessoa corrige o que quiser
 * antes de gerar o PDF. Na saída, o documento vai em blocos simples (título,
 * parágrafo, item de lista, tabela) que o servidor desenha no padrão da loja.
 */

/** f/v: campo automático (ex.: "promob.total") e o valor que o sistema pôs nele */
export type DocRun = { text: string; b?: boolean; i?: boolean; u?: boolean; f?: string; v?: string };
type Align = "left" | "center" | "right" | "justify";
export type DocBlock =
  | { t: "h"; runs: DocRun[]; align?: Align }
  | { t: "p"; runs: DocRun[]; align?: Align }
  | { t: "li"; ordered: boolean; n: number; runs: DocRun[] }
  | { t: "table"; rows: string[][] };

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "TABLE", "BLOCKQUOTE", "SECTION", "HR", "PRE"]);

function alignOf(el: HTMLElement): Align | undefined {
  const a = (el.style.textAlign || el.getAttribute("align") || "").toLowerCase();
  if (a === "start") return "left";
  if (a === "end") return "right";
  return a === "left" || a === "center" || a === "right" || a === "justify" ? a : undefined;
}

/** Trechos de texto com negrito/itálico/sublinhado, na ordem. */
function runsOf(node: Node, style: Omit<DocRun, "text"> = {}, out: DocRun[] = []): DocRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/ /g, " ").replace(/[\r\n\t]+/g, " ");
    if (text) {
      const last = out[out.length - 1];
      if (last && !!last.b === !!style.b && !!last.i === !!style.i && !!last.u === !!style.u && last.f === style.f) last.text += text;
      else out.push({ text, ...style });
    }
    return out;
  }
  if (!(node instanceof HTMLElement)) return out;
  if (node.tagName === "BR") {
    out.push({ text: "\n", ...style });
    return out;
  }
  const s = node.style;
  const weight = s.fontWeight;
  const next = {
    b: style.b || ["B", "STRONG"].includes(node.tagName) || weight === "bold" || Number(weight) >= 600 || undefined,
    i: style.i || ["I", "EM"].includes(node.tagName) || s.fontStyle === "italic" || undefined,
    u: style.u || node.tagName === "U" || s.textDecoration.includes("underline") || s.textDecorationLine.includes("underline") || undefined,
    // trecho de campo automático: o texto de dentro leva o campo e o valor do sistema
    f: node.dataset.f ?? style.f,
    v: node.dataset.f ? node.dataset.v ?? "" : style.v,
  };
  // negrito desligado à mão dentro de um negrito ("font-weight: normal")
  if (weight === "normal" || weight === "400") next.b = undefined;
  node.childNodes.forEach((c) => runsOf(c, next, out));
  return out;
}

/** Tira a quebra que o navegador deixa no fim do parágrafo. */
function trimRuns(runs: DocRun[]): DocRun[] {
  const r = runs.map((x) => ({ ...x }));
  while (r.length && /^\n*$/.test(r[r.length - 1].text)) r.pop();
  if (r.length) r[r.length - 1].text = r[r.length - 1].text.replace(/\n+$/, "");
  return r;
}

/** O que está no editor, em blocos para o servidor. */
export function serializeContract(root: HTMLElement): DocBlock[] {
  const out: DocBlock[] = [];
  const walk = (container: HTMLElement, inherited?: Align) => {
    let inline: Node[] = [];
    const flush = () => {
      if (!inline.length) return;
      const runs: DocRun[] = [];
      inline.forEach((n) => runsOf(n, {}, runs));
      const r = trimRuns(runs);
      if (r.length || inline.some((n) => n.nodeName === "BR")) out.push({ t: "p", runs: r, align: inherited });
      inline = [];
    };
    container.childNodes.forEach((node) => {
      if (!(node instanceof HTMLElement) || !BLOCK_TAGS.has(node.tagName)) {
        inline.push(node);
        return;
      }
      flush();
      const tag = node.tagName;
      if (/^H[1-6]$/.test(tag)) out.push({ t: "h", runs: trimRuns(runsOf(node)), align: alignOf(node) });
      else if (tag === "UL" || tag === "OL") {
        let n = 0;
        node.querySelectorAll(":scope > li").forEach((li) => {
          n += 1;
          out.push({ t: "li", ordered: tag === "OL", n, runs: trimRuns(runsOf(li)) });
        });
      } else if (tag === "TABLE") {
        const rows = [...node.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => (c as HTMLElement).innerText.replace(/ /g, " ").replace(/\s*\n\s*/g, " ").trim()));
        if (rows.length) out.push({ t: "table", rows });
      } else if (tag === "HR") {
        // linha horizontal não entra no PDF
      } else if ([...node.children].some((c) => BLOCK_TAGS.has(c.tagName))) walk(node, alignOf(node) ?? inherited);
      else out.push({ t: "p", runs: trimRuns(runsOf(node)), align: alignOf(node) ?? inherited });
    });
    flush();
  };
  walk(root);
  return out;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runsHtml(runs: DocRun[]) {
  return runs
    .map((r) => {
      let h = esc(r.text).replace(/\n/g, "<br>");
      if (r.u) h = `<u>${h}</u>`;
      if (r.i) h = `<em>${h}</em>`;
      if (r.b) h = `<strong>${h}</strong>`;
      if (r.f) h = `<span data-f="${esc(r.f)}" data-v="${esc(r.v ?? "")}">${h}</span>`;
      return h;
    })
    .join("");
}

/**
 * O caminho de volta: blocos salvos → texto do editor. É assim que o contrato
 * reabre do jeito que a pessoa deixou (o servidor guarda os blocos, não HTML).
 */
export function blocksToHtml(blocks: DocBlock[]): string {
  const out: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (list) out.push(`<${list.ordered ? "ol" : "ul"}>${list.items.join("")}</${list.ordered ? "ol" : "ul"}>`);
    list = null;
  };
  const style = (a?: Align) => (a ? ` style="text-align: ${a}"` : "");
  for (const b of blocks) {
    if (b.t === "li") {
      if (!list || list.ordered !== b.ordered || b.n === 1) {
        flush();
        list = { ordered: b.ordered, items: [] };
      }
      list.items.push(`<li>${runsHtml(b.runs) || "<br>"}</li>`);
      continue;
    }
    flush();
    if (b.t === "table") {
      const [head, ...body] = b.rows;
      const cells = (r: string[], tag: "th" | "td") => r.map((c) => `<${tag}>${esc(c) || "<br>"}</${tag}>`).join("");
      out.push(`<table><thead><tr>${cells(head ?? [], "th")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r, "td")}</tr>`).join("")}</tbody></table>`);
    } else if (b.t === "h") out.push(`<h3${style(b.align)}>${runsHtml(b.runs) || "<br>"}</h3>`);
    else out.push(`<p${style(b.align)}>${runsHtml(b.runs) || "<br>"}</p>`);
  }
  flush();
  return out.join("");
}

const BLANK = "____";
const AUTOSAVE_MS = 1500;

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
function saveLabel(s: { state: string; at: string | null }) {
  if (s.state === "saving") return "Salvando…";
  if (s.state === "error") return "Não foi possível salvar agora. O texto continua aqui; tente de novo em instantes.";
  if (s.state === "dirty") return "Alterações ainda não salvas…";
  return s.at ? `Salvo às ${hhmm(s.at)}${s.state === "idle" ? " (texto que você deixou da última vez)" : ""}` : "As alterações são salvas sozinhas.";
}

export function ContractEditor(props: {
  title: string;
  html: string;
  description?: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: (doc: DocBlock[]) => void;
  /** recebe o texto como está, para reabrir sem perder a edição */
  onClose: (html: string) => void;
  /** salva o texto enquanto a pessoa edita (e ao fechar): sair não perde nada */
  onAutosave?: (doc: DocBlock[]) => Promise<unknown>;
  /** quando o texto salvo foi gravado (para mostrar ao abrir) */
  savedAt?: string | null;
  /** joga fora o texto corrigido e remonta pelo modelo */
  onDiscard?: () => void;
  /** valores de agora no sistema e o nome de cada campo: marca o que foi editado à mão */
  fields?: { values: Record<string, string>; labels: Record<string, string> };
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [blanks, setBlanks] = useState(0);
  const [inTable, setInTable] = useState(false);
  // campos automáticos: editados à mão (texto diferente do valor posto) e desatualizados (o sistema mudou)
  const [marks, setMarks] = useState<{ key: string; label: string; edited: boolean; stale: boolean; text: string; now: string }[]>([]);
  const [showMarks, setShowMarks] = useState(false);
  const fieldValues = props.fields?.values;
  const fieldLabels = props.fields?.labels;
  const mark = () => {
    const root = ref.current;
    if (!root || !fieldValues) return;
    const byKey = new Map<string, { key: string; label: string; edited: boolean; stale: boolean; text: string; now: string }>();
    root.querySelectorAll<HTMLElement>("span[data-f]").forEach((el) => {
      const key = el.dataset.f!;
      const text = el.textContent ?? "";
      const now = fieldValues[key];
      const edited = text !== (el.dataset.v ?? "");
      const stale = now !== undefined && (el.dataset.v ?? "") !== now;
      el.dataset.edited = String(edited);
      el.dataset.stale = String(stale && !edited);
      el.title = edited ? `Editado à mão. No sistema: ${now ?? el.dataset.v}` : stale ? `Mudou no sistema: agora ${now}` : fieldLabels?.[key] ?? key;
      const cur = byKey.get(key);
      if (cur) {
        cur.edited ||= edited;
        cur.stale ||= stale;
      } else byKey.set(key, { key, label: fieldLabels?.[key] ?? key, edited, stale, text, now: now ?? el.dataset.v ?? "" });
    });
    setMarks([...byKey.values()].filter((m) => m.edited || m.stale));
  };
  /** volta o campo (todas as vezes que aparece) ao valor de agora no sistema */
  const restore = (key: string) => {
    const now = fieldValues?.[key];
    if (now === undefined) return;
    ref.current?.querySelectorAll<HTMLElement>("span[data-f]").forEach((el) => {
      if (el.dataset.f !== key) return;
      el.textContent = now;
      el.dataset.v = now;
    });
    changed();
  };
  const [save, setSave] = useState<{ state: "idle" | "dirty" | "saving" | "saved" | "error"; at: string | null }>({ state: "idle", at: props.savedAt ?? null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosave = props.onAutosave;
  const flushSave = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!autosave || !ref.current) return;
    setSave((s) => ({ ...s, state: "saving" }));
    try {
      await autosave(serializeContract(ref.current));
      setSave({ state: "saved", at: new Date().toISOString() });
    } catch {
      setSave((s) => ({ ...s, state: "error" }));
    }
  };
  const schedule = () => {
    if (!autosave) return;
    setSave((s) => ({ ...s, state: "dirty" }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushSave(), AUTOSAVE_MS);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const close = () => {
    // o que ainda não foi salvo vai antes de fechar
    if (timer.current) void flushSave();
    props.onClose(ref.current?.innerHTML ?? props.html);
  };

  // O texto entra quando a página do editor aparece. A janela monta o conteúdo
  // um instante depois do primeiro render; um useEffect rodava com ref vazia e o
  // editor abria em branco ("o contrato não abre"). A ref de callback pega o
  // momento certo e só preenche de novo se o texto de entrada mudar.
  const filled = useRef<string | null>(null);
  const attach = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (!el || filled.current === props.html) return;
    filled.current = props.html;
    el.innerHTML = props.html;
    document.execCommand("defaultParagraphSeparator", false, "p");
    setBlanks(el.innerText.split(BLANK).length - 1);
    mark();
  };

  // célula onde está o cursor (para os botões da tabela)
  const cell = (): HTMLTableCellElement | null => {
    const n = window.getSelection()?.anchorNode;
    const el = n instanceof HTMLElement ? n : n?.parentElement;
    const c = el?.closest("td,th") as HTMLTableCellElement | null;
    return c && ref.current?.contains(c) ? c : null;
  };
  useEffect(() => {
    const onSel = () => setInTable(!!cell());
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const exec = (cmd: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, value);
  };
  function changed() {
    setBlanks((ref.current?.innerText ?? "").split(BLANK).length - 1);
    mark();
    schedule();
  }

  const emptyCell = (tag: "td" | "th") => {
    const c = document.createElement(tag);
    c.innerHTML = "<br>";
    return c;
  };
  const addRow = () => {
    const c = cell();
    const tr = c?.closest("tr");
    if (!c || !tr) return;
    const row = document.createElement("tr");
    [...tr.children].forEach(() => row.appendChild(emptyCell("td")));
    // no cabeçalho, a linha nova vai para o começo do corpo
    if (tr.parentElement?.tagName === "THEAD") {
      const body = tr.closest("table")!.tBodies[0] ?? tr.closest("table")!.createTBody();
      body.insertBefore(row, body.firstChild);
    } else tr.after(row);
    changed();
  };
  const removeRow = () => {
    const tr = cell()?.closest("tr");
    if (!tr || tr.parentElement?.tagName === "THEAD") return;
    tr.remove();
    changed();
  };
  const addColumn = () => {
    const c = cell();
    const table = c?.closest("table");
    if (!c || !table) return;
    const idx = c.cellIndex;
    table.querySelectorAll("tr").forEach((tr) => {
      const head = tr.parentElement?.tagName === "THEAD";
      const ref0 = tr.children[idx];
      const n = emptyCell(head ? "th" : "td");
      if (ref0) ref0.after(n);
      else tr.appendChild(n);
    });
    changed();
  };
  const removeColumn = () => {
    const c = cell();
    const table = c?.closest("table");
    if (!c || !table || (table.rows[0]?.cells.length ?? 0) <= 1) return;
    const idx = c.cellIndex;
    table.querySelectorAll("tr").forEach((tr) => tr.children[idx]?.remove());
    changed();
  };
  const removeTable = () => {
    cell()?.closest("table")?.remove();
    changed();
  };
  const insertTable = () =>
    exec("insertHTML", "<table><thead><tr><th>COLUNA 1</th><th>COLUNA 2</th><th>COLUNA 3</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>");

  const Tool = ({ title, onClick, children, disabled }: { title: string; onClick: () => void; children: ReactNode; disabled?: boolean }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      // sem perder a seleção do texto ao clicar no botão
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
  const Sep = () => <span className="mx-1 h-5 w-px bg-border" />;

  return (
    <Dialog open onOpenChange={(o) => !o && !props.pending && close()}>
      <DialogContent className="flex h-[94vh] max-h-[94vh] max-w-5xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description ?? "Corrija o que precisar direto no texto, como num editor de documentos. O PDF sai exatamente deste texto."}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/40 p-1">
          <Tool title="Desfazer" onClick={() => exec("undo")}><Undo2 className="h-4 w-4" /></Tool>
          <Tool title="Refazer" onClick={() => exec("redo")}><Redo2 className="h-4 w-4" /></Tool>
          <Sep />
          <Tool title="Negrito" onClick={() => exec("bold")}><Bold className="h-4 w-4" /></Tool>
          <Tool title="Itálico" onClick={() => exec("italic")}><Italic className="h-4 w-4" /></Tool>
          <Tool title="Sublinhado" onClick={() => exec("underline")}><Underline className="h-4 w-4" /></Tool>
          <Sep />
          <Tool title="Título de seção" onClick={() => exec("formatBlock", "<h3>")}><Heading className="h-4 w-4" /></Tool>
          <Tool title="Texto normal" onClick={() => exec("formatBlock", "<p>")}><Pilcrow className="h-4 w-4" /></Tool>
          <Tool title="Lista" onClick={() => exec("insertUnorderedList")}><List className="h-4 w-4" /></Tool>
          <Tool title="Lista numerada" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-4 w-4" /></Tool>
          <Sep />
          <Tool title="Alinhar à esquerda" onClick={() => exec("justifyLeft")}><AlignLeft className="h-4 w-4" /></Tool>
          <Tool title="Centralizar" onClick={() => exec("justifyCenter")}><AlignCenter className="h-4 w-4" /></Tool>
          <Tool title="Alinhar à direita" onClick={() => exec("justifyRight")}><AlignRight className="h-4 w-4" /></Tool>
          <Tool title="Justificar" onClick={() => exec("justifyFull")}><AlignJustify className="h-4 w-4" /></Tool>
          <Sep />
          <Tool title="Inserir tabela" onClick={insertTable}><Table className="h-4 w-4" /></Tool>
          <Tool title="Linha nova abaixo" disabled={!inTable} onClick={addRow}><Rows3 className="h-4 w-4" /></Tool>
          <Tool title="Coluna nova à direita" disabled={!inTable} onClick={addColumn}><Columns3 className="h-4 w-4" /></Tool>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={!inTable} onMouseDown={(e) => e.preventDefault()} onClick={removeRow}>− linha</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={!inTable} onMouseDown={(e) => e.preventDefault()} onClick={removeColumn}>− coluna</Button>
          <Tool title="Apagar tabela" disabled={!inTable} onClick={removeTable}><Trash2 className="h-4 w-4" /></Tool>
        </div>

        {marks.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
            <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setShowMarks((v) => !v)}>
              {marks.filter((m) => m.edited).length > 0 && `${marks.filter((m) => m.edited).length} campo(s) do sistema editado(s) à mão`}
              {marks.some((m) => m.edited) && marks.some((m) => m.stale && !m.edited) && " · "}
              {marks.some((m) => m.stale && !m.edited) && `${marks.filter((m) => m.stale && !m.edited).length} desatualizado(s)`}
              {showMarks ? " (esconder)" : " (ver)"}
            </button>
            {showMarks && (
              <ul className="mt-1.5 space-y-1">
                {marks.map((m) => (
                  <li key={m.key} className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded px-1", m.edited ? "bg-amber-200/70 text-neutral-900" : "bg-sky-200/70 text-neutral-900")}>{m.edited ? "editado à mão" : "mudou no sistema"}</span>
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground">no sistema: {m.now || "(vazio)"}</span>
                    <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={props.pending} onClick={() => restore(m.key)}>
                      {m.edited ? "Voltar ao valor do sistema" : "Atualizar"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted p-2 sm:p-6">
          <div
            ref={attach}
            contentEditable={!props.pending}
            suppressContentEditableWarning
            spellCheck
            lang="pt-BR"
            onInput={changed}
            className={cn("contract-page mx-auto min-h-full w-full max-w-[794px] bg-white px-5 py-8 text-[13px] leading-relaxed text-neutral-900 shadow-sm outline-none sm:px-14", props.pending && "opacity-60")}
          />
        </div>

        <DialogFooter className="items-center gap-2">
          <div className="mr-auto space-y-0.5 text-xs">
            {blanks > 0 && <p className="text-warning">{blanks} {blanks > 1 ? "campos" : "campo"} ainda com "{BLANK}" para preencher.</p>}
            {autosave && <p className={save.state === "error" ? "text-destructive" : "text-muted-foreground"}>{saveLabel(save)}</p>}
          </div>
          {props.onDiscard && (
            <Button variant="ghost" disabled={props.pending} onClick={() => confirm("Regenerar do zero? O texto corrigido é descartado e o contrato é montado de novo pelo modelo, com os dados de agora.") && props.onDiscard!()}>
              Regenerar do zero
            </Button>
          )}
          <Button variant="outline" disabled={props.pending} onClick={close}>Fechar</Button>
          <Button
            disabled={props.pending}
            onClick={() => {
              if (!ref.current) return;
              if (timer.current) clearTimeout(timer.current);
              timer.current = null;
              props.onConfirm(serializeContract(ref.current));
            }}
          >
            {props.pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
      <style>{`
        .contract-page p { margin: 0; text-align: justify; }
        .contract-page h3 { margin: 10px 0 4px; color: #C8551F; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
        .contract-page ul, .contract-page ol { margin: 0; padding-left: 22px; }
        .contract-page ul { list-style: disc; }
        .contract-page ol { list-style: decimal; }
        .contract-page ul li::marker { color: #C8551F; }
        .contract-page table { width: 100%; border-collapse: collapse; margin: 6px 0 8px; font-size: 11.5px; }
        .contract-page th { background: #EFE8E0; font-weight: 700; font-size: 10.5px; text-align: left; }
        .contract-page th, .contract-page td { border-bottom: 1px solid #E4DACF; padding: 4px 6px; vertical-align: top; min-width: 2em; }
        .contract-page td:focus-within, .contract-page th:focus-within { outline: 2px solid #C8551F55; }
        .contract-page span[data-f] { border-bottom: 1px dotted #C8551F88; }
        .contract-page span[data-edited="true"] { background: #fde68aaa; }
        .contract-page span[data-stale="true"] { background: #bae6fdaa; }
      `}</style>
    </Dialog>
  );
}
