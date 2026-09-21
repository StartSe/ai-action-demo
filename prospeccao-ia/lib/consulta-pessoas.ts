import type { CriteriosProspectHalo } from "./prospecthalo";

const limpar = (s?: string) => (s || "").replace(/["\r\n]/g, " ").replace(/\s+/g, " ").trim();
export function consultaPessoas(c: CriteriosProspectHalo, tipo: "web" | "semantica", alternativo?: string, somenteEmpresa = false): string {
  const empresa = limpar(c.empresa);
  const cargos = [...new Set([...(c.cargo || "").split(/\s+(?:ou|or)\s+|;/i), alternativo || ""].map(limpar).filter(Boolean))];
  if (!cargos.length && empresa && !somenteEmpresa) cargos.push("diretor", "gerente", "head", "coordenador", "CEO", "fundador");
  if (tipo === "semantica") return [
    empresa ? `Pessoas que trabalham atualmente na empresa "${empresa}".` : "Perfis profissionais no LinkedIn.",
    !somenteEmpresa && cargos.length && `Cargos: ${cargos.join(" ou ")}.`,
    c.segmento && `Setor: ${limpar(c.segmento)}.`, c.localizacao && `Localização: ${limpar(c.localizacao)}.`,
    empresa && "O vínculo deve ser com a empresa atual; cursos e empregos anteriores não atendem à busca.",
  ].filter(Boolean).join(" ");
  return ["site:linkedin.com/in", empresa && `"${empresa}"`, !somenteEmpresa && cargos.length && `(${cargos.map(cargo => `"${cargo}"`).join(" OR ")})`, limpar(c.segmento), limpar(c.localizacao)].filter(Boolean).join(" ");
}
