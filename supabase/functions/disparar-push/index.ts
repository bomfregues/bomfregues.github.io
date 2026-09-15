import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Chaves VAPID oficiais
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "BPfvsPqjD8sW50kBp7nwkrQuzks26BdfuTy_Je5Rd-pafD_dHWt3NjRb0FcvTgf1ak6FUAZmbzwfC322LgU7oLc";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

// A Apple EXIGE uma URL HTTPS válida e acessível como subject do VAPID
const VAPID_SUBJECT = "https://bomfregues.github.io";

if (VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    console.log("--> Recebida requisição de disparo:", bodyText);

    if (!bodyText) {
      throw new Error("Corpo da requisição vazio.");
    }

    const { slug, titulo, descricao, app_url } = JSON.parse(bodyText);
    if (!slug) throw new Error("Slug da loja é obrigatório.");

    if (!VAPID_PRIVATE_KEY) {
      console.error("ERRO: VAPID_PRIVATE_KEY não está configurada nos Secrets do Supabase!");
      throw new Error("Chave VAPID privada não configurada no servidor.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Busca todos os aparelhos inscritos da loja
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, device_id, subscription")
      .eq("comercio_slug", slug);

    if (error) throw error;

    console.log(`--> Encontrados ${subs?.length || 0} aparelhos para a loja: ${slug}`);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ 
        sucesso: false, 
        mensagem: "Nenhum aparelho inscrito para esta loja.",
        total: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const payload = JSON.stringify({
      title: titulo || "Nova Promoção!",
      body: descricao || "Confira a novidade no clube.",
      url: app_url || `https://bomfregues.github.io/public/lojas/${slug}/`
    });

    const pushOptions = {
      TTL: 60 * 60 * 24, // 24 horas de validade
      urgency: "high" as const
    };

    let sucessos = 0;
    let falhas = 0;

    // 2. Dispara individualmente para cada aparelho
    for (const reg of subs) {
      try {
        let subObj = reg.subscription;
        if (typeof subObj === "string") {
          subObj = JSON.parse(subObj);
        }

        if (!subObj || !subObj.endpoint || !subObj.keys) {
          console.warn(`[ID: ${reg.id}] Inscrição malformatada, ignorando...`);
          continue;
        }

        console.log(`--> Enviando para endpoint: ${subObj.endpoint.substring(0, 45)}...`);

        await webpush.sendNotification(subObj, payload, pushOptions);

        sucessos++;
        console.log(`--> Notificação entregue com sucesso para o ID: ${reg.id}`);
      } catch (err: any) {
        falhas++;
        console.error(`--> Erro detalhado ao enviar para ID ${reg.id}:`, {
          status: err.statusCode,
          headers: err.headers,
          body: err.body,
          message: err.message
        });

        // Se o token expirou (404/410) ou foi invalidado pela Apple/Google (400 Bad Request / 401 Unauthorized por chave antiga)
        if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 400 || err.statusCode === 401) {
          console.log(`--> Removendo inscrição inválida/expirada do banco: ID ${reg.id} (Status ${err.statusCode})`);
          await supabase.from("push_subscriptions").delete().eq("id", reg.id);
        }
      }
    }

    return new Response(JSON.stringify({
      sucesso: true,
      total_encontrados: subs.length,
      sucessos,
      falhas
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("ERRO GERAL DISPARAR-PUSH:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});