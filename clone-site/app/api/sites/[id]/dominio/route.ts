// Domínio próprio de um site: GET estado (e instruções), PUT { dominio } grava e, com a hospedagem conectada,
// cadastra no serviço e devolve a verificação; DELETE remove (também da hospedagem).
import { ErroDePedido } from "@/lib/gerador";
import { definirDominio, obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { cadastrarDominio, estadoDominio, hostDoServico, removerDominio, renderConectado } from "@/lib/render";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";
import { enderecoPublico } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

/** O host que o CNAME deve apontar: o do serviço na hospedagem, ou o endereço público do app, ou o da própria requisição. */
async function alvoCname(req: Request): Promise<string> {
  const doServico = renderConectado() ? await hostDoServico() : null;
  if (doServico) return doServico;
  const publico = enderecoPublico();
  if (publico) { try { return new URL(publico).hostname; } catch { /* segue */ } }
  return (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
}

async function estado(req: Request, dominio?: string) {
  const conectado = renderConectado();
  const base = { hospedagemConectada: conectado, alvoCname: await alvoCname(req) };
  if (!dominio) return { ...base, dominio: null, cadastrado: false, verificado: false };
  if (!conectado) return { ...base, dominio, cadastrado: false, verificado: false };
  try {
    const e = await estadoDominio(dominio);
    return { ...base, dominio, cadastrado: e.cadastrado, verificado: e.verificado, alvoCname: e.alvoCname ?? base.alvoCname };
  } catch (err) {
    return { ...base, dominio, cadastrado: false, verificado: false, aviso: err instanceof Error ? err.message : "Não foi possível consultar a hospedagem." };
  }
}

export async function GET(req: Request, { params }: RouteContext<"/api/sites/[id]/dominio">) {
  const { id } = await params;
  const projeto = obter(id);
  if (!projeto) return respostaErroSites(new ProjetoNaoEncontrado());
  return Response.json(await estado(req, projeto.dominio));
}

export async function PUT(req: Request, { params }: RouteContext<"/api/sites/[id]/dominio">) {
  const { id } = await params;
  try {
    const corpo = await corpoJson(req);
    const projeto = definirDominio(id, corpo.dominio);
    if (!projeto.dominio) throw new ErroDePedido("Informe o domínio.");
    let aviso: string | undefined;
    if (renderConectado()) {
      try {
        await cadastrarDominio(projeto.dominio);
      } catch (err) {
        aviso = err instanceof Error ? err.message : "Não foi possível cadastrar na hospedagem; faça o passo 2 à mão.";
      }
    }
    const e = await estado(req, projeto.dominio);
    return Response.json({ ...e, projeto, aviso: aviso ?? (e as { aviso?: string }).aviso });
  } catch (err) {
    return respostaErroSites(err);
  }
}

export async function DELETE(req: Request, { params }: RouteContext<"/api/sites/[id]/dominio">) {
  const { id } = await params;
  try {
    const anterior = obter(id);
    if (!anterior) throw new ProjetoNaoEncontrado();
    const projeto = definirDominio(id, null);
    if (anterior.dominio && renderConectado()) await removerDominio(anterior.dominio);
    return Response.json({ ...(await estado(req)), projeto });
  } catch (err) {
    return respostaErroSites(err);
  }
}
