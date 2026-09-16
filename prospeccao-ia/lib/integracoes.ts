// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { MCP_CRM, NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que escreve a abordagem de cada lead" });

// Título sem nome de fornecedor (o cartão é "o que isso faz por você"); a Apollo aparece na descrição
// e no link, que é onde a pessoa precisa saber onde criar a conta.
export const APOLLO: Integracao = {
  id: "apollo",
  titulo: "Busca de leads",
  descricao: "Traz contatos reais (nome, cargo, empresa e LinkedIn) da base da Apollo.io a partir do perfil de cliente ideal. Sem ela, o app mostra leads fictícios.",
  beneficio: "Troca os leads de exemplo por contatos reais do seu mercado",
  obrigatoria: false,
  link: { url: "https://app.apollo.io/#/settings/integrations/api", rotulo: "Criar conta e obter a chave na Apollo" },
  campos: [{ chave: "APOLLO_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "•••••••••••••••••", ajuda: "Fica em Settings › Integrations › API, dentro da sua conta da Apollo." }],
  testar: async (config) => {
    const chave = config.APOLLO_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    let r: Response;
    try {
      r = await fetch("https://api.apollo.io/api/v1/auth/health", { headers: { "x-api-key": chave } });
    } catch (err) {
      console.error("Apollo: falha de rede no teste de conexão", err);
      return { ok: false, mensagem: "A busca de leads não respondeu; tente de novo em um minuto." };
    }
    if (r.status === 401 || r.status === 403) return { ok: false, mensagem: "A chave foi recusada. Copie de novo em Settings › Integrations › API." };
    if (!r.ok) {
      console.error("Apollo: teste de conexão recusado", r.status);
      return { ok: false, mensagem: "A busca de leads não respondeu; tente de novo em um minuto." };
    }
    // O endereço de saúde devolve sucesso mesmo com chave inválida; quem indica se autenticou é "is_logged_in".
    const data = (await r.json().catch(() => ({}))) as { is_logged_in?: boolean };
    if (!data.is_logged_in) return { ok: false, mensagem: "A chave foi recusada. Copie de novo em Settings › Integrations › API." };
    return { ok: true, mensagem: "Conectado. A próxima busca traz contatos reais." };
  },
};

// A zona fica em "Opções avançadas" com o padrão já preenchido: o cartão principal pede só a chave.
export const BRIGHTDATA: Integracao = {
  id: "brightdata",
  titulo: "Enriquecimento com o site do lead",
  descricao: "Lê o site da empresa do lead pela Bright Data para a abordagem citar algo concreto de lá. Opcional: sem ela, a abordagem usa só o sinal do lead.",
  beneficio: "Deixa a abordagem mais específica, com algo do site da empresa",
  obrigatoria: false,
  link: { url: "https://brightdata.com/cp/zones", rotulo: "Criar conta e gerar a chave na Bright Data" },
  campos: [
    { chave: "BRIGHTDATA_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "•••••••••••••••••", ajuda: "Fica no topo do painel da Bright Data, junto com a lista de zonas." },
    { chave: "BRIGHTDATA_ZONE", rotulo: "Zona", tipo: "text", opcional: true, avancado: true, padrao: "web_unlocker1", ajuda: "Só mude se você criou a zona com outro nome no painel da Bright Data." },
  ],
  testar: async (config) => {
    const chave = config.BRIGHTDATA_API_KEY;
    const zona = config.BRIGHTDATA_ZONE || "web_unlocker1";
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    let r: Response;
    try {
      r = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
        body: JSON.stringify({ zone: zona, url: "https://example.com", format: "raw" }),
      });
    } catch (err) {
      console.error("Bright Data: falha de rede no teste de conexão", err);
      return { ok: false, mensagem: "O enriquecimento não respondeu; tente de novo em um minuto." };
    }
    if (r.status === 401 || r.status === 403) return { ok: false, mensagem: "A chave foi recusada. Copie de novo no painel da Bright Data." };
    if (!r.ok) {
      console.error("Bright Data: teste de conexão recusado", r.status);
      return { ok: false, mensagem: `A leitura de sites não funcionou com a zona “${zona}”. Confira o nome da zona em Opções avançadas.` };
    }
    return { ok: true, mensagem: "Conectado. A próxima abordagem pode citar o site do lead." };
  },
};

const CRM: Integracao = {
  ...MCP_CRM,
  beneficio: "Manda o lead aprovado direto para onde o time trabalha",
};

const AVISOS: Integracao = {
  ...NOTIFICACOES,
  beneficio: "Entrega os leads novos da semana a quem cuida das vendas",
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, APOLLO, BRIGHTDATA, AVISOS, CRM];
