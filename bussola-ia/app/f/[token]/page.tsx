// Tela pública mínima de um formulário (sem Topbar completa): marca do app, título, campos e "Enviar".
// Copie este arquivo (e FormularioPublico.tsx) para cada app sem alterar; o conteúdo vem inteiro do
// que o app gravou em lib/formularios.ts (criar).
import { EstadoPagina } from "@/components/observatorio/EstadoPagina";
import type { ParametrosPublicos } from "@/lib/formularios";
import { expirou, obter, contarRespostas } from "@/lib/formularios";
import { FormularioPublico } from "./FormularioPublico";

export const dynamic = "force-dynamic";

export default async function Page({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const formulario = obter<ParametrosPublicos>(token);

  if (!formulario) {
    return <EstadoPagina titulo="Este link não existe" descricao="Confira se o endereço foi copiado corretamente, ou peça um novo link a quem enviou este formulário." />;
  }

  if (expirou(formulario)) {
    return <EstadoPagina titulo="Este link expirou" descricao="Peça um novo link a quem enviou este formulário." />;
  }

  const noLimite = formulario.limite !== null && contarRespostas(token) >= formulario.limite;
  if (noLimite) {
    return <EstadoPagina titulo="Este formulário não recebe mais respostas" descricao="O limite de respostas deste link já foi atingido." />;
  }

  const { marca, nome, titulo, descricao, agradecimento } = formulario.parametros;
  return <FormularioPublico token={token} marca={marca} nome={nome} titulo={titulo} descricao={descricao} agradecimento={agradecimento} campos={formulario.campos} />;
}
