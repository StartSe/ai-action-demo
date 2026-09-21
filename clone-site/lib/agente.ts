// O agente do site: uma conversa em português que EDITA a página por ferramentas (nunca por texto solto),
// troca imagens, publica a pedido e lê as métricas. Edição por trecho (`editar_trecho`, casamento exato de
// `antigo` → `novo`, como o edit_file do screenshot-to-code) é a ferramenta principal: barata e não corrompe o
// resto; `reescrever_pagina` (arquivo inteiro) fica para mudanças estruturais. Todas as mudanças de um pedido
// viram UMA versão nova (rascunho); publicar é explícito. Corre no motor escolhido (lib/motor.ts).
import crypto from "node:crypto";
import { listar as listarAssets } from "./assets";
import { edicaoDemo, esperar } from "./demo";
import { ErroDePedido, novaVersao, paginaAtual } from "./gerador";
import { resumoEmTexto } from "./metricas";
import { executarComFerramentas, iaDisponivel, type FerramentaAgente } from "./motor";
import { obter as obterProjeto, paginaDoProjeto, ProjetoNaoEncontrado, publicar as publicarProjeto } from "./projetos";
import { abrirBanco } from "./store";
import type { Pagina, Projeto } from "./types";

export type PapelMensagem = "pessoa" | "agente";
export type Mensagem = { id: string; projetoId: string; papel: PapelMensagem; texto: string; versaoN: number | null; passos: string[]; criadoEm: string };

export const LIMITE_PEDIDO = 2000;
const HISTORICO_MENSAGENS = 12;
const LIMITE_HTML_NO_PROMPT = 40_000;
const LIMITE_HTML_FERRAMENTA = 60_000;

/** Nomes das ferramentas como aparecem na tela ("passos" do agente). */
export const ROTULO_PASSO: Record<string, string> = {
  ver_pagina: "Lendo a página",
  editar_trecho: "Editando um trecho",
  reescrever_pagina: "Reescrevendo a página",
  trocar_imagem: "Trocando uma imagem",
  listar_imagens: "Conferindo as imagens",
  publicar: "Publicando",
  ver_metricas: "Lendo as métricas",
};

let tabelaPronta = false;
function db() {
  const d = abrirBanco();
  if (!tabelaPronta) {
    d.exec(`CREATE TABLE IF NOT EXISTS mensagens (
      id TEXT PRIMARY KEY,
      projetoId TEXT NOT NULL,
      papel TEXT NOT NULL,
      texto TEXT NOT NULL,
      versaoN INTEGER NULL,
      passos TEXT NOT NULL DEFAULT '[]',
      criadoEm TEXT NOT NULL
    )`);
    d.exec(`CREATE INDEX IF NOT EXISTS mensagens_projeto ON mensagens (projetoId, criadoEm)`);
    tabelaPronta = true;
  }
  return d;
}

type Linha = { id: string; projetoId: string; papel: PapelMensagem; texto: string; versaoN: number | null; passos: string; criadoEm: string };

function paraMensagem(l: Linha): Mensagem {
  let passos: string[] = [];
  try { passos = JSON.parse(l.passos); } catch { /* sem passos */ }
  return { id: l.id, projetoId: l.projetoId, papel: l.papel, texto: l.texto, versaoN: l.versaoN, passos, criadoEm: l.criadoEm };
}

