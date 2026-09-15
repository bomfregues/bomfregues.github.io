import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";

async function requireOwner(req: Request, slug: string, supabase: ReturnType<typeof createClient>) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Autenticação obrigatória.");

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) throw new Error("Sessão inválida.");

  const { data: owner, error } = await supabase
    .from("comercios")
    .select("id")
    .eq("slug", slug)
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (error || !owner) throw new Error("Sem permissão para esta loja.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("Método não permitido.");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Configuração do Supabase incompleta.");
    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) throw new Error("Configuração VAPID incompleta.");

    const { slug, titulo, descricao, app_url } = await req.json();
    const slugNormalizado = String(slug || "").toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(slugNormalizado)) throw new Error("Slug inválido.");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await requireOwner(req, slugNormalizado, supabase);

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("comercio_slug", slugNormalizado);

    if (error) throw error;
    if (!subs?.length) {
      return new Response(JSON.stringify({ sucesso: false, total: 0, sucessos: 0, falhas: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title: titulo || "Nova Promoção!",
      body: descricao || "Confira a novidade no clube.",
      url: app_url || `https://bomfregues.github.io/public/lojas/${slugNormalizado}/`,
    });

    let sucessos = 0;
    let falhas = 0;
    for (const registro of subs) {
      try {
        const subscription = typeof registro.subscription === "string"
          ? JSON.parse(registro.subscription)
          : registro.subscription;
        if (!subscription?.endpoint || !subscription?.keys) continue;

        await webpush.sendNotification(subscription, payload, { TTL: 60 * 60 * 24, urgency: "high" });
        sucessos++;
      } catch (error) {
        falhas++;
        const statusCode = (error as { statusCode?: number }).statusCode;
        if ([400, 401, 404, 410].includes(statusCode ?? 0)) {
          await supabase.from("push_subscriptions").delete().eq("id", registro.id);
        }
      }
    }

    return new Response(JSON.stringify({ sucesso: true, total: subs.length, sucessos, falhas }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao disparar notificações.";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
