import { PesquisaEditor } from "@/components/Pesquisa";
import { SetupPage } from "@/components/setup";
export default function Page() {
  return (
    <SetupPage
      marca="R"
      nome="Radar de Sinais"
      area="Estratégia"
      segmento="Estratégia"
    >
      <PesquisaEditor modo="fontes" />
    </SetupPage>
  );
}
