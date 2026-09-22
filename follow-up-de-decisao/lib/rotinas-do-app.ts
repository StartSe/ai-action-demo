// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho.
import { acoesNaJanela } from "./acoes";
import { meta } from "./ai";
import { data } from "./formato";
import { salvar } from "./historico";
import { registrarExecutor, type Rotina } from "./rotinas";
import type { Acao } from "./types";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "cobranca-acoes", rotulo: "Cobrança de ações perto do prazo" }];

export const JANELA_PADRAO_DIAS = 3;

function prazoParaExibir(prazo: string): string {
  // "AAAA-MM-DD" vira meia-noite local (nunca a string crua direto no construtor de Date, que a
  // interpretaria como UTC e poderia mostrar o dia anterior num fuso negativo).
  return data(new Date(`${prazo}T00:00:00`), { comAno: true });
}

function textoCobranca(acoes: Acao[]): string {
  const linhas = acoes.map((a) => `- ${a.titulo}${a.dono ? ` — ${a.dono}` : " — sem dono definido"} (prazo ${prazoParaExibir(a.prazo)})`);
  const plural = acoes.length > 1;
  return `${acoes.length} ${plural ? "ações estão" : "ação está"} com prazo perto de vencer:\n${linhas.join("\n")}`;
}

/** Lê `janelaDias` dos parâmetros da rotina (cartão genérico de /setup não pergunta isso: quem cria a
 * rotina por um botão próprio do app manda o parâmetro; a rotina criada pelo seletor genérico usa o
 * padrão de 3 dias). */
function janelaDaRotina(rotina: Rotina): number {
  const bruto = (rotina.parametros as { janelaDias?: number } | null)?.janelaDias;
  const n = Number(bruto);
  return Number.isFinite(n) && n > 0 ? n : JANELA_PADRAO_DIAS;
}

registrarExecutor("cobranca-acoes", async (rotina) => {
  const janela = janelaDaRotina(rotina);
  const pendentes = acoesNaJanela(janela);
  const titulo = "Ações perto do prazo";

  // Nada para cobrar: marca a execução como feita, mas não manda uma mensagem vazia todo dia.
  if (pendentes.length === 0) {
    return { titulo, texto: `Nenhuma ação com prazo nos próximos ${janela} dias.`, enviar: false };
  }

  const texto = textoCobranca(pendentes);
  const metaGerada = meta({ demo: false, insumo: "as ações cadastradas com prazo próximo" });
  const resultadoId = salvar({
    tipo: "cobranca-acoes",
    titulo,
    resumo: texto.split("\n")[0],
    entrada: { janelaDias: janela },
    saida: { acoes: pendentes },
    meta: metaGerada,
  });

  return { titulo, texto, resultadoId };
});
