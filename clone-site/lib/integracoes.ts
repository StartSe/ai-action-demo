// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
// A IA é obrigatória (lê a captura e escreve a página); o serviço de captura é opcional e só serve para
// quem prefere colar o endereço do site em vez de enviar a imagem.
import { CHAVE_CAPTURA, urlDoServico } from "./captura";
import { openrouter, type Integracao } from "./setup-comum";

// O modelo que lê a captura decide a fidelidade da página, então não fica escondido no cartão genérico da
// IA: ele tem cartão próprio em /setup ("Qualidade da página gerada", components/QualidadePagina.tsx), com
// o teste de leitura de imagem ao lado. Por isso `visao` fica desligado aqui.
const OPENROUTER = openrouter({ beneficio: "Lê a captura e escreve a sua página" });

const CAPTURA: Integracao = {
  id: "captura",
  titulo: "Captura por endereço",
  descricao: "Com uma conta no ScreenshotOne, o app fotografa a página de referência sozinho: você cola o endereço do site e pula o passo de enviar a imagem.",
  beneficio: "Gera a página a partir do endereço do site, sem enviar imagem",
  obrigatoria: false,
  link: { url: "https://screenshotone.com", rotulo: "Criar uma conta gratuita" },
  campos: [
    {
      chave: CHAVE_CAPTURA,
      rotulo: "Chave de acesso",
      tipo: "secret",
      placeholder: "Cole a chave da sua conta",
      ajuda: "Fica na área da conta do serviço, em Access key.",
    },
  ],
  testar: async (config) => {
    const chave = config[CHAVE_CAPTURA];
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const r = await fetch(urlDoServico(chave, "https://example.com"), { signal: AbortSignal.timeout(90_000) }).catch(() => null);
    if (!r) return { ok: false, mensagem: "O serviço de captura não respondeu. Tente de novo em um minuto." };
    if (!r.ok) {
      console.error("Falha ao testar o serviço de captura:", r.status, (await r.text().catch(() => "")).slice(0, 200));
      if (r.status === 401 || r.status === 403) return { ok: false, mensagem: "A chave foi recusada. Confira se copiou a chave inteira." };
      if (r.status === 429) return { ok: false, mensagem: "As capturas do mês acabaram nesse serviço. Amplie o plano para continuar." };
      return { ok: false, mensagem: "O serviço não conseguiu fotografar a página de teste. Tente de novo em um minuto." };
    }
    return { ok: true, mensagem: "Conectado e testado com sucesso. Você já pode colar o endereço de um site." };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, CAPTURA];
