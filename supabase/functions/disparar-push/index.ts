import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { slug, titulo, descricao, app_url } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: inscricoes } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("comercio_slug", slug);

    if (!inscricoes || inscricoes.length === 0) {
      return new Response(JSON.stringify({ enviado: 0, mensagem: "Nenhum cliente inscrito nesta loja" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    webpush.setVapidDetails(
      "mailto:suporte@bomfregues.com",
      "BPgTOsh2Se0Lz_gyRBjcHGt3JL7qsnpvGP7Cun-AGvCO5wc6KoVl22Cw_ly6gFjVjvpXuCFgxJkYGnDhKkug7E0",
      "s8V6ogiTsZZo4BiXLrqIkuNsQyKoiz4NX3RNIvfAoO4"
    );

    const payload = JSON.stringify({
      title: titulo,
      body: descricao,
      url: app_url
    });

    const envios = inscricoes.map(async (item: any) => {
      try {
        await webpush.sendNotification(item.subscription, payload);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log("Inscrição expirada removida");
        }
      }
    });

    await Promise.all(envios);

    return new Response(JSON.stringify({ sucesso: true, total: inscricoes.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});