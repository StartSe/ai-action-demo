// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, type Integracao, type Opcao } from "./setup-comum";
import { opcoesDeVoz, type VozDisponivel } from "./vozes";
import { testarPesquisa, URL_MCP_PADRAO } from "./pesquisa-cliente";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que conduz a entrevista e escreve o scorecard" });

const VOICE_ID_PADRAO = "EXAVITQu4vr4xnSDxMaL";

// Pesquisa do candidato na web pelo servidor MCP remoto da Bright Data. O endereço e o modo avançado
// ficam em Opções avançadas; como o serviço autentica pelo endereço, quem monta a conexão de verdade é
// lib/pesquisa-cliente.ts — aqui só ficam os campos e o teste.
const BRIGHTDATA: Integracao = {
  id: "brightdata",
  titulo: "Pesquisa de candidatos na web",
  beneficio: "Encontra o perfil público do candidato para completar a ficha",
  descricao:
    "Procura o candidato na web pela Bright Data e usa o que é público (perfil profissional, portfólio, publicações, notícias) para completar a ficha. Opcional: sem ela, a ficha fica só com o que veio do currículo.",
  notaConexao:
    "Exige uma conta na Bright Data. Sem isso o app continua funcionando: a ficha do candidato fica só com o que veio do currículo.",
  obrigatoria: false,
  link: { url: "https://brightdata.com/cp/setting/users", rotulo: "Obter o token da Bright Data" },
  campos: [
    {
      chave: "BRIGHTDATA_API_TOKEN",
      rotulo: "Token da Bright Data",
      tipo: "secret",
      placeholder: "•••••••••••••••••",
      ajuda: "Fica em Settings › API tokens, dentro da sua conta da Bright Data.",
    },
    {
      chave: "BRIGHTDATA_MCP_URL",
      rotulo: "Endereço do serviço de pesquisa",
      tipo: "text",
      opcional: true,
      avancado: true,
      padrao: URL_MCP_PADRAO,
      ajuda: "O app inclui pro=1 automaticamente para habilitar as ações de enriquecimento. Só mude o endereço se a Bright Data indicar outro.",
    },
  ],
  testar: testarPesquisa,
};

const ELEVENLABS_VOZ: Integracao = {
  id: "elevenlabs",
  titulo: "Voz da entrevistadora",
  beneficio: "Dá uma voz natural à entrevistadora durante a conversa",
  descricao:
    "Dá à entrevistadora uma voz natural para falar as perguntas em voz alta durante a conversa, pela ElevenLabs. Sem essa chave, a voz é a do próprio navegador do candidato.",
  notaConexao: "Exige uma conta na ElevenLabs. A entrevista funciona sem isso: a voz fica a do navegador do candidato.",
  obrigatoria: false,
  link: { url: "https://elevenlabs.io/app/settings/api-keys", rotulo: "Obter a chave da ElevenLabs" },
  campos: [
    { chave: "ELEVENLABS_API_KEY", rotulo: "Chave da ElevenLabs", tipo: "secret", placeholder: "sk_...", ajuda: "Fica em Settings › API Keys, dentro da sua conta da ElevenLabs." },
    {
      chave: "ELEVENLABS_VOICE_ID",
      rotulo: "Voz",
      tipo: "select",
      opcional: true,
      padrao: VOICE_ID_PADRAO,
      ajuda: "Salve a chave para carregar as vozes. Português do Brasil aparece primeiro; selecione uma voz e salve novamente.",
      opcoes: [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }],
      opcoesDinamicas: async (config): Promise<Opcao[]> => {
        const chave = config.ELEVENLABS_API_KEY;
        if (!chave) return [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }];
        try {
          const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": chave }, signal: AbortSignal.timeout(8000) });
          if (!r.ok) return [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }];
          const data = (await r.json()) as { voices?: VozDisponivel[] };
          const vozes = data.voices || [];
          if (!vozes.length) return [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }];
          return opcoesDeVoz(vozes);
        } catch {
          return [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }];
        }
      },
    },
  ],
  testar: async (config) => {
    const chave = config.ELEVENLABS_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const r = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": chave } });
    if (r.status === 401) return { ok: false, mensagem: "A chave foi recusada. Confira se copiou a chave inteira e salve de novo." };
    if (!r.ok) { console.error("Teste da ElevenLabs:", r.status); return { ok: false, mensagem: "A ElevenLabs não respondeu agora. Tente de novo em um minuto." }; }
    const data = (await r.json()) as { subscription?: { tier?: string; character_count?: number; character_limit?: number } };
    const tier = data.subscription?.tier || "desconhecido";
    const restantes = (data.subscription?.character_limit ?? 0) - (data.subscription?.character_count ?? 0);
    return { ok: true, mensagem: `Conectado. Plano ${tier}, com ${restantes} caracteres de voz restantes.` };
  },
};

// Somente as conexões usadas no fluxo de entrevista por link.
export const INTEGRACOES: Integracao[] = [OPENROUTER, ELEVENLABS_VOZ, BRIGHTDATA];
