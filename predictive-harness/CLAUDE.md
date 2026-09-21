# Predictive Harness — decisões

Produto independente da suíte (`independente: true`, `padrao: "proprio"` no catálogo), criado em 21/09/2026 a partir da infraestrutura do `mapify` (conta, `lib/store.ts`, `lib/chatgpt.ts`, `proxy.ts`) e das conexões do `build-agentflows` (OAuth PKCE do OpenRouter em `app/api/conexoes/openrouter`, cartões em Configurações). A proposta e as rodadas estão em `PLANO.md`; esta é a rodada 1 (v0.1.0).

Regra central: o Jev decide, o LLM escreve. Toda decisão do sistema passa por `lib/jev.ts` (`decidir`) e é registrada na mensagem (`decisoes`, `harness`) para a coluna Harness. O Jev nunca gera conteúdo; só escolhe entre opções fechadas no código. Confiança abaixo de `CONFIANCA_MINIMA` (0,6) leva ao caminho conservador, nunca a um chute. Sem OpenRouter o harness não roda (não há "decidir com o LLM").

Dois provedores obrigatórios e explícitos: ChatGPT (Codex App Server, código de dispositivo) e OpenRouter (Jev e, opcionalmente, o modelo da conversa). Nunca há fallback silencioso entre eles (`lib/ai.ts`). `AI_MODEL_FORTE` é o único roteamento de modelo: entra quando a triagem marca complexidade ≥ 1,5 com confiança.

Jev no OpenRouter está em beta: `JEV_CAMINHOS` tenta `/api/v1/systemone` (documentado) e cai para `/api/alpha/decisions`, lembrando o que funcionou em `JEV_CAMINHO`. `normalizar()` aceita variações do formato de resposta. O botão "Testar decisão" mostra a resposta bruta de propósito, para a equipe conferir o formato real na primeira conexão com chave de verdade. Os testes de contrato (`lib/jev.test.ts`) não gastam crédito.

Planilhas: linhas nunca vão para a IA; só perfil e agregados (`resumoParaIA`, ≤ 9 mil caracteres). Identificadores não têm valores listados no resumo. CSV e JSON nesta versão; XLSX recusado com mensagem clara (próxima versão). Classificação semântica pelo Jev limitada a 40 colunas por chamada; o resto segue a heurística local.

Demonstração: `lib/demo.ts` gera a planilha de exemplo de forma determinística e calcula as três respostas a partir dela (números verdadeiros), com decisões marcadas `exemplo: true`. Perguntas livres em demonstração devolvem 409 com instrução de conectar.

Verificar: `npm test`, `npm run lint`, `npm run build`, servidor standalone com `curl` em `/api/health`, `/api/status`, `/api/planilhas`, `/api/planilhas/<id>/conversa` (pergunta sugerida em demo e 409 em pergunta livre), `/api/conexoes`, `/api/conexoes/jev/testar` (409 sem chave), upload multipart. `scripts/verificar-padrao.sh`, `verificar-jargao.mjs` e `verificar-paleta.mjs` pulam apps com `padrao: "proprio"`. Sem chave real do OpenRouter nesta rodada, o endpoint do Jev e a calibração em português ficaram por confirmar (risco registrado no PLANO.md).
