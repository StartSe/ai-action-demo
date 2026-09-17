// O painel de um treino (US-022). A tela é do navegador (a busca dos agregados e a troca de aba
// acontecem lá), então a página só resolve o código da rota e entrega a moldura.
import Painel from "./Painel";

export default async function Page({ params }: PageProps<"/resultados/[codigo]">) {
  const { codigo } = await params;
  return <Painel codigo={codigo} />;
}
