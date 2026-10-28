/**
 * Worker da landing: as páginas e imagens saem dos assets; /api/orcamento
 * repassa o pedido de orçamento para o sistema da Mobieer (SYSTEM_API_URL).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/orcamento") {
      if (request.method !== "POST") return Response.json({ message: "Método não permitido" }, { status: 405 });
      const body = await request.text();
      if (body.length > 5000) return Response.json({ message: "Pedido muito grande" }, { status: 413 });
      const res = await fetch(`${env.SYSTEM_API_URL}/public/orcamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // o limite de pedidos do sistema conta por IP: repassa o IP real de quem enviou
          "X-Forwarded-For": request.headers.get("CF-Connecting-IP") ?? "",
        },
        body,
      });
      return new Response(res.body, { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname.startsWith("/api/")) return Response.json({ message: "Não encontrado" }, { status: 404 });
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
