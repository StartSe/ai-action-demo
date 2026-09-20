import Link from "next/link";
import { EstadoPagina } from "@/components/observatorio/EstadoPagina";
import { Icone } from "@/components/observatorio/Icone";
export default function NotFound() {
  return (
    <EstadoPagina
      titulo="Este caminho ainda não existe."
      descricao="Confira o endereço ou volte ao seu observatório para continuar explorando."
      rotulo="404 / PÁGINA NÃO ENCONTRADA"
    >
      <Link href="/" className="obs-btn primary">
        Voltar para o início <Icone nome="arrow" size={16} />
      </Link>
    </EstadoPagina>
  );
}
