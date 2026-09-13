// Política de contratos da empresa: cadastrada uma vez em /setup (componente
// components/PoliticaContratos.tsx), usada por lib/contratos.ts para apontar, na análise,
// o que foge do que a empresa aceita ("Fora da política").
import { getConfig, setConfig } from "./store";

const CHAVE = "POLITICA_CONTRATOS";

export interface PoliticaContratos {
  multaMaximaPct: number | null;
  prazoMaximoMeses: number | null;
  avisoPrevioMinimoDias: number | null;
  foroPreferido: string;
  exigencias: { sla: boolean; protecaoDados: boolean; propriedadeProgressiva: boolean };
  textoLivre: string;
}

const PADRAO: PoliticaContratos = {
  multaMaximaPct: null,
  prazoMaximoMeses: null,
  avisoPrevioMinimoDias: null,
  foroPreferido: "",
  exigencias: { sla: false, protecaoDados: false, propriedadeProgressiva: false },
  textoLivre: "",
};

export function getPolitica(): PoliticaContratos {
  const bruto = getConfig(CHAVE);
  if (!bruto) return PADRAO;
  try {
    const salva = JSON.parse(bruto) as Partial<PoliticaContratos>;
    return { ...PADRAO, ...salva, exigencias: { ...PADRAO.exigencias, ...salva.exigencias } };
  } catch (err) {
    console.error("Falha ao ler a política de contratos", err);
    return PADRAO;
  }
}

export function salvarPolitica(p: PoliticaContratos): void {
  setConfig(CHAVE, JSON.stringify(p));
}

/** Se nada foi preenchido, a política ainda não existe de fato: não há o que comparar na análise. */
export function politicaCadastrada(p: PoliticaContratos): boolean {
  return (
    p.multaMaximaPct != null ||
    p.prazoMaximoMeses != null ||
    p.avisoPrevioMinimoDias != null ||
    Boolean(p.foroPreferido.trim()) ||
    p.exigencias.sla ||
    p.exigencias.protecaoDados ||
    p.exigencias.propriedadeProgressiva ||
    Boolean(p.textoLivre.trim())
  );
}

/** Texto pronto para entrar no prompt da análise. */
export function politicaComoTexto(p: PoliticaContratos): string {
  const linhas: string[] = [];
  if (p.multaMaximaPct != null) linhas.push(`- Multa máxima aceitável em caso de rescisão: ${p.multaMaximaPct}%.`);
  if (p.prazoMaximoMeses != null) linhas.push(`- Prazo máximo de vigência: ${p.prazoMaximoMeses} meses.`);
  if (p.avisoPrevioMinimoDias != null) linhas.push(`- Aviso prévio mínimo exigido para rescisão ou não renovação: ${p.avisoPrevioMinimoDias} dias.`);
  if (p.foroPreferido.trim()) linhas.push(`- Foro preferido: ${p.foroPreferido.trim()}.`);
  if (p.exigencias.sla) linhas.push("- Exige SLA com penalidade por descumprimento.");
  if (p.exigencias.protecaoDados) linhas.push("- Exige cláusula de proteção de dados (papéis de controlador/operador, incidentes, subcontratados).");
  if (p.exigencias.propriedadeProgressiva) linhas.push("- Exige propriedade progressiva do código: cessão a cada entrega paga, não só ao final do contrato.");
  if (p.textoLivre.trim()) linhas.push(`- Outras exigências: ${p.textoLivre.trim()}`);
  return linhas.join("\n");
}
