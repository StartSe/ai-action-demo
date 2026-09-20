# Bússola — observatório de inovação

## Direção e composição (antes da implementação)

A entrada é o painel do gestor, responsável por assessments de grupos: uma empresa inteira ou uma área. A unidade de acompanhamento é o assessment, com grupo, meta de participantes, prazo, respostas recebidas e diagnóstico. Respostas anônimas são contadas como submissões, nunca como pessoas únicas verificadas.

Identidade: navegação lateral azul-noite, superfícies claras e quentes, tipografia editorial, acento lima e turquesa. A peça central é uma bússola orbital vetorial com seis dimensões. Sem imagens decorativas genéricas. No celular, a navegação vira uma faixa compacta e os painéis se empilham.

Layout do painel: contexto e ação “Novo assessment”; faixa editorial com bússola; quatro indicadores reais; lista de assessments com progresso, filtro empresa/área, busca e status; painel de agentes e próximo passo. O estado vazio oferece criação e exploração de um exemplo claramente identificado.

Oficina: contexto do grupo → missão de inovação → proposta do agente Arquiteto → revisão de cobertura → editor → criação do link. O gestor revisa antes de publicar. Dados da organização, área, tamanho do grupo e objetivo acompanham a coleta.

Sala de análise: maturidade e radar interativo, perspectivas dos agentes (Analista, Crítico, Estrategista), comparação entre áreas, prioridades e exportação. Cálculos são determinísticos; IA escreve interpretações. Toda saída informa se veio de IA, de regras automáticas ou de exemplo.

## Etapas e critérios de aceite

1. **Fundação e painel do gestor**: navegação, identidade responsiva, indicadores reais, lista pesquisável e seleção de assessment; preservar resultados/exportação existentes. Validar lint, TypeScript/build e navegação no navegador. Commit parcial.
2. **Oficina e grupos**: empresa/área/meta persistidas, criação assistida com objetivo, validação da saída da IA, edição e coleta pública. Validar contratos, dados persistidos, criação e envio de resposta. Commit parcial.
3. **Análise com agentes e jornada de resposta**: conselho com proveniência e evidências, radar explorável, plano de ação, resposta por dimensão e progresso; preservar histórico e impressão. Validar cálculo, fallback, análise real e demonstração, teclado e mobile. Commit parcial.
4. **Auditoria final**: testes de ponta a ponta com banco temporário (sem tocar em contas/dados do usuário), erros de rede, grupo/participação, encerramento, exportação e reabertura. Inspeção visual desktop/mobile, lint e build. Documentação e commit final.

## Limites de interpretação

- Meta de participantes é diferente do limite técnico de respostas; percentual é adesão por submissões e pode ultrapassar a meta.
- Não inventar respostas, agentes em execução, históricos, tendências, comparativos de mercado ou economias financeiras.
- Nenhuma mensagem é enviada ao grupo automaticamente. O gestor copia/abre o link.
- Banco e autenticação existentes permanecem; novo contexto é opcional para registros antigos.
- IA externa só é testada ao vivo se já houver uma configuração de teste autorizada; contratos podem ser verificados com provedor simulado, sempre declarado.

## Validação e andamento

- Inspecionados os fluxos atuais de criação, coleta, análise, autenticação, histórico e exportação.
- Lidos os guias locais do Next.js instalado para componentes cliente/servidor e route handlers.
- Etapa 1 concluída: painel responsivo, navegação, busca/filtros, respostas por grupo, biblioteca de diagnósticos e bússola interativa. Build de produção passou; lint sem erros (um aviso anterior em setup.tsx); smoke em Chromium passou a 1440 px e 390 px, sem overflow nem exceções. Capturas inspecionadas. A oficina anterior fica temporariamente acessível até a etapa 2.
- Etapa 2 concluída: oficina própria substituiu formulário legado; escopo empresa/área, meta, objetivo, setor e porte; Arquiteto via IA ou modelo contextual com origem explícita; revisão por dimensão, editor completo, biblioteca e link. Contexto persistido e resultados associados ao assessment. Validação estrutural protege a metodologia contra saídas incompletas da IA. Modal nativo prende o foco. Três testes de domínio, fluxo Chromium de criação/publicação e persistência, lint e build passaram; telas inspecionadas a 1440 e 390 px.
