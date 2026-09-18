// A ficha do candidato: como ela nasce do currículo e como ela se junta ao que vier depois (US-009).
//
// Duas responsabilidades, e as duas são de produto antes de serem de código:
//
//  1. **Ler o currículo sem inventar.** O prompt manda deixar `null` em tudo que o texto não disser.
//     Um campo em branco a pessoa de RH preenche em dez segundos; um campo inventado que parece
//     certo ninguém revisa — e ele vira pergunta de entrevista e depois vira parecer.
//  2. **Mesclar respeitando a D5.** O currículo vence a web, a web só preenche o que está vazio, e o
//     que o gestor digitou não é sobrescrito por nada. Quando currículo e web discordam, nenhum dos
//     dois é apagado: o conflito vira uma linha em `divergencias[]` para o gestor decidir.
//
// Por que `mesclar()` mora aqui e não na rota: a mesma regra vale para a leitura do currículo
// (US-009), para a consolidação da pesquisa na web (US-012) e para a edição à mão do gestor
// (US-013). Três portas, uma regra.
//
// Este módulo **não pode ser importado por `lib/candidatos.ts`** a não ser com `import type`: é ele
// quem importa `adicionarFonte` de lá. O tipo `Ficha` mora em `lib/types.ts` justamente por isso.
import { aiEnabled, askJSON } from "./ai";
import { adicionarFonte, removerFontes } from "./candidatos";
import { esperar, fichaDemo } from "./demo";
import type { CampoFicha, DivergenciaFicha, Ficha, FichaBruta, IdentidadePossivel, OrigemCampo, PesquisaWeb } from "./types";

// ---------------------------------------------------------------------------------------------
// O catálogo de campos
// ---------------------------------------------------------------------------------------------

/** Os campos de valor único. A ordem é a que a tela usa, de cima para baixo. */
export const CAMPOS_SIMPLES = [
  "resumo",
  "cargoAtual",
  "empresaAtual",
  "cidade",
  "anosExperiencia",
  "pretensaoSalarial",
  "disponibilidade",
  "observacoes",
] as const;

/** Os campos de lista, em que a origem é guardada por item. */
export const CAMPOS_LISTA = ["experiencias", "formacao", "competencias", "idiomas", "links"] as const;

export type CampoSimples = (typeof CAMPOS_SIMPLES)[number];
export type CampoLista = (typeof CAMPOS_LISTA)[number];

/** O nome de cada campo para quem lê a tela — usado nas divergências e na ficha editável (US-013). */
export const ROTULOS_FICHA: Record<CampoSimples | CampoLista, string> = {
  resumo: "Resumo",
  cargoAtual: "Cargo atual",
  empresaAtual: "Empresa atual",
  cidade: "Cidade",
  anosExperiencia: "Anos de experiência",
  pretensaoSalarial: "Pretensão salarial",
  disponibilidade: "Disponibilidade",
  observacoes: "Observações",
  experiencias: "Experiência",
  formacao: "Formação",
  competencias: "Competências",
  idiomas: "Idiomas",
  links: "Links",
};

// ---------------------------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------------------------
// Como em toda entrada de IA deste app, aqui se CORTA em silêncio: quem escreveu demais foi o modelo,
// não uma pessoa. A recusa com frase pronta é do formulário (lib/candidatos.ts).

/** Quanto do currículo vai no prompt. Um currículo de verdade cabe folgado; o que passa disso é
 * portfólio colado no fim do arquivo. */
export const LIMITE_CV_NO_PROMPT = 24_000;
export const LIMITE_RESUMO = 600;
export const LIMITE_LINHA = 200;
export const LIMITE_DESCRICAO = 400;
export const MAX_ITENS_LISTA = 12;

/**
 * Quanto o cadastro espera pela leitura do currículo antes de responder sem ficha.
 *
 * O número não é sobre o modelo, é sobre a pessoa: passados vinte segundos olhando um botão girando,
 * ela acha que o cadastro travou e recarrega a página — e aí o currículo que ela acabou de enviar
 * corre o risco de ir embora. Melhor salvar e oferecer "Ler o currículo de novo".
 */
export const LIMITE_EXTRACAO_MS = 20_000;

export const AVISO_FICHA_DEMOROU =
  "O currículo entrou, mas a leitura automática está demorando mais que o normal. O cadastro está salvo: peça para ler o currículo de novo quando quiser.";
