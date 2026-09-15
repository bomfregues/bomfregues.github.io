import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/manifest+json; charset=utf-8",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("loja") || "singello";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) throw new Error("Configuração do Supabase incompleta.");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: loja } = await supabase
      .from("comercios")
      .select("nome_fantasia, cor_primaria, logo_url")
      .eq("slug", slug)
      .maybeSingle();

    const nome = loja?.nome_fantasia || "Bom Freguês";
    const cor = loja?.cor_primaria || "#1c1917";
    const iconUrl = loja?.logo_url || "https://bomfregues.github.io/public/img/icon-192.png";

    // URL completa e única para cada loja
    const appUrl = `https://bomfregues.github.io/public/app.html?loja=${slug}`;

    const manifest = {
      name: nome,
      short_name: nome,
      // ID único impede que o WebAPK sobrescreva o outro
      id: `https://bomfregues.github.io/public/app.html?loja=${slug}`,
      start_url: appUrl,
      scope: `https://bomfregues.github.io/public/`,
      display: "standalone",
      orientation: "portrait",
      // FORÇA o Android a abrir sempre uma nova janela/instância isolada
      launch_handler: {
        client_mode: "navigate-new"
      },
      background_color: cor,
      theme_color: cor,
      icons: [
        {
          src: iconUrl,
          sizes: "192x192",
          type: "image/png",
          purpose: "any"
        },
        {
          src: iconUrl,
          sizes: "512x512",
          type: "image/png",
          purpose: "any"
        },
        {
          src: iconUrl,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable"
        }
      ]
    };

    return new Response(JSON.stringify(manifest), {
      headers: corsHeaders,
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});