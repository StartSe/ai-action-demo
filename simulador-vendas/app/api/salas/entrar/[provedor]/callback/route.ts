// Volta do Google / da Microsoft com a identificação do vendedor (US-013).
//
// O endereço **não tem o código da simulação dentro**, e isso é de propósito: os dois provedores exigem
// que o `redirect_uri` esteja registrado caractere a caractere, e um endereço por treino seria
// impossível de cadastrar. O código viaja no `state` e volta intacto; o trecho aleatório do `state` é
// conferido contra o cookie, que é o que impede alguém de forjar a volta.
//
// Nenhum token do provedor é guardado: o `id_token` é lido em memória para saber nome e e-mail, o
// participante é criado (ou reconhecido pelo e-mail) e o acesso é descartado. O que fica no navegador é
// o cookie próprio do app (`sv_sessao`).
import { ehProvedor, identificarPeloCodigo, lerState, ErroEntrada } from "@/lib/entrar-vendedor";
import { garantir } from "@/lib/participantes";
import { cookieSessaoVendedor, ehSeguro, lerCookie } from "@/lib/sessao-vendedor";
import { baseUrl } from "@/lib/setup-comum";
import { obter as obterSimulacao } from "@/lib/simulacoes";

export async function GET(req: Request, { params }: RouteContext<"/api/salas/entrar/[provedor]/callback">) {
  const { provedor } = await params;
  const url = new URL(req.url);
  const base = baseUrl(req);
  const cabecalho = req.headers.get("cookie");
  const verifier = lerCookie(cabecalho, "sv_verifier");
  const aleatorioEsperado = lerCookie(cabecalho, "sv_state");

  const lido = lerState(url.searchParams.get("state") || "");
  const codigo = lido?.codigo;

  const voltar = (erro?: string, setCookie?: string) => {
    const destino = codigo ? `${base}/simular/${codigo}` : `${base}/`;
    const headers = new Headers({ Location: erro ? `${destino}?erro=${encodeURIComponent(erro)}` : destino });
    headers.append("Set-Cookie", "sv_verifier=; Path=/; Max-Age=0");
    headers.append("Set-Cookie", "sv_state=; Path=/; Max-Age=0");
    if (setCookie) headers.append("Set-Cookie", setCookie);
    return new Response(null, { status: 302, headers });
  };

  if (!ehProvedor(provedor)) return voltar("Essa forma de entrar não existe. Informe seu nome e e-mail para começar.");

  const erroProvedor = url.searchParams.get("error");
  if (erroProvedor) {
    console.error("Provedor recusou a identificação do vendedor", provedor, erroProvedor, url.searchParams.get("error_description"));
    return voltar("Você não concluiu a entrada. Informe seu nome e e-mail para começar.");
  }

  const code = url.searchParams.get("code");
  if (!code || !codigo || !verifier || !aleatorioEsperado || lido.aleatorio !== aleatorioEsperado) {
    return voltar("Sua entrada demorou demais e expirou. Tente de novo ou informe seu nome e e-mail.");
  }
  if (!obterSimulacao(codigo)) return voltar("Este link de treino não está mais disponível.");

  try {
    const { nome, email } = await identificarPeloCodigo({ provedor, base, code, verifier });
    const participante = garantir({ nome, email, origem: provedor });
    return voltar(undefined, cookieSessaoVendedor({ participanteId: participante.id, seguro: ehSeguro(base) }));
  } catch (err) {
    if (err instanceof ErroEntrada) return voltar(err.message);
    console.error("Falha ao identificar o vendedor", err);
    return voltar("Não conseguimos confirmar sua conta agora. Informe seu nome e e-mail para começar.");
  }
}
