// Rascunho da camada 2 de descoberta: o roteiro do propósito (RF-306, US-138).
//
// **PROVISÓRIO. DEPENDE DA PERGUNTA 1 EM ABERTO** (seção 13 de docs/PRD.md: o
// que a Sarah oferece, para quem, e o que caracteriza um lead qualificado). O
// texto de verdade do roteiro de descoberta sai da oferta e da definição de
// lead qualificado, e nenhuma das duas está decidida. O que está aqui é a forma
// do roteiro, com as perguntas genéricas de dor e de encaixe, para que a
// compilação das três camadas tenha o que compilar e o teste tenha o que medir.
// Quando a pergunta 1 fechar, este texto é reescrito — ou some, se o roteiro
// passar a nascer só de `playbook-draft`.
//
// **A camada 2 é editável e mora no banco** (`playbook_versions.body_script`).
// Esta constante não é o roteiro de conta nenhuma: é o rascunho de referência,
// e é o que as provas da compilação usam como camada 2 de descoberta.
//
// **Sem agenda (O-06).** Da F2 à F4 não existe ferramenta de agenda. O roteiro
// não oferece dia nem hora e não promete convite; o fechamento é o da camada 1,
// que pergunta canal e período do dia. A varredura que cobra isso está em
// `camada-um.test.ts`, junto com as falas de descoberta.
//
// **Não repete regra da casa.** O aviso de gravação, a qualificação antes de
// encerrar e as regras travadas vêm da camada 1; reescrevê-los aqui com outras
// palavras daria duas instruções para a mesma coisa.
//
// Módulo portável: sem `Deno`, sem rede, sem banco.

export const ROTEIRO_DE_DESCOBERTA_PROVISORIO = [
  '1. Depois do aviso de gravação, diga em uma frase por que está ligando e pergunte se a pessoa tem dois minutos.',
  '2. Pergunte como a empresa resolve atualmente o problema que a oferta resolve. Ouça antes de explicar qualquer coisa.',
  '3. Aprofunde a dor: o que isso atrapalha, com que frequência, e quanto pesa no mês.',
  '4. Confirme o encaixe com perguntas abertas sobre o tamanho da operação e quem decide a compra. Não pressione por resposta.',
  '5. Se houver interesse, diga que um especialista vai procurar a pessoa para continuar a conversa.',
  '6. Se não houver interesse, agradeça e não insista.',
].join('\n')
