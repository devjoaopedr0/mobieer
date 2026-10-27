import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Loader2, MessagesSquare, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PortalThread, mergeMessages, type PortalMessage } from "@/components/portal-thread";
import { portalGet, portalPost } from "@/services/portal-api";
import { errorMessage } from "@/lib/errors";

type ChatResponse = { data: { assistantEnabled: boolean; team: string | null; messages: PortalMessage[] } };

/** Conversa do cliente com a equipe e com o assistente virtual. */
export function PortalChatPage() {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [text, setText] = useState("");
  const lastAt = messages.length ? messages[messages.length - 1].createdAt : null;

  const initial = useQuery({ queryKey: ["portal-chat"], queryFn: () => portalGet<ChatResponse>("/chat"), staleTime: Infinity });
  useEffect(() => {
    if (initial.data) {
      setMessages(initial.data.data.messages);
      qc.invalidateQueries({ queryKey: ["portal-chat-unread"] });
    }
  }, [initial.data, qc]);

  // respostas da equipe chegam sozinhas
  useQuery({
    queryKey: ["portal-chat", "poll", lastAt],
    queryFn: async () => {
      const r = await portalGet<ChatResponse>(`/chat${lastAt ? `?after=${encodeURIComponent(lastAt)}` : ""}`);
      if (r.data.messages.length) setMessages((cur) => mergeMessages(cur, r.data.messages));
      return r.data.messages.length;
    },
    enabled: Boolean(initial.data),
    refetchInterval: 8_000,
  });

  const send = useMutation({
    mutationFn: (to: "team" | "assistant") => portalPost<{ data: PortalMessage[]; message?: string }>("/chat", { body: text, to }),
    onSuccess: (r) => {
      setMessages((cur) => mergeMessages(cur, r.data));
      setText("");
      if (r.message) toast.success(r.message);
    },
    onError: (e) => toast.error(errorMessage(e, "Não foi possível enviar")),
  });

  const info = initial.data?.data;
  const canSend = text.trim().length > 0 && !send.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/portal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Início
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <MessagesSquare className="h-5 w-5" /> Conversa
        </h1>
        <p className="text-sm text-muted-foreground">
          Tire dúvidas sobre o seu projeto com o assistente virtual ou fale direto com a equipe
          {info?.team ? ` (${info.team})` : ""}.
        </p>
      </div>

      <div className="flex h-[calc(100vh-20rem)] min-h-[380px] flex-col rounded-lg border border-border bg-card">
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {initial.isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
          ) : initial.isError ? (
            <p className="py-10 text-center text-sm text-destructive">{errorMessage(initial.error, "Não foi possível carregar a conversa")}</p>
          ) : (
            <PortalThread
              messages={messages}
              viewer="client"
              empty="Pergunte, por exemplo: “em que etapa está meu projeto?” ou “quando vence a próxima parcela?”"
            />
          )}
          {send.isPending && send.variables === "assistant" && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> O assistente está respondendo…
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-border p-3">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva sua mensagem"
            className="max-h-32 resize-none"
            maxLength={2000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) send.mutate(info?.assistantEnabled ? "assistant" : "team");
              }
            }}
          />
          <div className="flex flex-wrap justify-end gap-2">
            {info?.assistantEnabled && (
              <Button type="button" variant="outline" disabled={!canSend} onClick={() => send.mutate("assistant")}>
                {send.isPending && send.variables === "assistant" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                Perguntar ao assistente
              </Button>
            )}
            <Button type="button" disabled={!canSend} onClick={() => send.mutate("team")}>
              {send.isPending && send.variables === "team" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              Falar com a equipe
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            O assistente responde na hora com as informações do seu projeto. A equipe responde aqui mesmo, em horário comercial.
          </p>
        </div>
      </div>
    </div>
  );
}
