const PROJECT_REF = "uskfiencjaqqlhglpuqt";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = "sb_publishable_31CDkXjDETBd12KK8yhW3w_hmyQZBqO";
const BASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

let supabaseClient = null;
if (typeof supabase !== 'undefined') {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const Api = {
  async cadastrarUsuario(email, password) {
    if (!supabaseClient) throw new Error("SDK de autenticação indisponível.");
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async loginUsuario(email, password) {
    if (!supabaseClient) throw new Error("SDK de autenticação indisponível.");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async recuperarSenha(email) {
    if (!supabaseClient) throw new Error("SDK de autenticação indisponível.");
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname.replace('login.html', 'login.html')}`
    });
    if (error) throw error;
    return data;
  },

  async obterSessao() {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  },

  async logout() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  },

  async verificarDisponibilidadeSlug(slug) {
    if (!slug) return false;
    const slugNormalizado = slug.toLowerCase().trim();
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('comercios')
        .select('id')
        .eq('slug', slugNormalizado)
        .maybeSingle();

      if (error) {
        console.warn("Erro ao consultar slug:", error.message);
        return true;
      }
      return !data;
    }
    return true;
  },

  async getTenant(slug) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/tenant-manager?slug=${slug}&t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Estabelecimento não encontrado.");
    return data;
  },

  async getTenantPorUsuario(userId) {
    if (!userId) return null;
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('comercios')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn("Aviso ao buscar loja do usuário:", error.message);
        return null;
      }
      return data;
    }
    return null;
  },

  async cadastrarTenant(payload) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/tenant-manager`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao cadastrar estabelecimento.");
    return data;
  },

  async atualizarTenant(payload) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/tenant-manager`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao atualizar dados.");
    return data;
  },

  async listarPromocoes(slug) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/promocoes?slug=${slug}&t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao carregar promoções.");
    return data;
  },

  async criarPromocao(dados) {
    let imagemFinalUrl = "";

    if (dados.imagem_base64 && dados.imagem_base64.startsWith('data:image')) {
      const base64Data = dados.imagem_base64.replace(/^data:image\/\w+;base64,/, '');
      const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `promocoes/${dados.slug}_${Date.now()}.png`;

      const { error: upErr } = await supabaseClient.storage
        .from('public-uploads')
        .upload(fileName, bytes, { contentType: 'image/png', upsert: true });

      if (!upErr) {
        const { data: pubData } = supabaseClient.storage.from('public-uploads').getPublicUrl(fileName);
        imagemFinalUrl = pubData.publicUrl;
      }
    }

    const { data: comercioData } = await supabaseClient
      .from('comercios')
      .select('id')
      .eq('slug', dados.slug)
      .single();

    if (!comercioData) throw new Error("Estabelecimento não encontrado.");

    const { data, error } = await supabaseClient
      .from('promocoes')
      .insert([{
        comercio_id: comercioData.id,
        comercio_slug: dados.slug,
        titulo: dados.titulo,
        descricao: dados.descricao,
        validade: dados.validade,
        imagem_url: imagemFinalUrl
      }])
      .select().single();

    if (error) throw error;

    await this.dispararPushParaLoja(dados.slug, dados.titulo, dados.descricao, dados.app_url);

    return data;
  },

  async deletarPromocao(slug, senha, id) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/promocoes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, senha, id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao excluir promoção.");
    return data;
  },

  async obterPontos(slug, deviceId) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade?acao=pontos&slug=${slug}&device_id=${deviceId}&t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao carregar pontos.");
    return data;
  },

  async listarPremios(slug) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade?acao=premios&slug=${slug}&t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao carregar catálogo de prêmios.");
    return data;
  },

  async criarPremio(payload) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "criar_premio", ...payload })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao criar prêmio.");
    return data;
  },

  async deletarPremio(slug, senha, id) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, senha, id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao deletar prêmio.");
    return data;
  },

  async processarNotaFiscal(slug, deviceId, urlNota) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "processar_nota", slug, device_id: deviceId, url_nota: urlNota })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao validar cupom fiscal.");
    return data;
  },

  async resgatarPremio(slug, deviceId, premioId) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "resgatar", slug, device_id: deviceId, premio_id: premioId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao resgatar item.");
    return data;
  },

  async vincularCpf(slug, deviceId, cpf) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "vincular_cpf", slug, device_id: deviceId, cpf })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao vincular CPF.");
    return data;
  },

  async salvarInscricaoPush(comercioSlug, deviceId, subscriptionObj) {
    try {
      const { error } = await supabaseClient
        .from('push_subscriptions')
        .upsert({
          comercio_slug: comercioSlug,
          device_id: deviceId,
          subscription: subscriptionObj
        }, { onConflict: 'comercio_slug,device_id' });

      if (error) console.warn("Erro ao salvar push no Supabase:", error.message);
    } catch (e) {
      console.warn("Exceção ao salvar push:", e);
    }
  },

  async dispararPushParaLoja(slugLoja, tituloPromo, descricaoPromo, appUrl) {
    try {
      const res = await fetch(`${BASE_FUNCTIONS_URL}/disparar-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slugLoja,
          titulo: tituloPromo,
          descricao: descricaoPromo,
          app_url: appUrl
        })
      });
      const data = await res.json();
      console.log("Notificação nativa disparada com sucesso:", data);
    } catch (e) {
      console.warn("Erro ao disparar push:", e);
    }
  }
};