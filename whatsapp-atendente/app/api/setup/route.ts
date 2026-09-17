// Divergência de propósito em relação a pdi-time (registrada em scripts/padrao-excecoes.json): depois
// de salvar as três credenciais da z-api, este app cadastra sozinho, na instância, o endereço por onde
// a z-api avisa que chegou mensagem ou que o número conectou/caiu. Sem isso a pessoa teria que copiar
// um endereço à mão no painel da z-api — exatamente o que esta rodada tirou do caminho dela.
import { INTEGRACOES } from "@/lib/integracoes";
import { baseUrl, statusIntegracoes } from "@/lib/setup-comum";
import { setConfig } from "@/lib/store";
import { configurarWebhooks, credenciais } from "@/lib/zapi";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await statusIntegracoes(INTEGRACOES));
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

  return Response.json({ salvos, avisoConexao, ...(await statusIntegracoes(INTEGRACOES)) });
}
