# Revisão de UI e UX — 18/09/2026

Objetivo: orientar o gestor da criação da vaga ao compartilhamento do link e à leitura das métricas, preservando os fluxos existentes de avaliação e decisão humana.

## Diagnóstico e ajustes

| Ponto observado | Ajuste |
| --- | --- |
| O início não destacava a tarefa de gerar um link | Painel com ação explicada, escolha de vaga e acesso direto às métricas |
| Cadastro da vaga terminava na listagem | Redirecionamento para a vaga criada, onde está a geração do link |
| Cadastro de candidato pela vaga exigia procurar o convite | Retorno à vaga com abertura do convite correspondente, sem renovar seu prazo |
| Falha ao gerar convite após salvar a pessoa permitia refazer o cadastro | Estado de recuperação preserva o candidato e repete apenas a geração do convite |
| “Adicionar candidato” escondia o resultado da ação | Botão “Gerar link de entrevista” e diálogo que explica a escolha da pessoa |
| Validade aparecia como 15 dias mesmo em convites antigos | Exibição da data/hora real e seleção explícita de renovação |
| Diálogos não continham a navegação pelo teclado | Foco inicial, ciclo de Tab, Escape, retorno ao controle de origem e bloqueio da rolagem de fundo |
| Painel podia permanecer carregando após erro | Estado de erro com nova tentativa |
| Respostas atrasadas podiam substituir busca de candidatos ou métricas | Descarte de respostas obsoletas; métricas vinculadas ao filtro que as produziu |
| Filtros sumiam no relatório vazio | Filtros disponíveis também durante carregamento, erro e estado vazio |
| Indicador sugeria que gerar significava enviar convite | “Convites gerados” com explicação do que está sendo contado |
| Aumento de qualquer indicador era pintado como positivo | Variações neutras: uma fila maior não é necessariamente uma melhora |
| Contraste e foco pouco perceptíveis | Gradiente mais escuro, foco visível e diálogos com rolagem em telas pequenas |

A estrutura existente já oferece campos essenciais de vaga com opções avançadas recolhidas, comparação de candidatos, funil, filtros por vaga/período, exportação e pareceres. Esses recursos foram mantidos.

## Evidência e limites da validação

- TypeScript: verificado com `tsc --noEmit`.
- ESLint: sem erros; aviso preexistente de `img` em `components/setup.tsx`.
- 37 testes relevantes aprovados: fluxo vaga → candidato → convite → respostas → parecer, conclusão, avaliação e métricas (`fluxo-entrevista`, `conclusao`, `avaliacao`, `relatorios`).
- A suíte completa foi executada, mas os testes que abrem servidor HTTP falharam com `listen EPERM` neste ambiente.
- Build com webpack foi tentado, mas o download da fonte Manrope falhou com `ENOTFOUND fonts.googleapis.com`.
- O servidor de desenvolvimento foi tentado em `0.0.0.0` e `127.0.0.1`; ambos foram impedidos por `EPERM`. Não houve validação visual no navegador nesta sessão.

## Verificação ainda necessária em ambiente com servidor local

1. Desktop e celular (390 px): painel, cadastro de vaga, seleção/cadastro de candidato, convite e relatório; conferir que não há cortes ou rolagem horizontal.
2. Criar uma vaga e conferir o destino; cadastrar um candidato pela vaga e conferir abertura automática do link correto.
3. Copiar link/mensagem, renovar validade, fechar por Escape e navegar pelo diálogo com Tab/Shift+Tab.
4. Alternar rapidamente vaga/período e simular erro de rede; confirmar que nenhum número antigo aparece como resultado do novo filtro.
5. Abrir o link como candidato e percorrer o fluxo público em demonstração; validar o retorno do resultado no painel.
6. Simular falha na geração do convite após cadastrar a pessoa: conferir o estado “já está cadastrado”, repetir a geração e verificar que existe apenas um candidato e uma entrevista.
7. Reexecutar build e suíte completa em ambiente com acesso às fontes e permissão de abrir portas.

A revisão permanece pendente de validação visual e interativa; os testes de domínio não substituem essa etapa.

