// Divergência de propósito em relação a pdi-time (registrada em scripts/padrao-excecoes.json): depois
// de salvar as três credenciais da z-api, este app cadastra sozinho, na instância, o endereço por onde
// a z-api avisa que chegou mensagem ou que o número conectou/caiu. Sem isso a pessoa teria que copiar
// um endereço à mão no painel da z-api — exatamente o que esta rodada tirou do caminho dela.
import { COM_CARTAO_PROPRIO, GENERICAS, INTEGRACOES } from "@/lib/integracoes";
import { baseUrl, integracaoConfigurada, statusIntegracoes } from "@/lib/setup-comum";
import { setConfig } from "@/lib/store";
import { configurarWebhooks, credenciais } from "@/lib/zapi";

export const dynamic = "force-dynamic";

/**
 * A resposta desta rota, para o GET e para o PUT. O cartão do WhatsApp sai de `integracoes` (a lista que
 * `components/setup.tsx` desenha) e vai para `comCartaoProprio`, porque quem o desenha é
 * `components/ConexaoWhatsApp.tsx` — que lê os campos daqui para não importar nada de `lib/setup-comum`
 * (um componente varrido por scripts/verificar-jargao.mjs não pode importar de um caminho com "setup" no
 * nome, ver CLAUDE.md/US-007). `pronto` continua sendo calculado sobre TODAS as integrações, para não
 * divergir do selo que o `/api/status` mostra no cabeçalho.
 */
async function respostaSetup() {
  const genericas = await statusIntegracoes(GENERICAS);
  const proprias = await statusIntegracoes(COM_CARTAO_PROPRIO);
  return {
    ...genericas,
    comCartaoProprio: proprias.integracoes,
    pronto: INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada),
  };
}

export async function GET() {
  return Response.json(await respostaSetup());
}

/** Salva valores. Chave com valor "" é ignorada (mantém o atual); null apaga. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { valores?: Record<string, string | null> };
  const permitidas = new Set(INTEGRACOES.flatMap((i) => i.campos.map((c) => c.chave)));
  permitidas.add("APP_URL");
  const valores = body.valores || {};
  let salvos = 0;
  for (const [chave, valor] of Object.entries(valores)) {
    if (!permitidas.has(chave)) continue;
    if (valor === "") continue;
    setConfig(chave, valor);
    salvos++;
  }

  // Só quando as três credenciais já existem depois de salvar, e só quando este PUT mexeu em alguma
  // delas (salvar outro cartão não precisa falar com a z-api).
  const mexeuNaZapi = ["ZAPI_INSTANCE_ID", "ZAPI_TOKEN", "ZAPI_CLIENT_TOKEN"].some((c) => c in valores);
  let avisoConexao: string | undefined;
  if (mexeuNaZapi && credenciais()) {
    try {
      await configurarWebhooks(baseUrl(req));
    } catch (err) {
      console.error("Falha ao cadastrar os avisos da z-api:", err);
      avisoConexao =
        "Os valores foram salvos, mas não foi possível avisar a z-api sobre este app. A equipe técnica pode cadastrar o endereço à mão em \"Para a equipe técnica\", logo abaixo.";
    }
  }

  return Response.json({ salvos, avisoConexao, ...(await respostaSetup()) });
}
