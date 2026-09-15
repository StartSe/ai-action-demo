// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { NOTIFICACOES, openrouter, type Integracao, type Opcao } from "./setup-comum";

const OPENROUTER = openrouter();

const MODELOS_IMAGEM: Opcao[] = [
  { valor: "gpt-image-1", rotulo: "gpt-image-1 (padrão, mais qualidade)" },
  { valor: "gpt-image-1-mini", rotulo: "gpt-image-1-mini (mais rápido e barato)" },
];

export const OPENAI_IMAGENS: Integracao = {
  id: "openai",
  titulo: "Imagens dos posts (OpenAI)",
  descricao: "Gera a foto ou ilustração de cada post automaticamente a partir da ideia central, no formato certo para cada rede. Sem essa chave, o app cria um cartaz simples localmente, com o texto em destaque.",
  obrigatoria: false,
  link: { url: "https://platform.openai.com/api-keys", rotulo: "Obter a chave da OpenAI" },
  campos: [
    { chave: "OPENAI_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "sk-...", ajuda: "Fica em API keys, dentro do painel da OpenAI." },
    { chave: "OPENAI_IMAGE_MODEL", rotulo: "Modelo de imagem", tipo: "select", opcional: true, padrao: "gpt-image-1", opcoes: MODELOS_IMAGEM },
  ],
  testar: async (config) => {
    const chave = config.OPENAI_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const r = await fetch("https://api.openai.com/v1/models/gpt-image-1", { headers: { Authorization: `Bearer ${chave}` } });
    if (r.status === 401) return { ok: false, mensagem: "Chave inválida." };
    if (!r.ok) return { ok: false, mensagem: `A OpenAI respondeu HTTP ${r.status}.` };
    return { ok: true, mensagem: "Conectado. Geração de imagens disponível." };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, OPENAI_IMAGENS, NOTIFICACOES];
