import type { ResultadoBuscaWeb } from "./descoberta";

export type VinculoEmpresa = { estado: "confirmado" | "divergente" | "pendente"; empresa?: string; trecho?: string };
const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const identidade = (valor: string) => normalizar(valor).replace(/[.,]+$/, "").replace(/\b(ltda|limitada|inc|incorporated|llc|s\.?a\.?)\s*$/g, "").replace(/[^a-z0-9]/g, "");

export function mesmaEmpresa(a: string, b: string): boolean {
  return !!identidade(a) && identidade(a) === identidade(b);
}

/** Menção serve para priorizar uma leitura, nunca para afirmar vínculo empregatício. */
export function mencionaEmpresa(item: ResultadoBuscaWeb, empresa: string): boolean {
  if (item.pessoa?.empresa && mesmaEmpresa(item.pessoa.empresa, empresa)) return true;
  const termo = normalizar(empresa).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${termo}($|[^a-z0-9])`).test(normalizar([item.titulo, item.resumo, item.conteudoPerfil, item.pessoa?.empresa].filter(Boolean).join("\n")));
}

function empresaExplicita(texto: string): { empresa: string; trecho: string } | null {
  try { JSON.parse(texto); return null; } catch { /* Campos estruturados são tratados por pessoa.empresa. */ }
  // Cabeçalhos explícitos da página atual têm precedência sobre o título indexado antigo.
  const linha = texto.split(/\n/).find(l => /(?:current company|empresa atual|current employer)\s*[:：]/i.test(l));
  const nome = linha?.match(/(?:current company|empresa atual|current employer)\s*[:：]\s*([^\n|;]+)/i)?.[1]?.trim();
  return nome && linha ? { empresa: nome.replace(/\*+/g, "").trim(), trecho: linha.trim() } : null;
}

/** Empresa atual é um campo próprio ou vínculo explícito no cabeçalho do titular.
 * Educação, empregos anteriores e simples menções no corpo não confirmam o vínculo. */
export function avaliarVinculoEmpresa(item: ResultadoBuscaWeb, empresa: string): VinculoEmpresa {
  const comparar = (atual: string, trecho: string): VinculoEmpresa => ({ estado: mesmaEmpresa(atual, empresa) ? "confirmado" : "divergente", empresa: atual, trecho });
  if (item.conteudoPerfilAtual) {
    try {
      const dados = JSON.parse(item.conteudoPerfilAtual);
      const atuais = (Array.isArray(dados) ? dados : [dados]).flatMap(r => {
        if (!r || typeof r !== "object" || r.error || r.error_code) return [];
        const atual = r.current_company_name || r.current_company?.name;
        return typeof atual === "string" && atual.trim() ? [atual.trim()] : [];
      });
      if (atuais.length) { const atual = atuais.find(e => mesmaEmpresa(e, empresa)) || atuais[0]; return comparar(atual, atual); }
    } catch { /* Texto público pode trazer um cabeçalho explícito abaixo. */ }
  }
  const atual = empresaExplicita(item.conteudoPerfilAtual || item.resumo);
  if (atual) return comparar(atual.empresa, atual.trecho);
  if (item.pessoa?.empresa?.trim()) return comparar(item.pessoa.empresa, item.pessoa.empresa);
  const titulo = item.titulo.split(/\s*\|\s*LinkedIn/i)[0].trim();
  if (/\b(former|previous|past|student|alun[oa]|estudante|curso|education|ex)\b/i.test(normalizar(titulo))) return { estado: "pendente" };
  const partes = titulo.split(/\s[-–—|]\s/).map(p => p.trim()).filter(Boolean);
  const ultimo = partes.at(-1);
  if (partes.length >= 2 && ultimo && mesmaEmpresa(ultimo, empresa)) return comparar(ultimo, titulo);
  // Ex.: "Ana Silva - Diretora de marketing na StartSe".
  const cargoEmpresa = partes.slice(1).join(" - ").match(/(?:\s(?:at|na|no|em|da|do)\s+|\s*@\s*)([^|]+)$/i);
  if (cargoEmpresa) return comparar(cargoEmpresa[1].trim(), titulo);
  if (partes.length >= 3 && ultimo) return comparar(ultimo, titulo);
  return { estado: "pendente" };
}

export function ordenarParaEmpresa(itens: ResultadoBuscaWeb[], empresa: string): ResultadoBuscaWeb[] {
  return itens.filter(i => avaliarVinculoEmpresa(i, empresa).estado !== "divergente" && mencionaEmpresa(i, empresa))
    .sort((a, b) => Number(avaliarVinculoEmpresa(b, empresa).estado === "confirmado") - Number(avaliarVinculoEmpresa(a, empresa).estado === "confirmado"));
}

export function preencherCabecalhoConfirmado(item: ResultadoBuscaWeb, empresa: string): void {
  if (item.pessoa?.empresa) return;
  const vinculo = avaliarVinculoEmpresa(item, empresa);
  if (vinculo.estado !== "confirmado") return;
  const partes = item.titulo.split(/\s*\|\s*LinkedIn/i)[0].split(/\s[-–—|]\s/);
  const cargo = partes.length >= 3 ? partes[1] : "";
  item.pessoa = { nome: item.pessoa?.nome || partes[0].trim(), cargo: item.pessoa?.cargo || cargo, empresa: vinculo.empresa!, cidade: item.pessoa?.cidade || "", site: item.pessoa?.site || "" };
}
