const PROJECT_REF = "uskfiencjaqqlhglpuqt";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = "sb_publishable_31CDkXjDETBd12KK8yhW3w_hmyQZBqO";
const BASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

let supabaseClient = null;
if (typeof supabase !== 'undefined') {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (supabaseClient) {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return headers;
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

  async getTenantPorUsuario(userId) {
    if (!userId) return null;
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('comercios')
        .select('id, slug, nome_fantasia, cnpj, cor_primaria, cor_secundaria, cor_destaque, logo_url, icone_pwa_url, user_id')
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
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_FUNCTIONS_URL}/tenant-manager`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao cadastrar estabelecimento.");
    return data;
  },

  async listarPromocoes(slug) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/promocoes?slug=${slug}&t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao carregar promoções.");
    return data;
  },

  async criarPromocao(dados) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_FUNCTIONS_URL}/promocoes`, {
      method: "POST",
      headers,
      body: JSON.stringify(dados)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao publicar promoção.");
    return data.promocao;
  },

  async deletarPromocao(slug, id) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_FUNCTIONS_URL}/promocoes`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ slug, id })
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
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers,
      body: JSON.stringify({ acao: "criar_premio", ...payload })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao criar prêmio.");
    return data;
  },

  async gerarQrPontuacao(slug) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers,
      body: JSON.stringify({ acao: "gerar_qr_pontuacao", slug })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao gerar QR Code de pontuação.");
    return data;
  },

  async deletarPremio(slug, senha, id) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ slug, id })
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

      if (error) throw new Error(`Não foi possível registrar o dispositivo para push: ${error.message}`);
    } catch (e) {
      console.error("Erro ao salvar push:", e);
      throw e;
    }
  },

};