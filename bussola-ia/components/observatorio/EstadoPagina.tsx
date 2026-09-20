import Link from "next/link";
import type { ReactNode } from "react";
import { Icone, type NomeIcone } from "./Icone";
export function EstadoPagina({ titulo, descricao, rotulo = "UM NOVO OLHAR COMEÇA COM VOCÊ", icone = "compass", children }: { titulo: string; descricao: string; rotulo?: string; icone?: NomeIcone; children?: ReactNode }) {
  return <div className="observatorio public-assessment state-page"><header className="public-header"><div className="public-brand"><Icone nome="compass" size={27} /> bússola</div><span>INOVAÇÃO + INTELIGÊNCIA</span></header><main className="state-main"><span className="state-orbit" aria-hidden="true"><Icone nome={icone} size={44} /></span><p className="eyebrow">{rotulo}</p><h1>{titulo}</h1><p>{descricao}</p>{children && <div className="state-actions">{children}</div>}</main><footer className="state-footer">BÚSSOLA <span>/</span> clareza para transformar.</footer></div>;
}
export function ResultadoIndisponivel() {
  return <EstadoPagina titulo="Este link não existe mais" descricao="O resultado pode ter expirado ou o endereço está incorreto. Consulte seu histórico ou crie um novo assessment para continuar." rotulo="UM CAMINHO PARA CONTINUAR"><Link href="/historico" className="obs-btn primary">Consultar histórico <Icone nome="arrow" size={16} /></Link><Link href="/" className="obs-btn secondary">Voltar para o início</Link></EstadoPagina>;
}
