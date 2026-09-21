# Histórico de versões

## 0.1.0 — 21/09/2026

- Primeira versão: base do app (conta, sessão, banco cifrado, proxy) e tela de três colunas: Dados, Conversa e Harness.
- Configurações no padrão do Build Agentflows: ChatGPT por código de dispositivo com limites da assinatura; OpenRouter em um clique (OAuth PKCE) ou chave colada; seção "Decisões rápidas (Jev)" com o botão Testar decisão; modelo da conversa e modelo para análises complexas.
- `lib/jev.ts`: cliente do Jev pelo OpenRouter com as três primitivas (choice, score, noul), normalização tolerante à beta, caminho alternativo e confiança como segundo eixo. Testes de contrato sem crédito.
- Planilhas em CSV e JSON até 20 MB: perfil local, agregados para a IA e classificação semântica das colunas pelo Jev em uma chamada (tipo, alvo de previsão, dado pessoal).
- Laço do harness por mensagem: triagem (Jev), roteamento, resposta (ChatGPT ou OpenRouter) só com agregados, verificação dos números (Jev) com reescrita, próximas perguntas ranqueadas. Cada decisão aparece na coluna Harness com probabilidade, confiança, tempo e custo.
- Modo demonstração com planilha de exemplo e três respostas calculadas localmente.
