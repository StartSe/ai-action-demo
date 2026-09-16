// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { NOTIFICACOES, openrouter, type Integracao, type Opcao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que escreve os posts" });

const MODELOS_IMAGEM: Opcao[] = [
  { valor: "gpt-image-1", rotulo: "gpt-image-1 (padrão, mais qualidade)" },
  { valor: "gpt-image-1-mini", rotulo: "gpt-image-1-mini (mais rápido e barato)" },
];

export const OPENAI_IMAGENS: Integracao = {
  id: "openai",
  titulo: "Imagens dos posts (OpenAI)",
  beneficio: "Cria a imagem de cada post no formato da rede",
  descricao: "Gera a foto ou ilustração de cada post automaticamente a partir da ideia central, no formato certo para cada rede. Sem essa chave, o app cria um cartaz simples localmente, com o texto em destaque.",
  obrigatoria: false,
  link: { url: "https://platform.openai.com/api-keys", rotulo: "Obter a chave da OpenAI" },
  campos: [
    { chave: "OPENAI_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "sk-...", ajuda: "Fica em API keys, dentro do painel da OpenAI." },
    { chave: "OPENAI_IMAGE_MODEL", rotulo: "Modelo de imagem", tipo: "select", opcional: true, avancado: true, padrao: "gpt-image-1", opcoes: MODELOS_IMAGEM },
  ],
  testar: async (config) => {
    const chave = config.OPENAI_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const modelo = config.OPENAI_IMAGE_MODEL || "gpt-image-1";
    let r: Response;
    try {
      r = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(modelo)}`, { headers: { Authorization: `Bearer ${chave}` } });
    } catch (err) {
      console.error("OpenAI (teste de chave): falha de rede", err);
      return { ok: false, mensagem: "Não foi possível falar com a OpenAI. Confira a conexão do servidor e tente de novo." };
    }
    if (r.status === 401) return { ok: false, mensagem: "Chave inválida." };
    if (r.status === 404) return { ok: false, mensagem: "Esta chave não tem acesso ao modelo de imagem escolhido. Troque o modelo em Opções avançadas." };
    if (!r.ok) {
      console.error("OpenAI (teste de chave)", r.status, (await r.text().catch(() => "")).slice(0, 200));
      return { ok: false, mensagem: "A OpenAI não confirmou a chave agora. Confira a chave e tente de novo em um minuto." };
    }
    return { ok: true, mensagem: "Conectado. Geração de imagens disponível." };
  },
};

/** Por onde chegam os rascunhos semanais (rotina "Rascunhos semanais de posts") com o link para aprovar. */
const AVISOS: Integracao = { ...NOTIFICACOES, beneficio: "Entrega os rascunhos da semana com o link para aprovar" };

/** Webhook de saída (uma URL única, como o do Slack): cada post aprovado pode ser enviado ao Zapier ou ao Make,
 * que publica na rede ou agenda no gerenciador que a empresa já usa. O corpo enviado é sempre
 * { rede, texto, hashtags, horario, imagem } (ver lib/publicacao.ts). */
export const PUBLICACAO: Integracao = {
  id: "publicacao",
  titulo: "Programar publicação (Zapier ou Make)",
  beneficio: "Manda o post pronto para quem publica de verdade",
  descricao: "Cole o endereço do gatilho criado no Zapier ('Webhooks by Zapier' → 'Catch Hook') ou no Make ('Webhooks' → 'Custom webhook'). Ao clicar em 'Programar publicação' num post, o app envia rede, texto, hashtags, melhor horário e a imagem para esse endereço.",
  obrigatoria: false,
  link: { url: "https://zapier.com/apps/webhook/integrations", rotulo: "Criar o gatilho no Zapier" },
  campos: [
    { chave: "PUBLICACAO_WEBHOOK_URL", rotulo: "Endereço do gatilho", tipo: "secret", placeholder: "https://hooks.zapier.com/hooks/catch/...", ajuda: "O Zapier e o Make mostram esse endereço ao criar o gatilho." },
  ],
  testar: async (config) => {
    const url = config.PUBLICACAO_WEBHOOK_URL;
    if (!url) return { ok: false, mensagem: "Nenhum endereço salvo ainda." };
    if (!/^https:\/\//i.test(url)) return { ok: false, mensagem: "O endereço precisa começar com https://." };
    let r: Response;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teste: true, rede: "linkedin", texto: "Teste de conexão do Posts em Minutos.", hashtags: [], horario: "", imagem: null }),
      });
    } catch (err) {
      console.error("Publicação (teste do webhook): falha de rede", err);
      return { ok: false, mensagem: "Não foi possível alcançar o endereço. Confira a URL e tente de novo." };
    }
    if (!r.ok) {
      console.error("Publicação (teste do webhook)", r.status, (await r.text().catch(() => "")).slice(0, 200));
      return { ok: false, mensagem: "O endereço não aceitou o envio de teste. Confira a URL do gatilho no Zapier ou no Make." };
    }
    return { ok: true, mensagem: "Conectado. O Zapier ou o Make recebeu um envio de teste." };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, OPENAI_IMAGENS, AVISOS, PUBLICACAO];