function gravar(projetoId: string, papel: PapelMensagem, texto: string, versaoN: number | null = null, passos: string[] = []): Mensagem {
  const id = crypto.randomBytes(9).toString("base64url");
  const criadoEm = new Date().toISOString();
  db().prepare("INSERT INTO mensagens (id, projetoId, papel, texto, versaoN, passos, criadoEm) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, projetoId, papel, texto, versaoN, JSON.stringify(passos), criadoEm);
  return { id, projetoId, papel, texto, versaoN, passos, criadoEm };
}

export function listarMensagens(projetoId: string, limite = 50): Mensagem[] {
  const linhas = db().prepare("SELECT * FROM mensagens WHERE projetoId = ? ORDER BY criadoEm DESC LIMIT ?").all(projetoId, limite) as Linha[];
  return linhas.reverse().map(paraMensagem);
}

export function limparConversa(projetoId: string): void {
  db().prepare("DELETE FROM mensagens WHERE projetoId = ?").run(projetoId);
}

// ---------------------------------------------------------------------------------------------------------
// Edição por trecho e inserção de imagem
// ---------------------------------------------------------------------------------------------------------

export type Edicao = { antigo: string; novo: string };

/** Aplica todas as edições (casamento exato) ou nenhuma; lança com a frase que o modelo consegue corrigir. */
export function aplicarEdicoes(html: string, edicoes: Edicao[]): string {
  if (!Array.isArray(edicoes) || edicoes.length === 0) throw new Error("Informe ao menos uma edição com `antigo` e `novo`.");
  let saida = html;
  for (const e of edicoes) {
    if (typeof e?.antigo !== "string" || !e.antigo.trim() || typeof e?.novo !== "string") throw new Error("Cada edição precisa de `antigo` (texto exato do código atual) e `novo`.");
    const ocorrencias = saida.split(e.antigo).length - 1;
    if (ocorrencias === 0) throw new Error(`Trecho não encontrado no código atual: «${e.antigo.slice(0, 120)}». Copie o trecho exatamente como está (use ver_pagina).`);
    if (ocorrencias > 1) throw new Error(`O trecho «${e.antigo.slice(0, 80)}» aparece ${ocorrencias} vezes: inclua mais contexto em volta para ele ficar único.`);
    saida = saida.replace(e.antigo, () => e.novo);
  }
  return saida;
}

function escaparAtributo(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Coloca a imagem `url` na região pedida: troca o primeiro bloco de imagem (role="img") ou <img> da região; sem
 * nenhum, insere logo depois da abertura do elemento. Regiões: cabecalho (<header>), rodape (<footer>),
 * heroi (primeira <section> ou <main>), ou um texto que exista na página (a região vira o elemento que o contém).
 */
export function inserirImagem(html: string, url: string, alt: string, onde: string): string {
  const abertura =
    /cabe/i.test(onde) ? /<header\b[^>]*>/i
    : /roda/i.test(onde) ? /<footer\b[^>]*>/i
    : /her[oó]i|topo|principal/i.test(onde) ? /<(section|main)\b[^>]*>/i
    : null;
  let inicio = -1;
  let fim = html.length;
  if (abertura) {
    const m = abertura.exec(html);
    if (!m) throw new Error(`A página não tem a região «${onde}». Use editar_trecho com o trecho exato.`);
    inicio = m.index + m[0].length;
    const tag = m[0].match(/^<(\w+)/)?.[1] ?? "section";
    const fecha = html.indexOf(`</${tag}`, inicio);
    fim = fecha > 0 ? fecha : html.length;
  } else if (onde?.trim()) {
    const idx = html.indexOf(onde.trim());
    if (idx < 0) throw new Error(`Não encontrei «${onde.slice(0, 80)}» na página. Use editar_trecho com o trecho exato.`);
    inicio = idx;
    fim = Math.min(html.length, idx + 4000);
  } else {
    throw new Error("Diga onde a imagem entra: cabeçalho, herói, rodapé ou um texto da página.");
  }
  const regiao = html.slice(inicio, fim);
  const img = `<img src="${escaparAtributo(url)}" alt="${escaparAtributo(alt)}" class="block max-w-full h-auto object-cover rounded-xl">`;
  const bloco = /<(div|span)\b[^>]*role="img"[^>]*>[\s\S]*?<\/\1>|<img\b[^>]*>/i.exec(regiao);
  if (bloco) {
    const ehLogo = /cabe|roda/i.test(onde);
    const trocado = ehLogo ? `<img src="${escaparAtributo(url)}" alt="${escaparAtributo(alt)}" class="h-9 w-auto">` : img;
    return html.slice(0, inicio) + regiao.replace(bloco[0], () => trocado) + html.slice(fim);
  }
  return html.slice(0, inicio) + img + html.slice(inicio);
}

// ---------------------------------------------------------------------------------------------------------
// A conversa
// ---------------------------------------------------------------------------------------------------------

export type RespostaAgente = { resposta: string; versoes: number[]; publicou: boolean; passos: string[]; pagina: Pagina; projeto: Projeto; mensagens: Mensagem[] };

/**
 * Eventos ao vivo de um pedido, para a tela acompanhar em tempo real (app/api/sites/[id]/agente, resposta em
 * linhas JSON): cada ferramenta chamada (`passo`) e cada mudança no HTML de trabalho (`previa`, o rascunho
 * inteiro, antes mesmo de virar versão). Quem não passa callbacks recebe só a resposta final, como antes.
 */
export type EventosAgente = { aoPasso?: (nome: string) => void; aoPrevia?: (html: string) => void };

/** O resumo de métricas que o agente conhece (lib/metricas.ts), em uma frase. */
const resumoMetricas = (projetoId: string, dias: number): string => resumoEmTexto(projetoId, dias);

function montarSystem(projeto: Projeto, pagina: Pagina, metricas: string): string {
  const atual = pagina.versoes[pagina.versoes.length - 1];
  const assets = listarAssets(projeto.id);
  const linhasAssets = assets.length
    ? assets.map((a) => `- ${a.papel === "logo" ? "Logo" : "Imagem"} (id ${a.id}): ${a.url}${a.descricao ? ` — ${a.descricao}` : ""}`).join("\n")
    : "- nenhuma imagem enviada ainda (a pessoa pode enviar no painel Imagens)";
  const marca = projeto.marca ? `${projeto.marca.nome || "sem nome"}, cor principal ${projeto.marca.corPrimaria}${projeto.marca.corSecundaria ? `, cor secundária ${projeto.marca.corSecundaria}` : ""}` : "não informada";
  const codigo = atual.html.length <= LIMITE_HTML_NO_PROMPT ? `\n\nCódigo atual da página (versão ${atual.n}):\n${atual.html}` : `\n\nO código atual tem ${atual.html.length} caracteres: chame ver_pagina antes de editar.`;
  return `Você é o funcionário que cuida do site «${projeto.nome}» da empresa «${projeto.marca?.nome || projeto.nome}». Você conversa com a dona ou o dono do negócio, que não programa.

O que você sabe:
- Marca: ${marca}.
- Formato do site: arquivo HTML único${/cdn\.tailwindcss\.com/.test(atual.html) ? " com Tailwind pela CDN" : " com CSS próprio em <style>"}.
- Versão atual (rascunho): ${atual.n}. Versão publicada (no ar): ${projeto.versaoPublicada ?? atual.n}. Link público: /s/${projeto.slug}.
- Imagens da empresa (use exatamente estes endereços em <img src>):
${linhasAssets}
- Métricas dos últimos 7 dias: ${metricas}

Regras:
- Toda mudança na página passa por ferramentas: editar_trecho para mudanças pontuais (copie o trecho EXATO do código atual em "antigo"), reescrever_pagina só quando a estrutura muda muito, trocar_imagem para colocar uma imagem da empresa. Nunca descreva uma mudança sem executá-la e nunca cole código na resposta.
- Faça o que foi pedido em um único pedido: várias edições cabem numa só chamada de editar_trecho (lista "edicoes"). Tudo o que você mudar vira uma versão nova, em rascunho.
- Só publique (ferramenta publicar) quando a pessoa pedir explicitamente para publicar, colocar no ar ou atualizar o link. Caso contrário, diga que a mudança está no rascunho e que ela pode publicar quando quiser.
- Mantenha textos em português do Brasil, com tamanho parecido com o que substituem. Não invente dados da empresa (telefone, endereço, preços) que a pessoa não deu: pergunte.
- Continue sem copiar fotos ou textos de outras empresas; onde não houver imagem da empresa, o bloco na cor da marca fica.
- Não inclua <script> além do Tailwind pela CDN (quando já existir), nem atributos de evento, nem conteúdo de outras origens além do Google Fonts, do Tailwind e das imagens da empresa.
- Responda curto (uma a três frases), em português, dizendo o que mudou e em qual versão. Sem código, sem listas longas.${codigo}`;
}

const SCHEMA_VAZIO = { type: "object", properties: {} };

/**
 * Um pedido da pessoa → resposta do agente. Grava as duas mensagens; toda mudança feita pelas ferramentas vira
 * UMA versão nova ao fim do pedido (ou antes de publicar, quando a pessoa pediu para publicar).
 */
export async function conversar(projetoId: string, textoBruto: unknown, eventos: EventosAgente = {}): Promise<RespostaAgente> {
  const texto = typeof textoBruto === "string" ? textoBruto.trim().slice(0, LIMITE_PEDIDO) : "";
  if (!texto) throw new ErroDePedido("Escreva o que você quer mudar ou saber sobre o site.");
  const projeto = obterProjeto(projetoId);
  if (!projeto) throw new ProjetoNaoEncontrado();
  if (projeto.estado !== "pronto" || !projeto.paginaId) throw new ErroDePedido("O site ainda não está pronto. O agente entra em ação assim que ele for gerado.");
  const salva = paginaDoProjeto(projeto);
  if (!salva) throw new ErroDePedido("A página deste site não foi encontrada. Gere o site de novo.");

  const historicoAnterior = listarMensagens(projetoId, HISTORICO_MENSAGENS);
  gravar(projetoId, "pessoa", texto);

  // Estado de trabalho do pedido: o HTML vai sendo alterado pelas ferramentas e vira uma versão só no fim.
  let html = salva.pagina.versoes[salva.pagina.versoes.length - 1].html;
  let alterado = false;
  let publicou = false;
  const versoes: number[] = [];
  const passos: string[] = [];

  const salvarSeAlterado = () => {
    if (!alterado) return;
    const { versao } = novaVersao(projeto.paginaId!, html, texto);
    versoes.push(versao.n);
    html = versao.html;
    alterado = false;
    eventos.aoPrevia?.(html);
  };
  /** Toda ferramenta que mexe no HTML avisa a tela na hora: a prévia muda antes de a versão ser gravada. */
  const mudou = () => {
    alterado = true;
    eventos.aoPrevia?.(html);
  };

  const ferramentas: FerramentaAgente[] = [
    {
      nome: "ver_pagina",
      descricao: "Devolve o código HTML atual da página (o rascunho, com as mudanças já feitas neste pedido).",
      schema: SCHEMA_VAZIO,
      async executar() {
        if (html.length <= LIMITE_HTML_FERRAMENTA) return html;
        const secoes = html.match(/<(header|section|main|footer)\b[\s\S]*?<\/\1>/gi) ?? [];
        return `A página tem ${html.length} caracteres; seções (${secoes.length}):\n` + secoes.map((s, i) => `--- seção ${i + 1} ---\n${s.slice(0, 6000)}`).join("\n");
      },
    },
    {
      nome: "editar_trecho",
      descricao: "Substitui trechos exatos do código atual. Cada edição tem `antigo` (texto exato, único no código) e `novo`. Todas as edições são aplicadas juntas ou nenhuma; se um trecho não for encontrado, a resposta diz qual.",
      schema: {
        type: "object",
        properties: { edicoes: { type: "array", items: { type: "object", properties: { antigo: { type: "string" }, novo: { type: "string" } }, required: ["antigo", "novo"] }, minItems: 1 } },
        required: ["edicoes"],
      },
      async executar(args) {
        html = aplicarEdicoes(html, (args.edicoes as Edicao[]) ?? []);
        mudou();
        return { ok: true, edicoes: (args.edicoes as Edicao[]).length, tamanho: html.length };
      },
    },
    {
      nome: "reescrever_pagina",
      descricao: "Troca a página inteira por um HTML completo novo (de <html> a </html>). Use só para mudanças estruturais grandes; para ajustes pontuais, prefira editar_trecho.",
      schema: { type: "object", properties: { html: { type: "string", description: "O arquivo HTML completo" } }, required: ["html"] },
      async executar(args) {
        const novo = String(args.html ?? "");
        if (!/<html[\s>]/i.test(novo) || !/<\/html>/i.test(novo)) throw new Error("Envie o arquivo inteiro, de <html> até </html>.");
        html = novo;
        mudou();
        return { ok: true, tamanho: html.length };
      },
    },
    {
      nome: "trocar_imagem",
      descricao: "Coloca uma imagem da empresa (pelo id da lista) numa região: 'cabecalho' (logo), 'heroi', 'rodape' ou um texto que exista na página. Troca o bloco de imagem da região ou insere a imagem no começo dela.",
      schema: { type: "object", properties: { assetId: { type: "string" }, onde: { type: "string", description: "cabecalho | heroi | rodape | um texto da página" } }, required: ["assetId", "onde"] },
      async executar(args) {
        const asset = listarAssets(projeto.id).find((a) => a.id === String(args.assetId));
        if (!asset) throw new Error("Imagem não encontrada. Use listar_imagens para ver os ids.");
        html = inserirImagem(html, asset.url, asset.descricao || projeto.marca?.nome || asset.nome, String(args.onde ?? ""));
        mudou();
        return { ok: true, url: asset.url };
      },
    },
    {
      nome: "listar_imagens",
      descricao: "Lista o logo e as imagens enviadas pela empresa (id, papel, descrição e endereço).",
      schema: SCHEMA_VAZIO,
      async executar() {
        return listarAssets(projeto.id).map((a) => ({ id: a.id, papel: a.papel, descricao: a.descricao, url: a.url }));
      },
    },
    {
      nome: "publicar",
      descricao: "Publica uma versão no link público (/s/<slug>). Sem `n`, publica a versão mais recente (incluindo as mudanças deste pedido). Só use quando a pessoa pedir para publicar.",
      schema: { type: "object", properties: { n: { type: "integer", description: "Número da versão (opcional)" } } },
      async executar(args) {
        salvarSeAlterado();
        const { versao } = publicarProjeto(projeto.id, args.n ?? undefined);
        publicou = true;
        return { ok: true, versaoPublicada: versao.n, link: `/s/${projeto.slug}` };
      },
    },
    {
      nome: "ver_metricas",
      descricao: "Visitas do site publicado: total, por dia, celular × computador e de onde vieram, nos últimos N dias (7 ou 30).",
      schema: { type: "object", properties: { dias: { type: "integer", enum: [7, 30] } } },
      async executar(args) {
        return resumoMetricas(projeto.id, Number(args.dias) === 30 ? 30 : 7);
      },
    },
  ];

  let resposta: string;
  if (!(await iaDisponivel())) {
    // Demonstração: a mudança é ilustrativa (lib/demo.ts), mas o fluxo (versão nova, publicar a pedido) é real.
    await esperar(1000);
    const querPublicar = /\bpubli|no ar|atualiz\w* o link/i.test(texto);
    const querMetrica = /m[ée]tric|visita|acess|quantas pessoas|como est[aá]/i.test(texto);
    if (querMetrica && !querPublicar) {
      passos.push("ver_metricas");
      eventos.aoPasso?.("ver_metricas");
      resposta = `Sem a inteligência artificial conectada eu só consigo ler os números: ${resumoMetricas(projeto.id, 7)}`;
    } else {
      passos.push("editar_trecho");
      eventos.aoPasso?.("editar_trecho");
      html = edicaoDemo(html, salva.pagina.versoes.length + 1);
      mudou();
      await esperar(700);
      salvarSeAlterado();
      if (querPublicar) {
        passos.push("publicar");
        eventos.aoPasso?.("publicar");
        publicarProjeto(projeto.id);
        publicou = true;
      }
      resposta = `Apliquei uma mudança de exemplo na versão ${versoes[0]} (sem a inteligência artificial conectada, a alteração é ilustrativa e não segue o seu pedido).${publicou ? " Publiquei essa versão no link do site." : " Ela está em rascunho: publique quando quiser."}`;
    }
  } else {
    const metricas = resumoMetricas(projeto.id, 7);
    const system = montarSystem(projeto, salva.pagina, metricas);
    const mensagens = [...historicoAnterior.map((m) => ({ papel: m.papel, texto: m.texto })), { papel: "pessoa" as const, texto }];
    const textoFinal = await executarComFerramentas({ system, mensagens, ferramentas, aoChamar: (nome) => { passos.push(nome); eventos.aoPasso?.(nome); } });
    salvarSeAlterado();
    resposta = textoFinal.trim() || (versoes.length ? `Pronto: a mudança está na versão ${versoes[versoes.length - 1]}.` : "Não fiz nenhuma mudança desta vez. Pode detalhar o que você quer?");
  }

  const projetoAtual = obterProjeto(projetoId)!;
  const paginaAtualizada = paginaDoProjeto(projetoAtual)!.pagina;
  gravar(projetoId, "agente", resposta, versoes.length ? versoes[versoes.length - 1] : null, passos);
  return { resposta, versoes, publicou, passos, pagina: paginaAtualizada, projeto: projetoAtual, mensagens: listarMensagens(projetoId) };
}

/** Só para o MCP (`editar_pagina`) reaproveitar a mesma conversa: devolve a página e a versão nova (se houve). */
export async function editarPeloAgente(projetoId: string, instrucao: unknown) {
  const r = await conversar(projetoId, instrucao);
  const atual = paginaAtual(r.pagina.id);
  return { ...r, versao: atual.atual };
}
