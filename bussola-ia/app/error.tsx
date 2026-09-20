"use client";
import Link from "next/link";
import { EstadoPagina } from "@/components/observatorio/EstadoPagina";
export default function Error({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <EstadoPagina
      titulo="Vamos retomar o caminho."
      descricao="Não foi possível abrir esta tela agora. Tente novamente para continuar."
      rotulo="SEU OBSERVATÓRIO"
      icone="refresh"
    >
      <button className="obs-btn primary" onClick={retry}>
        Tentar novamente
      </button>
      <Link href="/" className="obs-btn secondary">
        Voltar para o início
      </Link>
    </EstadoPagina>
  );
}
