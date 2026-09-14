import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// Configurações do Repositório GitHub
// Configure estes secrets no Supabase: GITHUB_TOKEN, GITHUB_OWNER (seu user), GITHUB_REPO
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER") ?? "bomfregues";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "bomfregues";
const GITHUB_BRANCH = "main";

async function salvarArquivoNoGitHub(caminho: string, conteudoTexto: string, commitMsg: string) {
  if (!GITHUB_TOKEN) {
    console.warn("GITHUB_TOKEN não configurado. Pulando commit automático no GitHub Pages.");
    return false;
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${caminho}`;
  
  // Verifica se o arquivo já existe para obter o SHA (necessário para update)
  let sha: string | undefined = undefined;
  const getRes = await fetch(url, {
    headers: {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "User-Agent": "Supabase-Edge-Function",
      "Accept": "application/vnd.github.v3+json"
    }
  });

  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
  }

  // Codifica o conteúdo em Base64
  const bytes = new TextEncoder().encode(conteudoTexto);
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const contentBase64 = btoa(binString);

  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "User-Agent": "Supabase-Edge-Function",
      "Content-Type": "application/json",
      "Accept": "application/vnd.github.v3+json"
    },
    body: JSON.stringify({
      message: commitMsg,
      content: contentBase64,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {})
    })
  });

  return putRes.ok;
}

function gerarManifestoLoja(slug: string, nome: string, cor: string, logoUrl: string) {
  const iconFinal = logoUrl || "https://bomfregues.github.io/public/img/icon-192.png";
  const manifest = {
    name: nome,
    short_name: nome.length > 12 ? nome.slice(0, 12) : nome,
    id: `/public/lojas/${slug}/`,
    start_url: `./index.html?loja=${slug}`,
    scope: `./`,
    display: "standalone",
    orientation: "portrait",
    background_color: cor || "#ffffff",
    theme_color: cor || "#1c1917",
    icons: [
      {
        src: iconFinal,
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: iconFinal,
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: iconFinal,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
  return JSON.stringify(manifest, null, 2);
}

function gerarHtmlLoja(slug: string) {
  // Redireciona e isola a execução dentro do diretório exclusivo da loja
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Bom Freguês</title>
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="../../img/icon-192.png">
  <script>
    // Carrega a engine completa passando o slug fixo desta pasta
    window.STORE_SLUG = "${slug}";
    window.location.replace("../../app.html?loja=${slug}&pwa_dir=lojas/${slug}/");
  </script>
</head>
<body>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === "GET") {
      const slug = url.searchParams.get("slug") || "";
      const { data, error } = await supabase
        .from("comercios")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const payload = await req.json();
      const slug = (payload.slug || "").toLowerCase().trim();
      if (!slug) throw new Error("Slug obrigatório.");

      // 1. Salva/Atualiza no banco de dados
      const { data: loja, error } = await supabase
        .from("comercios")
        .upsert({
          slug,
          nome_fantasia: payload.nome_fantasia,
          cor_primaria: payload.cor_primaria,
          cor_secundaria: payload.cor_secundaria,
          cor_destaque: payload.cor_destaque,
          logo_url: payload.logo_url,
          user_id: payload.user_id,
          senha_resgate: payload.senha_resgate
        }, { onConflict: "slug" })
        .select()
        .single();

      if (error) throw error;

      // 2. CRIAÇÃO AUTOMÁTICA DA PASTA DA LOJA NO GITHUB
      // Gera public/lojas/<slug>/manifest.json
      const manifestContent = gerarManifestoLoja(slug, loja.nome_fantasia, loja.cor_primaria, loja.logo_url);
      await salvarArquivoNoGitHub(
        `public/lojas/${slug}/manifest.json`,
        manifestContent,
        `chore: auto-provision pwa manifest for ${slug}`
      );

      // Gera public/lojas/<slug>/index.html
      const htmlContent = gerarHtmlLoja(slug);
      await salvarArquivoNoGitHub(
        `public/lojas/${slug}/index.html`,
        htmlContent,
        `chore: auto-provision pwa entrypoint for ${slug}`
      );

      return new Response(JSON.stringify({ 
        sucesso: true, 
        loja,
        pwa_url: `https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/public/lojas/${slug}/`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response("Método não suportado", { status: 405, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});