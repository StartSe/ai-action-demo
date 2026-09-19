// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { MCP_CRM, NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que escreve a abordagem de cada lead" });

// Título sem nome de fornecedor (o cartão é "o que isso faz por você"); a Apollo aparece na descrição
// e no link, que é onde a pessoa precisa saber onde criar a conta.
export const APOLLO: Integracao = {
  id: "apollo",
  titulo: "Busca de leads",
  descricao: "Fonte alternativa de contatos: traz nome, cargo, empresa e LinkedIn da base da Apollo.io a partir do perfil de cliente ideal. Sem ela, a pesquisa de mercado já encontra pessoas por fontes públicas.",
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

/** Testa uma zona da Bright Data com uma URL de exemplo, devolvendo um rótulo curto do resultado
 * ("conectada", "recusou a chave", "não respondeu", "não funcionou com a zona “x”") — nunca lança,
 * quem chama decide como combinar o resultado das duas zonas numa única mensagem. */
async function testarZona(zona: string, url: string, chave: string): Promise<{ ok: boolean; detalhe: string }> {
  let r: Response;
  try {
    r = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify({ zone: zona, url, format: "raw" }),
    });
  } catch (err) {
    console.error("Bright Data: falha de rede no teste de conexão", err);
    return { ok: false, detalhe: "não respondeu" };
  }
  if (r.status === 401 || r.status === 403) return { ok: false, detalhe: "recusou a chave" };
  if (!r.ok) {
    console.error("Bright Data: teste de conexão recusado", r.status, zona);
    return { ok: false, detalhe: `não funcionou com a zona “${zona}”` };
  }
  return { ok: true, detalhe: "conectada" };
}

// As zonas de busca e leitura ficam em "Opções avançadas" com o padrão já preenchido: o cartão
// principal pede só a chave. BRIGHTDATA_ZONE (campo único de antes desta história) não aparece mais
// aqui, mas continua funcionando como zona de leitura para quem já a configurou (lib/descoberta.ts).
export const BRIGHTDATA: Integracao = {
  id: "brightdata",
  titulo: "Pesquisa de mercado e sinais",
  descricao: "Encontra empresas, pessoas e sinais públicos de verdade para a prospecção, pela Bright Data. Sem ela, os resultados são fictícios.",
  beneficio: "Encontra empresas, pessoas e sinais públicos de verdade",
  obrigatoria: false,
  link: { url: "https://brightdata.com/cp/zones", rotulo: "Criar conta e gerar a chave na Bright Data" },
  campos: [
    { chave: "BRIGHTDATA_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "•••••••••••••••••", ajuda: "Fica no topo do painel da Bright Data, junto com a lista de zonas." },
    { chave: "BRIGHTDATA_ZONE_BUSCA", rotulo: "Zona de busca", tipo: "text", opcional: true, avancado: true, padrao: "serp_api1", ajuda: "Só mude se você criou a zona de busca com outro nome no painel da Bright Data." },
    { chave: "BRIGHTDATA_ZONE_LEITURA", rotulo: "Zona de leitura", tipo: "text", opcional: true, avancado: true, padrao: "web_unlocker1", ajuda: "Só mude se você criou a zona de leitura com outro nome no painel da Bright Data." },
    {
      chave: "BRIGHTDATA_TETO_CONSULTAS",
      rotulo: "Teto de consultas por prospecção",
      tipo: "text",
      opcional: true,
      avancado: true,
      padrao: "60",
      ajuda: "Quantas buscas e leituras uma prospecção pode fazer antes de parar para não consumir sua cota.",
    },
  ],
  testar: async (config) => {
    const chave = config.BRIGHTDATA_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const zonaBusca = config.BRIGHTDATA_ZONE_BUSCA || "serp_api1";
    const zonaLeitura = config.BRIGHTDATA_ZONE_LEITURA || config.BRIGHTDATA_ZONE || "web_unlocker1";
    const [busca, leitura] = await Promise.all([
      testarZona(zonaBusca, "https://www.google.com/search?q=teste&brd_json=1", chave),
      testarZona(zonaLeitura, "https://example.com", chave),
    ]);
    if (busca.ok && leitura.ok) return { ok: true, mensagem: "Conectado. A busca e a leitura de páginas estão funcionando." };
    return { ok: false, mensagem: `Busca: ${busca.detalhe}. Leitura: ${leitura.detalhe}. Confira as zonas em Opções avançadas.` };
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
