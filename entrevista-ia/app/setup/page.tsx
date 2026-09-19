import { CulturaEmpresa } from "@/components/CulturaEmpresa";
import { DadosDeExemplo } from "@/components/DadosDeExemplo";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <SetupPage marca="E" nome="Entrevistadora IA" area="Recursos Humanos" segmento="RH" extras={{ openrouter: <DadosDeExemplo /> }}>
      <CulturaEmpresa />
    </SetupPage>
  );
}
