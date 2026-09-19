import { CulturaEmpresa } from "@/components/CulturaEmpresa";
import { DadosDeExemplo } from "@/components/DadosDeExemplo";
import { SetupPage } from "@/components/setup";
import { version } from "@/package.json";

export default function Page() {
  return (
    <SetupPage versao={version} marca="E" nome="Entrevistadora IA" area="Recursos Humanos" segmento="RH" extras={{ openrouter: <DadosDeExemplo /> }}>
      <CulturaEmpresa />
    </SetupPage>
  );
}
