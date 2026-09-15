import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requireOwner = async (slug: string) => {
      const authorization = req.headers.get('Authorization');
      if (!authorization?.startsWith('Bearer ')) throw new Error('Autenticação obrigatória.');
      const authClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } });
      const { data: authData, error: authError } = await authClient.auth.getUser();
      if (authError || !authData.user) throw new Error('Sessão inválida.');
      const { data: owner } = await supabase.from('comercios').select('id').eq('slug', slug.toLowerCase()).eq('user_id', authData.user.id).single();
      if (!owner) throw new Error('Sem permissão para esta loja.');
    };

    const url = new URL(req.url);

    // 1. LISTAR PROMOÇÕES
    if (req.method === 'GET') {
      const slug = url.searchParams.get('slug');
      if (!slug) throw new Error("Identificador da loja ausente.");

      const { data: comercio } = await supabase
        .from('comercios')
        .select('id')
        .eq('slug', slug.toLowerCase())
        .single();

      if (!comercio) throw new Error("Estabelecimento não encontrado.");

      const { data, error } = await supabase
        .from('promocoes')
        .select('*')
        .eq('comercio_id', comercio.id)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. CRIAR PROMOÇÃO E DISPARAR PUSH SEGMENTADO
    if (req.method === 'POST') {
      const { slug, titulo, descricao, validade, imagem_base64, app_url } = await req.json();
      if (!slug || !titulo || !descricao || !validade) {
        throw new Error("Campos obrigatórios ausentes: slug, título, descrição e validade.");
      }
      await requireOwner(slug);

      const { data: comercio } = await supabase
        .from('comercios')
        .select('*')
        .eq('slug', slug.toLowerCase())
        .single();

      if (!comercio) throw new Error("Comércio não encontrado.");
      let imagem_url: string | null = null;
      if (imagem_base64 && imagem_base64.startsWith('data:image')) {
        const base64Data = imagem_base64.replace(/^data:image\/\w+;base64,/, '');
        const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const fileName = `promos/${slug.toLowerCase()}_${Date.now()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('public-uploads')
          .upload(fileName, bytes, { contentType: 'image/jpeg', upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from('public-uploads')
          .getPublicUrl(fileName);
        imagem_url = publicData.publicUrl;
      }

      const { data, error } = await supabase
        .from('promocoes')
        .insert([{ comercio_id: comercio.id, titulo, descricao, validade, imagem_url }])
        .select()
        .single();

      if (error) throw error;

      const authorization = req.headers.get('Authorization');
      const pushResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/disparar-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {})
        },
        body: JSON.stringify({
          slug,
          titulo,
          descricao: `${descricao} (${validade})`,
          app_url
        })
      });
      if (!pushResponse.ok) {
        console.warn('Promoção criada, mas o disparo nativo falhou:', await pushResponse.text());
      }

      return new Response(JSON.stringify({ success: true, promocao: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. EXCLUIR PROMOÇÃO
    if (req.method === 'DELETE') {
      const { id, slug } = await req.json();
      await requireOwner(slug);

      const { data: comercio } = await supabase
        .from('comercios')
        .select('id')
        .eq('slug', slug.toLowerCase())
        .single();

      if (!comercio) throw new Error('Comércio não encontrado.');

      const { error } = await supabase
        .from('promocoes')
        .delete()
        .eq('id', id)
        .eq('comercio_id', comercio.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Método não permitido', { status: 405, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});