export const AVISO_FICHA_FALHOU =
  "O currículo entrou, mas não conseguimos montar a ficha agora. O cadastro está salvo: peça para ler o currículo de novo quando quiser.";

// ---------------------------------------------------------------------------------------------
// Normalização: do JSON cru para a ficha com procedência
// ---------------------------------------------------------------------------------------------

function textoDe(valor: unknown, limite: number): string {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  if (typeof valor !== "string") return "";
  return valor.replace(/\s+/g, " ").trim().slice(0, limite);
}

function numeroDe(valor: unknown): number | null {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 70) return null;
  return Math.round(n * 10) / 10;
}

/** A IA às vezes devolve `{ valor: "..." }` em vez do valor puro; e uma ficha já gravada chega assim
 * de propósito. Os dois entram pelo mesmo funil. */
function desembrulhar(valor: unknown): unknown {
  if (valor && typeof valor === "object" && !Array.isArray(valor) && "valor" in (valor as object)) {
    return (valor as { valor: unknown }).valor;
  }
  return valor;
}

function origemDe(valor: unknown, padrao: OrigemCampo): OrigemCampo {
  if (!valor || typeof valor !== "object") return padrao;
  const origem = (valor as { origem?: unknown }).origem;
  return origem === "cv" || origem === "web" || origem === "gestor" ? origem : padrao;
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor.slice(0, MAX_ITENS_LISTA) : [];
}

function campo<T>(valor: T, origem: OrigemCampo, fonteId?: string, confianca?: number): CampoFicha<T> {
  const c: CampoFicha<T> = { valor, origem };
  if (fonteId) c.fonteId = fonteId;
  if (typeof confianca === "number" && Number.isFinite(confianca)) c.confianca = Math.min(1, Math.max(0, confianca));
  return c;
}

function confiancaDe(valor: unknown): number | undefined {
  if (!valor || typeof valor !== "object") return undefined;
  const c = (valor as { confianca?: unknown }).confianca;
  return typeof c === "number" && Number.isFinite(c) ? c : undefined;
}

/**
 * A fonte de UM campo, quando ela é diferente da fonte da ficha inteira.
 *
 * O currículo é uma fonte só, mas a pesquisa na web traz quatro páginas (US-012) e cada campo sai de
 * uma delas — é isso que permite à tela pôr "de onde saiu" ao lado da informação. `validas` existe
 * porque o modelo escreve este campo: um `fonteId` inventado viraria um link para lugar nenhum, e
 * nesse caso vale mais a fonte da ficha inteira do que uma promessa que não se cumpre.
 */
function fonteDe(valor: unknown, padrao: string | undefined, validas: Set<string> | undefined): string | undefined {
  if (!validas || !valor || typeof valor !== "object") return padrao;
  const id = (valor as { fonteId?: unknown }).fonteId;
  return typeof id === "string" && validas.has(id) ? id : padrao;
}

/**
 * Transforma o JSON cru da IA (ou da ficha guardada) numa `Ficha` com a origem carimbada.
 *
 * Campo que o modelo devolveu vazio ou `null` **não entra**: uma ficha sem `cidade` e uma ficha com
 * `cidade: ""` são a mesma coisa para quem lê a tela, mas só a primeira deixa a mesclagem seguinte
 * preencher o campo.
 */
