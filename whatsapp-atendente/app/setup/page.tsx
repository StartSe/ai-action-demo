import { ConexaoWhatsApp } from "@/components/ConexaoWhatsApp";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <SetupPage marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" segmento="Atendimento">
      <ConexaoWhatsApp />
    </SetupPage>
  );
}
