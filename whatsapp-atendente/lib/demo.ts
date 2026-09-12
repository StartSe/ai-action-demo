// Configuração de exemplo usada para o app já funcionar ao abrir, sem nenhuma chave configurada.
import type { Config } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

export const configExemplo: Config = {
  negocio: "Sorriso Pleno Odontologia",
  atendente: "Bia",
  tom: "cordial",
  horario: "segunda a sexta, das 8h às 18h, e aos sábados das 8h ao meio-dia",
  naoSei: "humano",
  baseConhecimento: `Sobre a clínica: a Sorriso Pleno Odontologia fica na Rua das Flores, 120, no Jardim América, em São Paulo. Atendemos há 12 anos com foco em odontologia geral, estética e ortodontia.

Horário de atendimento humano: segunda a sexta, das 8h às 18h, e aos sábados das 8h ao meio-dia. Fora desse horário, o atendente automático continua respondendo.

Serviços e preços:
- Consulta e avaliação inicial: R$ 120 (fica gratuita para quem fechar tratamento)
- Limpeza (profilaxia): R$ 150
- Clareamento dental a laser: R$ 900 em 3 sessões
- Aparelho ortodôntico metálico: a partir de R$ 2.400, mais manutenção mensal de R$ 180
- Aparelho invisível (alinhador): a partir de R$ 6.500, parcelado em até 12x
- Extração de dente do siso: R$ 450 por unidade
- Implante dentário: a partir de R$ 3.200 por unidade, com avaliação obrigatória antes do orçamento fechado

Prazos:
- O resultado do clareamento aparece depois da 2ª sessão, em cerca de 2 semanas
- O tratamento ortodôntico dura de 18 a 30 meses, dependendo do caso
- Implantes levam de 4 a 6 meses entre a cirurgia e a prótese final

Formas de pagamento: dinheiro, PIX, cartão de crédito em até 12x sem juros e convênios odontológicos (Odontoprev e Amil Dental). Não trabalhamos com reembolso de plano de saúde.

Cancelamento e remarcação: pedimos aviso com pelo menos 4 horas de antecedência. Faltas sem aviso podem gerar cobrança de 50% do valor da consulta.

Perguntas frequentes:
- Vocês atendem urgência? Sim, todos os dias, inclusive fins de semana, mediante confirmação por telefone.
- Tem estacionamento? Sim, conveniado no prédio ao lado, com desconto para pacientes.
- Posso levar meu filho? Sim, atendemos odontopediatria a partir dos 2 anos de idade.
- Fazem clareamento em quem tem restauração? Depende do caso, é avaliado na consulta inicial.`,
};
