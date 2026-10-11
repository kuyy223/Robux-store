
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/orders") {
      const method = request.method;

      if (method !== "GET" && method !== "POST") {
        return new Response(
          JSON.stringify({ error: "Metode tidak diizinkan." }),
          {
            status: 405,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Allow": "GET, POST"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          error:
            "API belum terhubung. Handler pesanan perlu dipindahkan ke worker.js."
        }),
        {
          status: 501,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
