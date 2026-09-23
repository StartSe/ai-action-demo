// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps.
import { montarCarteira } from "./carteira";
import { moeda, percentual } from "./formato";
import { registrarExecutor, type TipoRotina } from "./rotinas";

/** Tipos de rotina disponíveis neste app, para o cartão de Configurações listar num seletor. */
export const TIPOS_ROTINA: TipoRotina[] = [{ tipo: "itens-fora-do-alvo", rotulo: "Itens que saíram do lucro" }];

/**
 * Alerta condicional, não resumo periódico: roda na frequência escolhida, mas só avisa quando há
 * item no vermelho ou abaixo da margem-alvo (`enviar: false` no resto). Uma mensagem semanal
 * dizendo "está tudo certo" vira ruído e a pessoa para de ler as que importam.
 */
registrarExecutor("itens-fora-do-alvo", async () => {
  const titulo = "Itens fora do lucro";
  const { linhas } = montarCarteira();
  const fora = linhas.filter((l) => l.estado === "prejuizo" || l.estado === "abaixo-do-alvo");
  if (fora.length === 0) return { titulo, texto: "Nenhum item abaixo da margem-alvo.", enviar: false };

  const vermelhos = fora.filter((l) => l.estado === "prejuizo");
  const descrever = (l: (typeof fora)[number]) => `${l.item.nome}: ${percentual(l.derivados.margemLiquidaPct)} de margem a ${moeda(l.preco)}`;
  const partes = [
    vermelhos.length ? `${vermelhos.length} no prejuízo — ${vermelhos.slice(0, 5).map(descrever).join("; ")}.` : "",
    `${fora.length} de ${linhas.length} itens estão abaixo da margem-alvo.`,
  ].filter(Boolean);

  return { titulo, texto: partes.join(" ") };
});
