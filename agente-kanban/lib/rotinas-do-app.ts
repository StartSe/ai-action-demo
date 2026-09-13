// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho (ver padrão em app/api/f/[token]/route.ts com lib/pdi.ts).
import { meta } from "./ai";
import type { ResultadoAgente } from "./agente";
import { salvar } from "./historico";
import { quadroExemploFixo } from "./quadro-demo";
import { trelloConfigurado, type Cartao, type Quadro } from "./quadro";
import { registrarExecutor } from "./rotinas";
import { trello } from "./trello";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "resumo-quadro", rotulo: "Resumo matinal do quadro" }];

const DIAS_PARADO = 5;
const CARTOES_SOBRECARGA = 5;

/** Cartões considerados "ativos": todas as listas menos a última, tratada como a coluna de concluídos
 * (convenção comum de quadro Kanban); um cartão já concluído não precisa de alerta de atraso ou de parado. */
function cartoesAtivos(quadro: Quadro): Cartao[] {
  return quadro.listas.slice(0, -1).flatMap((l) => l.cartoes);
}

function estaAtrasado(c: Cartao, hoje: string): boolean {
  return Boolean(c.vencimento && c.vencimento < hoje);
}

function estaParado(c: Cartao, limite: number): boolean {
  return new Date(c.atualizadoEm).getTime() < limite;
}

function responsaveisSobrecarregados(cartoes: Cartao[]): { nome: string; total: number }[] {
  const porResponsavel = new Map<string, number>();
  for (const c of cartoes) {
    for (const nome of c.responsavel.split(",").map((s) => s.trim()).filter(Boolean)) {
      porResponsavel.set(nome, (porResponsavel.get(nome) || 0) + 1);
    }
  }
  return [...porResponsavel.entries()].filter(([, total]) => total > CARTOES_SOBRECARGA).map(([nome, total]) => ({ nome, total }));
}

function listarNomes(cartoes: Cartao[]): string {
  return cartoes.map((c) => c.nome).join(", ");
}

function pluralCartao(n: number): string {
  return n > 1 ? "cartões" : "cartão";
}

function montarTexto(atrasados: Cartao[], parados: Cartao[], sobrecarregados: { nome: string; total: number }[]): string {
  const linhas: string[] = [];
  if (atrasados.length > 0) {
    linhas.push(`${atrasados.length} ${pluralCartao(atrasados.length)} atrasado${atrasados.length > 1 ? "s" : ""}: ${listarNomes(atrasados)}.`);
  }
  if (parados.length > 0) {
    linhas.push(`${parados.length} ${pluralCartao(parados.length)} parado${parados.length > 1 ? "s" : ""} há mais de ${DIAS_PARADO} dias: ${listarNomes(parados)}.`);
  }
  if (sobrecarregados.length > 0) {
    const lista = sobrecarregados.map((s) => `${s.nome} (${s.total} cartões)`).join(", ");
    linhas.push(`Responsáve${sobrecarregados.length > 1 ? "is" : "l"} com mais de ${CARTOES_SOBRECARGA} cartões: ${lista}.`);
  }
  return linhas.length > 0 ? linhas.join(" ") : "Nenhum cartão atrasado ou parado, e ninguém sobrecarregado. Quadro em dia.";
}

registrarExecutor("resumo-quadro", async () => {
  const trelloConectado = trelloConfigurado();
  const quadro = trelloConectado ? await trello.obterQuadro() : quadroExemploFixo();

  const ativos = cartoesAtivos(quadro);
  const hoje = new Date().toISOString().slice(0, 10);
  const limiteParado = Date.now() - DIAS_PARADO * 24 * 60 * 60 * 1000;
  const atrasados = ativos.filter((c) => estaAtrasado(c, hoje));
  const parados = ativos.filter((c) => estaParado(c, limiteParado));
  const sobrecarregados = responsaveisSobrecarregados(ativos);

  const titulo = "Resumo do quadro";
  const texto = montarTexto(atrasados, parados, sobrecarregados);
  // meta.demo aqui é sobre o quadro (Trello real x quadro de exemplo), não sobre IA: esta rotina nunca
  // chama IA, o que importa para quem lê o link é se o quadro mostrado é o de verdade ou um exemplo.
  const metaGerada = meta({ demo: !trelloConectado, insumo: "o quadro atual" });
  const resultado: ResultadoAgente = { resposta: texto, acoes: [], quadro, alterados: [], desfazer: null };
  const resultadoId = salvar({ tipo: "agente-kanban", titulo, entrada: { mensagem: titulo }, saida: resultado, meta: metaGerada });

  return { titulo, texto, resultadoId };
});