export function normalizarFicha(bruto: unknown, origem: OrigemCampo, fonteId?: string, fontesValidas?: Set<string>): Ficha {
  const dados = (bruto ?? {}) as Record<string, unknown>;
  const ficha: Ficha = {};
  const fonte = (cru: unknown) => fonteDe(cru, fonteId, fontesValidas);

  const simples = (chave: Exclude<CampoSimples, "anosExperiencia">, limite: number) => {
    const cru = dados[chave];
    const texto = textoDe(desembrulhar(cru), limite);
    if (texto) ficha[chave] = campo(texto, origemDe(cru, origem), fonte(cru), confiancaDe(cru));
  };

  simples("resumo", LIMITE_RESUMO);
  simples("cargoAtual", LIMITE_LINHA);
  simples("empresaAtual", LIMITE_LINHA);
  simples("cidade", LIMITE_LINHA);
  simples("pretensaoSalarial", LIMITE_LINHA);
  simples("disponibilidade", LIMITE_LINHA);
  simples("observacoes", LIMITE_RESUMO);

  const anos = numeroDe(desembrulhar(dados.anosExperiencia));
  if (anos !== null) ficha.anosExperiencia = campo(anos, origemDe(dados.anosExperiencia, origem), fonte(dados.anosExperiencia), confiancaDe(dados.anosExperiencia));

  const experiencias = lista(dados.experiencias)
    .map((item) => {
      const dentro = (desembrulhar(item) ?? {}) as Record<string, unknown>;
      const empresa = textoDe(dentro.empresa, LIMITE_LINHA);
      const cargo = textoDe(dentro.cargo, LIMITE_LINHA);
      if (!empresa && !cargo) return null;
      return campo(
        {
          empresa,
          cargo,
          inicio: textoDe(dentro.inicio, 40) || undefined,
          fim: textoDe(dentro.fim, 40) || undefined,
          descricao: textoDe(dentro.descricao, LIMITE_DESCRICAO) || undefined,
        },
        origemDe(item, origem),
        fonte(item),
        confiancaDe(item),
      );
    })
    .filter((x) => x !== null);
  if (experiencias.length) ficha.experiencias = experiencias;

  const formacao = lista(dados.formacao)
    .map((item) => {
      const dentro = (desembrulhar(item) ?? {}) as Record<string, unknown>;
      const curso = textoDe(dentro.curso, LIMITE_LINHA);
      if (!curso) return null;
      return campo(
        {
          curso,
          instituicao: textoDe(dentro.instituicao, LIMITE_LINHA) || undefined,
          inicio: textoDe(dentro.inicio, 40) || undefined,
          fim: textoDe(dentro.fim, 40) || undefined,
        },
        origemDe(item, origem),
        fonte(item),
        confiancaDe(item),
      );
    })
    .filter((x) => x !== null);
  if (formacao.length) ficha.formacao = formacao;

  for (const chave of ["competencias", "idiomas", "links"] as const) {
    const itens = lista(dados[chave])
      .map((item) => {
        const texto = textoDe(desembrulhar(item), LIMITE_LINHA);
        return texto ? campo(texto, origemDe(item, origem), fonte(item), confiancaDe(item)) : null;
      })
      .filter((x) => x !== null);
    if (itens.length) ficha[chave] = itens;
  }

  const divergencias = lista(dados.divergencias)
    .map((item) => {
      const d = (item ?? {}) as Record<string, unknown>;
      const nome = textoDe(d.campo, 60);
      if (!nome) return null;
      const fonte = textoDe(d.fonteId, 80);
      const linha: DivergenciaFicha = { campo: nome, cv: textoDe(d.cv, LIMITE_LINHA), web: textoDe(d.web, LIMITE_LINHA) };
      if (fonte) linha.fonteId = fonte;
      return linha;
    })
    .filter((x) => x !== null);
  if (divergencias.length) ficha.divergencias = divergencias;

  return ficha;
}

// ---------------------------------------------------------------------------------------------
// Mesclagem (D5)
// ---------------------------------------------------------------------------------------------

/** A hierarquia da D5, em número, para a comparação caber numa linha. */
const PESO: Record<OrigemCampo, number> = { web: 1, cv: 2, gestor: 3 };

function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    // Uma experiência ou formação vira a linha que a tela mostraria: é sobre ela que faz sentido
    // dizer "isto é o mesmo que aquilo".
    const partes = [o.cargo, o.curso, o.empresa, o.instituicao, o.inicio, o.fim].filter(Boolean);
    return partes.join(" · ");
  }
  return String(valor);
}