Continuação da revisão: TypeScript e lint reexecutados após a correção de recuperação do cadastro; os dois testes de integração do fluxo passaram, incluindo atribuição repetida sem duplicar entrevista. A validação dessa recuperação pela interface ainda depende do navegador. Nova tentativa do servidor em 127.0.0.1:3127 continuou bloqueada por `EPERM`.

## Ajustes solicitados com as capturas de tela

- Cadastro reduzido a nome, CV, LinkedIn opcional e anotação opcional. Contatos e termo de busca saíram do formulário inicial.
- Anotação salva nas observações da ficha com origem `gestor`, preservando a prioridade sobre informações do CV/web.
- Depois do cadastro e leitura do CV, etapa opcional de pesquisa mostra o nome mais empresa/cargo/cidade disponíveis, com termo editável. O LinkedIn informado é reaproveitado na pesquisa. O gestor pode continuar diretamente para a ficha ou o convite.
- A ficha existente também permite abrir a pesquisa complementar e revisar a consulta antes de dispará-la.
- Vagas em cartões responsivos, com indicadores de candidatos, entrevistas em andamento e pareceres. A ação principal é acompanhar/convidar; editar e apagar ficam em Opções.
- Relatórios têm uma única ação expansível para exportar, imprimir, copiar ou salvar; os indicadores ficam em destaque.
- Criação de conta direciona ao setup. Uma jornada de três etapas acompanha IA, primeira vaga e primeiro convite usando dados reais. Integrações opcionais e conexão a assistentes externos ficam recolhidas.

Validação desta rodada: 43 testes de cadastro, sugestão de busca, ficha, fluxo de entrevista e relatórios, mais 2 testes existentes de montagem da consulta, aprovados. TypeScript aprovado e lint sem erros (um aviso preexistente de imagem no setup). Servidor local novamente impedido por `listen EPERM`; aparência e navegação das telas alteradas ainda precisam de conferência em navegador.

## Currículo digital e enriquecimento acompanhado

- Ficha de leitura redesenhada como uma folha de CV, com identidade profissional, linha do tempo de experiências, formação e anotações; coluna lateral para contatos, LinkedIn, competências, idiomas e disponibilidade.
- Seções sem conteúdo deixam de ocupar cartões inteiros. Uma orientação única aparece quando ainda não há histórico profissional. Edição, fontes e identificação de origem dos dados foram preservadas.
- Busca complementar sempre visível acima do CV, com ação de enriquecimento destacada.
- Modal acompanha eventos reais persistidos em `progresso_pesquisa`, associados ao candidato e removidos junto dele: preparação, consultas executadas, organização pela IA e atualização da ficha. Não há percentuais ou etapas concluídas simuladas.
- O modal apresenta conclusão, necessidade de revisão de identidade, ausência de resultados, falha e perda de conexão. Fechar permite continuar em segundo plano; “Acompanhar enriquecimento” reabre o progresso. A ficha é recarregada após o término.
- Validação: 40 testes de cadastro, ficha, consulta, MCP e progresso aprovados; TypeScript aprovado. Lint sem erros, com aviso preexistente de imagem no setup. A validação visual no navegador permanece pendente devido à restrição já constatada para iniciar servidor local.

### Revisão dos resultados de enriquecimento

Editar e excluir ficam em botões de ícone à esquerda de atribuir uma vaga, com rótulos acessíveis. Toda pesquisa agora aguarda confirmação, mesmo com confiança alta. A seção de revisão apresenta campos encontrados e fontes, permite atualizar ou descartar e direciona ao currículo após aplicar. O modal de progresso leva diretamente à revisão. Testes com fetch simulado cobrem o fluxo completo, aprovação e descarte sem sobrescrever alterações do gestor.

A pesquisa complementar usa tags de nome, LinkedIn, cidade, empresa e palavras-chave. As seleções são enviadas por rodada e não alteram os campos do candidato. A IA prioriza combinações válidas; quando faltam resultados relevantes, a coleta tenta outra combinação, até três consultas e dentro do orçamento MCP. Sem IA disponível, utiliza a ordem local. O progresso mostra as consultas executadas.
