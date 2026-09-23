import type { ResultadoBuscaWeb } from "./descoberta";
import type { LeadProspeccao, NovoLeadProspeccao } from "./types";
import { atualizarLead, criarConta, criarLead, leadsDoProduto, obterConta, obterLead, obterProspeccao } from "./workspace";
import { registrarReencontro } from "./pesquisa-reencontros";
import { retirarCandidatoParcial } from "./pesquisa-parciais";
import { perfilLinkedin } from "./perfil-linkedin";
import { mesmaEmpresa } from "./vinculo-empresa";
import { urlAvatarPublico } from "./avatar-pessoa";

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const preenchido = (v: unknown): v is string => typeof v === "string" && !!v.trim() && !/^(não identificado|não informado|desconhecido|unknown|n\/a)$/i.test(v.trim());

export function contextoDoPerfil(item?: ResultadoBuscaWeb): string | null {
  const texto = item?.conteudoPerfilAtual || item?.conteudoPerfil;
  if (!texto) return null;
  try {
    const json = JSON.parse(texto);
    const registros = Array.isArray(json) ? json : [json];
    const r = registros.find(r => r && !r.error && (!r.url && !r.linkedin_url || perfilLinkedin(r.url || r.linkedin_url) === perfilLinkedin(item!.url)));
    if (!r) return null;
    return [r.about, r.summary].filter(preenchido).join("\n\n").slice(0, 4000) || null;
  } catch { return /^\s*[\[{]/.test(texto) ? null : texto.trim().slice(0, 4000) || null; }
}

export function dadosDoPerfil(item: ResultadoBuscaWeb | undefined, em: string) {
  return { resumoProfissional: contextoDoPerfil(item), pesquisadoEm: item?.perfilConsultadoEm || em, qualidadeDados: item?.conteudoPerfilAtual ? 2 : 1 };
}

/** Mesma identidade, observação mais recente e dados explícitos. Nunca altera decisões comerciais. */
export function enriquecerLead(id: string, novos: Partial<NovoLeadProspeccao>): LeadProspeccao | null {
  const atual = obterLead(id);
  if (!atual || novos.demo || !perfilLinkedin(novos.linkedin || "") || perfilLinkedin(novos.linkedin!) !== perfilLinkedin(atual.linkedin || "")) return atual;
  const dataNova = Date.parse(novos.pesquisadoEm || "");
  const dataAtual = Date.parse(atual.pesquisadoEm || "");
  const recente = Number.isFinite(dataNova) && (!Number.isFinite(dataAtual) || dataNova >= dataAtual);
  const podeSubstituir = recente && (novos.qualidadeDados ?? 1) >= (atual.qualidadeDados ?? 0);
  const patch: Partial<NovoLeadProspeccao> = {};
  for (const campo of ["nome", "cargo", "empresa", "cidade", "resumoProfissional"] as const) {
    const valor = novos[campo];
    if (preenchido(valor) && valor !== atual[campo] && (!preenchido(atual[campo]) || podeSubstituir)) patch[campo] = valor.trim();
  }
  const avatar = urlAvatarPublico(novos.avatarUrl);
  if (avatar && avatar !== atual.avatarUrl && (!atual.avatarUrl || podeSubstituir)) patch.avatarUrl = avatar;
  if (podeSubstituir && !atual.papelManual && novos.papel && novos.papel !== "desconhecido") patch.papel = novos.papel;
  const mudouEmpresa = !!patch.empresa && !mesmaEmpresa(patch.empresa, atual.empresa || "");
  const mudouCargo = !!patch.cargo && preenchido(atual.cargo) && normalizar(patch.cargo) !== normalizar(atual.cargo);
  if (mudouEmpresa || mudouCargo) {
    patch.fit = null;
    patch.evidencias = mudouEmpresa ? [] : atual.evidencias.filter(e => !/cargo|ocupa[çc][aã]o|papel/i.test(e.criterio));
  }
  if (mudouEmpresa) {
    const conta = novos.contaId ? obterConta(novos.contaId) : null;
    // A conta pertence à prospecção original, para não criar referências quebradas ao excluir a nova busca.
    patch.contaId = conta && mesmaEmpresa(conta.nome, patch.empresa!)
      ? criarConta({ prospeccaoId: atual.prospeccaoId, nome: conta.nome, site: conta.site, setor: conta.setor, porte: conta.porte, cidade: conta.cidade, fit: conta.fit, evidencias: conta.evidencias, sinais: conta.sinais, resumo: conta.resumo, demo: conta.demo }).id : null;
    patch.fit = null;
  }
  if (novos.fonte && (recente || !atual.fonte)) patch.fonte = [...new Set([...(atual.fonte || "").split("\n"), novos.fonte].filter(Boolean))].slice(-8).join("\n");
  if (novos.evidencias?.length) {
    const evidencias = new Map((patch.evidencias ?? atual.evidencias).map(e => [`${e.criterio}\0${e.valor}`, e]));
    for (const e of novos.evidencias) {
      const chave = `${e.criterio}\0${e.valor}`;
      if ((!evidencias.has(chave) && (recente || !atual.evidencias.some(a => a.criterio === e.criterio))) || (recente && e.resultado !== "nao_verificavel")) evidencias.set(chave, e);
    }
    patch.evidencias = [...evidencias.values()];
  }
  if (novos.sinais?.length) patch.sinais = [...new Map([...atual.sinais, ...novos.sinais].map(s => [`${s.descricao}\0${s.origem}\0${s.data}`, s])).values()];
  if (recente && (podeSubstituir || !atual.pesquisadoEm)) {
    patch.pesquisadoEm = novos.pesquisadoEm;
    patch.qualidadeDados = Math.max(atual.qualidadeDados ?? 0, novos.qualidadeDados ?? 1);
  }
  return Object.keys(patch).length ? atualizarLead(id, patch) : atual;
}

export function salvarPessoaEncontrada(dados: NovoLeadProspeccao): LeadProspeccao | null {
  const prospeccao = obterProspeccao(dados.prospeccaoId);
  if (!prospeccao || prospeccao.estado !== "executando") return null;
  const perfil = perfilLinkedin(dados.linkedin || "");
  const anterior = leadsDoProduto(prospeccao.produtoId).find(l => !!l.demo === !!dados.demo && (perfil
    ? perfilLinkedin(l.linkedin || "") === perfil
    : !l.linkedin && normalizar(l.nome) === normalizar(dados.nome) && normalizar(l.empresa || "") === normalizar(dados.empresa || "")));
  if (!anterior) return criarLead(dados);
  const atualizado = enriquecerLead(anterior.id, dados);
  registrarReencontro(dados.prospeccaoId, anterior.id);
  retirarCandidatoParcial(dados.prospeccaoId, dados.linkedin);
  return atualizado;
}