/** Comparação tolerante: caixa, acento e pontuação não fazem duas informações serem diferentes. */
function chave(valor: unknown): string {
  return comoTexto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function vazio(campo?: CampoFicha<unknown>): boolean {
  return !campo || chave(campo.valor) === "";
}

/**
 * Junta uma ficha nova à que já existe, aplicando a D5.
 *
 * `origem` é de onde vem a ficha nova **inteira** (o currículo lido, a pesquisa consolidada, a edição
 * do gestor) e sobrepõe a origem que os campos dela porventura tragam: quem chama é quem sabe de onde
 * aquilo veio.
 *
 * Três garantias que valem para todo campo:
 *
 *  - **`gestor` não é sobrescrito.** Nem por currículo novo, nem por pesquisa nova.
 *  - **Uma ficha nova vazia não apaga nada.** "A pesquisa não achou a cidade" não é "a pessoa não tem
 *    cidade" — o campo que vem em branco é ignorado, nunca gravado por cima.
 *  - **`cv` × `web` em desacordo não escolhe sozinho**: fica o currículo e a divergência é registrada
 *    para o gestor ver os dois lados (US-013).
 */
export function mesclar(fichaAtual: Ficha | undefined, novaFicha: Ficha, origem: OrigemCampo): Ficha {
  const atual = fichaAtual ?? {};
  const resultado: Ficha = {};
  const comparados = new Set<string>();
  const divergenciasNovas: DivergenciaFicha[] = [];

  for (const nome of CAMPOS_SIMPLES) {
    const anterior = atual[nome] as CampoFicha<unknown> | undefined;
    const bruto = novaFicha[nome] as CampoFicha<unknown> | undefined;
    const nova = bruto && !vazio(bruto) ? { ...bruto, origem } : undefined;

    if (!nova) {
      if (anterior) definir(resultado, nome, anterior);
      continue;
    }
    comparados.add(nome);

    if (vazio(anterior)) {
      definir(resultado, nome, nova);
      continue;
    }
    const velho = anterior as CampoFicha<unknown>;

    // Currículo e web discordando é a situação que a D5 existe para tratar: nenhum lado é apagado.
    if (velho.origem !== origem && (velho.origem === "cv" || velho.origem === "web") && (origem === "cv" || origem === "web")) {
      if (chave(velho.valor) !== chave(nova.valor)) {
        const ladoCv = velho.origem === "cv" ? velho : nova;
        const ladoWeb = velho.origem === "web" ? velho : nova;
        divergenciasNovas.push({
          campo: nome,
          cv: comoTexto(ladoCv.valor),
          web: comoTexto(ladoWeb.valor),
          ...(ladoWeb.fonteId ? { fonteId: ladoWeb.fonteId } : {}),
        });
      }
    }

    definir(resultado, nome, PESO[origem] >= PESO[velho.origem] ? nova : velho);
  }

  for (const nome of CAMPOS_LISTA) {
    const anteriores = (atual[nome] ?? []) as CampoFicha<unknown>[];
    const novos = ((novaFicha[nome] ?? []) as CampoFicha<unknown>[]).filter((i) => !vazio(i)).map((i) => ({ ...i, origem }));

    // Lista nova vazia é silêncio, não apagamento: "o currículo não listava idiomas" não desfaz o que
    // a pesquisa já tinha encontrado.
    if (!novos.length) {
      if (anteriores.length) definirLista(resultado, nome, anteriores);
      continue;
    }

    // Uma leitura nova da mesma origem SUBSTITUI o que aquela origem dizia (reler o currículo não
    // empilha as experiências duas vezes); o que veio das outras origens continua. A edição do gestor
    // é a lista inteira: se ele apagou uma linha, ela tem de sumir.
    const mantidos = origem === "gestor" ? [] : anteriores.filter((i) => i.origem !== origem);

    const porChave = new Map<string, CampoFicha<unknown>>();
    for (const item of [...mantidos, ...novos]) {
      const k = chave(item.valor);
      const existente = porChave.get(k);
      if (!existente || PESO[item.origem] > PESO[existente.origem]) porChave.set(k, item);
    }
    // `sort` é estável em V8: dentro da mesma origem a ordem de chegada é preservada.
    const combinados = [...porChave.values()].sort((a, b) => PESO[b.origem] - PESO[a.origem]).slice(0, MAX_ITENS_LISTA);
    definirLista(resultado, nome, combinados);
  }

  // Divergência de campo que acabou de ser reavaliado é recalculada; a dos outros campos fica como
  // estava. É o que faz "Usar o da web" (que grava o campo como `gestor`) resolver o conflito.
  const conservadas = (atual.divergencias ?? []).filter((d) => !comparados.has(d.campo));
  const divergencias = [...conservadas, ...divergenciasNovas];
  if (divergencias.length) resultado.divergencias = divergencias;

  // A pesquisa que aguarda a decisão do gestor (US-012) atravessa a mesclagem intacta: ela não é um
  // campo da ficha, é o que ainda NÃO virou ficha. Sem esta linha, corrigir um campo à mão apagaria
  // em silêncio as identidades que a tela está pedindo ao gestor para escolher.
  if (atual.web) resultado.web = atual.web;

  return resultado;
}

/**
 * Guarda (ou tira) a pesquisa na web que ainda espera a decisão do gestor.
 *
 * `null` é o que se chama quando a identidade foi confirmada e a ficha web já entrou pela mesclagem:
 * o material deixou de estar pendente, e mantê-lo faria a tela pedir para sempre uma escolha que já
 * foi feita.
 */
export function guardarPesquisaWeb(ficha: Ficha | undefined, pesquisa: PesquisaWeb | null): Ficha {
  const resultado: Ficha = { ...(ficha ?? {}) };
  if (pesquisa) resultado.web = pesquisa;
  else delete resultado.web;
  return resultado;
}

// As duas atribuições abaixo existem só para não espalhar `as never` pelo corpo da mesclagem: o
// TypeScript não consegue ligar a chave à variante de `CampoFicha<T>` numa escrita dinâmica.
function definir(ficha: Ficha, nome: CampoSimples, valor: CampoFicha<unknown>): void {
  (ficha as Record<string, unknown>)[nome] = valor;
}

function definirLista(ficha: Ficha, nome: CampoLista, valor: CampoFicha<unknown>[]): void {
  (ficha as Record<string, unknown>)[nome] = valor;
}

// ---------------------------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------------------------

/** O valor de um campo como texto, sem quem chama precisar saber do embrulho de procedência. */
export function valorDaFicha(ficha: Ficha | undefined, nome: CampoSimples): string {
  const campo = ficha?.[nome] as CampoFicha<unknown> | undefined;
  return campo ? comoTexto(campo.valor) : "";
}

/** As origens presentes na ficha, na ordem da D5 — os chips "CV" / "Web" / "Editado por você". */
export function origensDaFicha(ficha?: Ficha): OrigemCampo[] {
  if (!ficha) return [];
  const presentes = new Set<OrigemCampo>();
  for (const nome of CAMPOS_SIMPLES) {
    const campo = ficha[nome] as CampoFicha<unknown> | undefined;
    if (campo) presentes.add(campo.origem);
  }
  for (const nome of CAMPOS_LISTA) {
    for (const item of (ficha[nome] ?? []) as CampoFicha<unknown>[]) presentes.add(item.origem);
  }
  return (["gestor", "cv", "web"] as const).filter((o) => presentes.has(o));
}

// ---------------------------------------------------------------------------------------------
// As decisões do gestor (US-013)
// ---------------------------------------------------------------------------------------------
// Três decisões que só uma pessoa pode tomar, e que por isso viram origem `gestor`: corrigir um
// campo, escolher entre o que diz o currículo e o que diz a web, e dizer quem é a pessoa. As três
// moram aqui, e não nas rotas, pelo mesmo motivo das regras de mesclagem: elas decidem em silêncio o
// que o gestor vê sobre alguém de verdade, e um erro nelas não quebra tela nenhuma.

/**
 * A ficha como a tela devolve quando o gestor salva.
 *
 * Campo ausente é "não mexa". Texto em branco (ou lista vazia) é **apague**: esta é a única porta em
 * que o vazio foi digitado por alguém que está olhando a ficha, e isso é uma decisão — em todas as
 * outras (currículo relido, pesquisa refeita) o vazio é só silêncio da fonte.
 */
export type EdicaoFicha = Partial<Record<CampoSimples, string>> & Partial<Record<CampoLista, unknown[]>>;

function remover(ficha: Ficha, nome: string): void {
  delete (ficha as Record<string, unknown>)[nome];
}

/** Aplica a edição à mão: o que o gestor escreveu vira origem `gestor` e o que ele esvaziou some. */
export function editarFicha(atual: Ficha | undefined, edicao: EdicaoFicha): Ficha {
  const resultado = mesclar(atual, normalizarFicha(edicao, "gestor"), "gestor");

  const apagados = new Set<string>();
  for (const nome of CAMPOS_SIMPLES) {
    const valor = edicao[nome];
    if (valor !== undefined && !String(valor).trim()) {
      remover(resultado, nome);
      apagados.add(nome);
    }
  }
  for (const nome of CAMPOS_LISTA) {
    const itens = edicao[nome];
    if (Array.isArray(itens) && itens.length === 0) {
      remover(resultado, nome);
      apagados.add(nome);
    }
  }

  // Campo esvaziado não tem mais dois lados para comparar: a divergência dele sai junto.
  const divergencias = (resultado.divergencias ?? []).filter((d) => !apagados.has(d.campo));
  if (divergencias.length) resultado.divergencias = divergencias;
  else remover(resultado, "divergencias");
  return resultado;
}

/**
 * "Manter o currículo" ou "Usar o da web", no bloco de divergências.
 *
 * O valor da web entra como `gestor`, e não como `web`, porque foi uma escolha de uma pessoa e não
 * uma leitura: é isso que impede a próxima releitura do currículo (ou a próxima pesquisa) de desfazer
 * em silêncio o que ela decidiu.
 */
export function resolverDivergencia(atual: Ficha | undefined, campo: string, escolha: "cv" | "web"): Ficha {
  const ficha = atual ?? {};
  const linha = (ficha.divergencias ?? []).find((d) => d.campo === campo);
  if (!linha) return ficha;

  // "Manter o currículo" já está aplicado (é a D5): o que falta é tirar a linha da tela.
  const base = escolha === "web" ? editarFicha(ficha, { [campo]: linha.web } as EdicaoFicha) : { ...ficha };
  const restantes = (base.divergencias ?? []).filter((d) => d.campo !== campo);
  if (restantes.length) base.divergencias = restantes;
  else remover(base, "divergencias");
  return base;
}

/** Dois endereços que apontam para a mesma página. Esquema, `www.` e barra final não separam nada. */
function mesmoEndereco(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const limpar = (u: string) => u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
  return limpar(a) === limpar(b);
}

/** As fontes que pertencem a um homônimo que o gestor NÃO escolheu. */
function fontesDosOutros(identidades: IdentidadePossivel[], escolhida: number, fontes: { id: string; url?: string }[]): Set<string> {
  const daEscolhida = new Set(fontes.filter((f) => mesmoEndereco(f.url, identidades[escolhida]?.url)).map((f) => f.id));
  const alheias = new Set<string>();
  identidades.forEach((identidade, i) => {
    if (i === escolhida) return;
    for (const fonte of fontes) {
      if (mesmoEndereco(fonte.url, identidade.url) && !daEscolhida.has(fonte.id)) alheias.add(fonte.id);
    }
  });
  return alheias;
}

/** A ficha sem os campos que saíram das fontes indicadas. */
function semAsFontes(ficha: Ficha, ids: Set<string>): Ficha {
  if (!ids.size) return ficha;
  const resultado: Ficha = {};
  for (const nome of CAMPOS_SIMPLES) {
    const campo = ficha[nome] as CampoFicha<unknown> | undefined;
    if (campo && !(campo.fonteId && ids.has(campo.fonteId))) definir(resultado, nome, campo);
  }
  for (const nome of CAMPOS_LISTA) {
    const itens = ((ficha[nome] ?? []) as CampoFicha<unknown>[]).filter((i) => !(i.fonteId && ids.has(i.fonteId)));
    if (itens.length) definirLista(resultado, nome, itens);
  }
  return resultado;
}

/**
 * "É esta pessoa" / "Nenhuma destas": a decisão de identidade da D6.
 *
 * `escolhida` é o índice do cartão em `web.identidades`; `null` é "Nenhuma destas", e aí o material
 * inteiro é descartado — ele é sobre outra pessoa, e guardá-lo faria a tela pedir para sempre uma
 * escolha já feita.
 *
 * O filtro por fonte é o que impede a escolha do segundo cartão de trazer os campos do primeiro: a
 * consolidação monta UMA ficha, a da pessoa mais provável, e os campos que saíram da página de outro
 * homônimo ficam de fora. O que não dá para atribuir a ninguém entra e, se contradisser o currículo,
 * vira divergência — que é de novo uma pergunta para o gestor, não uma decisão nossa.
 */
export function decidirIdentidade(
  atual: Ficha | undefined,
  escolhida: number | null,
  fontes: { id: string; url?: string }[] = [],
): Ficha {
  const pendente = atual?.web;
  if (!pendente || escolhida === null) return guardarPesquisaWeb(atual, null);
  if (!pendente.identidades[escolhida]) return atual ?? {};

  const daWeb = semAsFontes(pendente.ficha, fontesDosOutros(pendente.identidades, escolhida, fontes));
  return guardarPesquisaWeb(mesclar(atual, daWeb, "web"), null);
}

// ---------------------------------------------------------------------------------------------
// O que o gestor digitou (US-013)
// ---------------------------------------------------------------------------------------------
// Mesma separação de sempre: aqui se RECUSA com a frase pronta (é uma pessoa preenchendo), enquanto
// `normalizarFicha` CORTA em silêncio (é a IA, ou um JSON já gravado).

const LIMITE_DO_CAMPO: Record<CampoSimples, number> = {
  resumo: LIMITE_RESUMO,
  cargoAtual: LIMITE_LINHA,
  empresaAtual: LIMITE_LINHA,
  cidade: LIMITE_LINHA,
  anosExperiencia: 10,
  pretensaoSalarial: LIMITE_LINHA,
  disponibilidade: LIMITE_LINHA,
  observacoes: LIMITE_RESUMO,
};

export type ValidacaoEdicaoFicha = { ok: true; campos: EdicaoFicha } | { ok: false; erro: string };

const NAO_ENTENDI = "A ficha não chegou como esperávamos. Recarregue a página e tente de novo.";

/** Os textos de um item de lista: a linha inteira, quando é texto, ou os campos de uma experiência. */
function textosDoItem(item: unknown): string[] {
  if (typeof item === "string") return [item];
  if (!item || typeof item !== "object") return [];
  return Object.values(item as Record<string, unknown>).filter((v): v is string => typeof v === "string");
}

export function validarEdicaoFicha(bruto: unknown): ValidacaoEdicaoFicha {
  if (!bruto || typeof bruto !== "object") return { ok: false, erro: NAO_ENTENDI };
  const dados = bruto as Record<string, unknown>;
  const campos: EdicaoFicha = {};

  for (const nome of CAMPOS_SIMPLES) {
    const valor = dados[nome];
    if (valor === undefined) continue;
    if (typeof valor !== "string") return { ok: false, erro: NAO_ENTENDI };
    const limpo = valor.replace(/\s+/g, " ").trim();
    if (limpo.length > LIMITE_DO_CAMPO[nome]) {
      return { ok: false, erro: `"${ROTULOS_FICHA[nome]}" pode ter até ${LIMITE_DO_CAMPO[nome]} caracteres.` };
    }
    campos[nome] = limpo;
  }

  for (const nome of CAMPOS_LISTA) {
    const itens = dados[nome];
    if (itens === undefined) continue;
    if (!Array.isArray(itens)) return { ok: false, erro: NAO_ENTENDI };
    if (itens.length > MAX_ITENS_LISTA) {
      return { ok: false, erro: `"${ROTULOS_FICHA[nome]}" pode ter até ${MAX_ITENS_LISTA} itens. Deixe os mais importantes.` };
    }
    for (const item of itens) {
      if (textosDoItem(item).some((t) => t.length > LIMITE_DESCRICAO)) {
        return { ok: false, erro: `Cada linha de "${ROTULOS_FICHA[nome]}" pode ter até ${LIMITE_DESCRICAO} caracteres.` };
      }
    }
    campos[nome] = itens;
  }

  return { ok: true, campos };
}

// ---------------------------------------------------------------------------------------------
// A leitura do currículo
// ---------------------------------------------------------------------------------------------

const INSTRUCOES = `Você lê o currículo de um candidato e separa os campos de uma ficha, para que uma entrevista de seleção saiba com quem está falando.
Regras:
- Escreva em português do Brasil, com as palavras do próprio currículo.
- **Só o que está escrito.** Todo campo que o currículo não disser volta como null, e toda lista que ele não trouxer volta vazia. Um campo null é uma resposta correta; um palpite não é.
- Não deduza cargo, empresa nem cidade a partir do e-mail, do nome do arquivo ou do domínio de um link.
- "resumo": duas ou três frases sobre a trajetória, do que o currículo diz. Nada de adjetivo de propaganda ("profissional dedicado", "perfil dinâmico").
- "cargoAtual"/"empresaAtual": o cargo e a empresa da posição mais recente, ou null.
- "cidade": a cidade (e o estado) onde a pessoa mora, só se o currículo disser.
- "anosExperiencia": número (pode ter uma casa decimal) de anos de experiência profissional somados, ou null quando as datas não permitirem contar.
- "experiencias": uma entrada por posição, da mais recente para a mais antiga, com "empresa", "cargo", "inicio", "fim" e "descricao" (uma ou duas frases). **Datas no formato em que aparecem no currículo** ("2021", "mar/2021", "03/2021"); para a posição atual, "fim" é "atual".
- "formacao": uma entrada por curso, com "curso", "instituicao", "inicio" e "fim".
- "competencias": ferramentas, tecnologias e habilidades listadas, uma por item, com o nome que o currículo usa.
- "idiomas": um por item, com o nível quando estiver escrito ("Inglês avançado").
- "links": endereços completos que aparecem no currículo (perfil, portfólio, repositório).
- "pretensaoSalarial" e "disponibilidade": só quando o currículo trouxer; quase nunca traz.
- "observacoes": null, a não ser que haja algo relevante para a seleção que não coube em nenhum campo.
Formato de saída (JSON, sem nenhum texto fora dele):
{
  "resumo": "texto ou null",
  "cargoAtual": "texto ou null",
  "empresaAtual": "texto ou null",
  "cidade": "texto ou null",
  "anosExperiencia": 4,
  "experiencias": [{ "empresa": "texto", "cargo": "texto", "inicio": "2021", "fim": "atual", "descricao": "texto" }],
  "formacao": [{ "curso": "texto", "instituicao": "texto", "inicio": "2015", "fim": "2019" }],
  "competencias": ["texto"],
  "idiomas": ["texto"],
  "links": ["https://..."],
  "pretensaoSalarial": "texto ou null",
  "disponibilidade": "texto ou null",
  "observacoes": "texto ou null"
}`;

/**
 * Lê o currículo já extraído e devolve a ficha com tudo em origem `cv`.
 *
 * Registra (ou substitui) a fonte `cv` do candidato antes de chamar o modelo: o currículo é a fonte
 * mesmo quando a leitura falha, e é o `fonteId` dela que cada campo da ficha vai carregar.
 */
export async function extrairDoCurriculo({
  candidatoId,
  nome,
  cvTexto,
}: {
  candidatoId: string;
  nome: string;
  cvTexto: string;
}): Promise<Ficha | null> {
  const texto = cvTexto.trim();
  if (!texto) return null;

  // Reler o currículo substitui a fonte anterior em vez de empilhar uma segunda: a ficha aponta para
  // uma fonte `cv` só, e duas linhas iguais na lista de fontes pareceriam dois currículos.
  removerFontes(candidatoId, "cv");
  const fonte = adicionarFonte({
    candidatoId,
    tipo: "cv",
    titulo: "Currículo enviado",
    resumo: "Texto do currículo que o candidato enviou no cadastro.",
    conteudo: texto,
  });

  if (!aiEnabled()) {
    await esperar(900);
    return normalizarFicha(fichaDemo({ nome, cvTexto: texto }), "cv", fonte.id);
  }

  const bruto = await askJSON<FichaBruta>({
    system: INSTRUCOES,
    prompt: `Nome do candidato: ${nome}\n\nCurrículo:\n${texto.slice(0, LIMITE_CV_NO_PROMPT)}`,
    maxTokens: 2500,
  });
  return normalizarFicha(bruto, "cv", fonte.id);
}

/**
 * A mesma leitura, com prazo e sem levantar erro.
 *
 * Um cadastro de candidato não pode ser derrubado pela leitura do currículo — é a mesma decisão de
 * `lib/curriculo.ts`, um passo adiante: o arquivo ilegível não bloqueia o cadastro, e a IA fora do ar
 * também não. Quem chama recebe `ficha: null` mais a frase que a tela mostra, com o caminho de saída.
 */
export async function fichaDoCurriculo(args: { candidatoId: string; nome: string; cvTexto: string }): Promise<{ ficha: Ficha | null; aviso?: string }> {
  if (!args.cvTexto.trim()) return { ficha: null };

  let estourou = false;
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<null>((resolve) => {
    relogio = setTimeout(() => {
      estourou = true;
      resolve(null);
    }, LIMITE_EXTRACAO_MS);
  });

  try {
    // A chamada que estourou o prazo continua correndo até terminar sozinha — o que ela devolver
    // depois é descartado. Não é desperdício que valha uma tela girando: o botão "Ler o currículo de
    // novo" leva um segundo e a pessoa escolhe a hora.
    const ficha = await Promise.race([extrairDoCurriculo(args), prazo]);
    if (ficha) return { ficha };
    return { ficha: null, aviso: estourou ? AVISO_FICHA_DEMOROU : undefined };
  } catch (err) {
    console.error("Não foi possível montar a ficha a partir do currículo.", err);
    return { ficha: null, aviso: AVISO_FICHA_FALHOU };
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}
