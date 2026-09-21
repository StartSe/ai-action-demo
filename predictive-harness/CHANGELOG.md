# Histórico de versões

## 0.2.1 — 21/09/2026

- A imagem de produção instala `ca-certificates`, como no Mapify, para que o binário nativo do Codex tenha os certificados HTTPS necessários ao solicitar o código de conexão do ChatGPT. É preciso reconstruir e implantar a imagem para aplicar a correção.

## 0.2.0 — 21/09/2026

- **O produto vira um agente de FP&A**: a unidade econômica é a turma, e a tela passa de "dados / conversa / harness" para **Base e premissas / Conversa / Como cheguei aqui**.
- `lib/fpa.ts`: motor determinístico com margem de contribuição por turma, ponto de equilíbrio, cenário de novas turmas com impacto na margem do período, sensibilidade ranqueada e meta reversa (marketing por aluno, ticket, alunos, custo fixo, desconto), mais as fórmulas em português com os números substituídos. Testado com casos fechados, sem IA.
- Papel de FP&A por coluna (heurística local e uma pergunta a mais por coluna na chamada do Jev), confirmado pela pessoa em um passo; o papel da planilha (matrículas, custos, marketing) sai dele.
- Produtos e turmas detectados na base, com premissas calculadas do histórico e o livro de premissas por produto: cada premissa mostra a origem (da base, informada, sugerida) e é editável. Sugeridas nunca entram numa conta sem confirmação.
- Laço do harness de FP&A: triagem com tipo da pergunta, premissas envolvidas em paralelo, horizonte e impacto; tradução da pergunta em especificação fechada validada campo a campo; motor; narrativa escrita só com os números do motor; verificação de números, premissa implícita e validação humana.
- Cartões em SVG desenhados do resultado: cascata do cenário, sensibilidade, ponto de equilíbrio, meta reversa e o formulário de premissas faltantes com as sugestões pontuadas pelo Jev. Cada gráfico traz a tabela equivalente.
- "Como cheguei aqui": premissas usadas, fórmula e decisões. Ajustar uma premissa recalcula na hora, só no motor, sem custo e sem chamada ao modelo.
- Demonstração nova: escola de negócios fictícia com matrículas, custos e marketing de 24 meses e quatro perguntas, uma por categoria (diagnóstico, cenário, meta reversa, risco).
- A versão instalada aparece discretamente ao lado do título, e `/api/health` passa a lê-la do `package.json` (uma fonte só).

## 0.1.0 — 21/09/2026

- Primeira versão: base do app (conta, sessão, banco cifrado, proxy) e tela de três colunas: Dados, Conversa e Harness.
- Configurações no padrão do Build Agentflows: ChatGPT por código de dispositivo com limites da assinatura; OpenRouter em um clique (OAuth PKCE) ou chave colada; seção "Decisões rápidas (Jev)" com o botão Testar decisão; modelo da conversa e modelo para análises complexas.
- `lib/jev.ts`: cliente do Jev pelo OpenRouter com as três primitivas (choice, score, noul), normalização tolerante à beta, caminho alternativo e confiança como segundo eixo. Testes de contrato sem crédito.
- Planilhas em CSV e JSON até 20 MB: perfil local, agregados para a IA e classificação semântica das colunas pelo Jev em uma chamada (tipo, alvo de previsão, dado pessoal).
- Laço do harness por mensagem: triagem (Jev), roteamento, resposta (ChatGPT ou OpenRouter) só com agregados, verificação dos números (Jev) com reescrita, próximas perguntas ranqueadas. Cada decisão aparece na coluna Harness com probabilidade, confiança, tempo e custo.
- Modo demonstração com planilha de exemplo e três respostas calculadas localmente.
