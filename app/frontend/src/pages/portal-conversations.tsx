import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageSkeleton } from "@/components/ui/states";
import { PortalThread, mergeMessages, type PortalMessage } from "@/components/portal-thread";
import { apiGet, apiPost } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Conversation = {
  clientId: string;
  name: string;
  active: boolean;
  attendant: string | null;
  unread: number;
  lastMessage: { authorKind: PortalMessage["authorKind"]; body: string; createdAt: string } | null;
};
type MessagesResponse = { data: { client: { id: string; name: string }; messages: PortalMessage[] } };

const WHO: Record<PortalMessage["authorKind"], string> = { CLIENT: "Cliente", STAFF: "Equipe", AI: "Assistente" };

/** Conversas dos clientes no portal: a equipe lê (inclusive o que o assistente respondeu) e responde. */
export function PortalConversationsPage() {
  const list = useQuery({
    queryKey: ["portal-chat", "conversations"],
    queryFn: () => apiGet<{ data: Conversation[] }>("/portal-chat/conversations"),
    refetchInterval: 15_000,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const items = list.data?.data ?? [];
  const active = items.find((c) => c.clientId === activeId) ?? items[0] ?? null;

  if (list.isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conversas com clientes"
        description="Mensagens que os clientes mandam pelo portal. As perguntas feitas ao assistente virtual aparecem junto, para a equipe acompanhar."
      />
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum cliente da sua carteira mandou mensagem pelo portal ainda.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="flex max-h-[calc(100vh-14rem)] flex-col gap-2 overflow-y-auto">
            {items.map((c) => (
              <button
                key={c.clientId}
                type="button"
                onClick={() => setActiveId(c.clientId)}
                className={cn(
                  "rounded-lg border p-3 text-left transition",
                  active?.clientId === c.clientId ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("truncate text-sm font-medium", !c.active && "text-muted-foreground")}>{c.name}</p>
                  {c.unread > 0 && active?.clientId !== c.clientId && <Badge>{c.unread}</Badge>}
                </div>
                {c.lastMessage && (
                  <p className="truncate text-xs text-muted-foreground">
                    {WHO[c.lastMessage.authorKind]}: {c.lastMessage.body}
                  </p>
                )}
                {c.attendant && <p className="truncate text-[11px] text-muted-foreground">Atendimento: {c.attendant}</p>}
              </button>
            ))}
          </div>
          {active && <ConversationPane key={active.clientId} conversation={active} />}
        </div>
      )}
    </div>
  );
}

function ConversationPane({ conversation }: { conversation: Conversation }) {
  const qc = useQueryClient();
  const path = `/portal-chat/conversations/${conversation.clientId}/messages`;
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [text, setText] = useState("");
  const lastAt = messages.length ? messages[messages.length - 1].createdAt : null;

  const initial = useQuery({ queryKey: ["portal-chat", "messages", conversation.clientId], queryFn: () => apiGet<MessagesResponse>(path), staleTime: Infinity });
  useEffect(() => {
    if (!initial.data) return;
    setMessages(initial.data.data.messages);
    qc.invalidateQueries({ queryKey: ["portal-chat", "unread"] });
    qc.invalidateQueries({ queryKey: ["portal-chat", "conversations"] });
  }, [initial.data, qc]);

  useQuery({
    queryKey: ["portal-chat", "poll", conversation.clientId, lastAt],
    queryFn: async () => {
      const r = await apiGet<MessagesResponse>(path, lastAt ? { after: lastAt } : undefined);
      if (r.data.messages.length) {
        setMessages((cur) => mergeMessages(cur, r.data.messages));
        qc.invalidateQueries({ queryKey: ["portal-chat", "unread"] });
      }
      return r.data.messages.length;
    },
    enabled: Boolean(initial.data),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const send = useMutation({
    mutationFn: () => apiPost<{ data: PortalMessage }>(path, { body: text }),
    onSuccess: (r) => {
      setMessages((cur) => mergeMessages(cur, [r.data]));
      setText("");
      qc.invalidateQueries({ queryKey: ["portal-chat", "conversations"] });
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível enviar")),
  });
  const canSend = text.trim().length > 0 && !send.isPending;

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[420px] flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-medium">{conversation.name}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> Mensagens tracejadas foram respondidas pelo assistente virtual.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {initial.isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
        ) : (
          <PortalThread messages={messages} viewer="staff" empty="Nenhuma mensagem." />
        )}
      </div>
      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Responder ${conversation.name}`}
          className="max-h-32 min-h-[40px] resize-none"
          maxLength={2000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) send.mutate();
            }
          }}
        />
        <Button type="button" size="icon" disabled={!canSend} onClick={() => send.mutate()} title="Enviar">
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
