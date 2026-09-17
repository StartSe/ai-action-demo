# Progresso — PRD Simulador de Vendas (Produto → Simulação → Sessões)

PRD: `tasks/prd-simulador-vendas-produto-simulacao-sessoes.md`
Uma história por sessão de trabalho, na ordem do PRD. Marque aqui ao terminar (lint + build + verificação).

## Estado

- [x] US-001 — App independente e os seis destinos
- [x] US-002 — Produto, Simulação, Sessão e Participante no banco
- [x] US-003 — Biblioteca de produtos
- [x] US-004 — Ensinar o produto pela landing page
- [x] US-005 — Ensinar o produto por documentos e por texto
- [ ] US-006 — A ficha do produto
- [ ] US-007 — Catálogo de personas
- [ ] US-008 — Atribuição equilibrada da persona
- [ ] US-009 — Criar simulação em três passos
- [ ] US-010 — Metodologias e rubricas
- [ ] US-011 — Regras da simulação e o link
- [ ] US-012 — Lista de simulações
- [ ] US-013 — Identificação do vendedor
- [ ] US-014 — Preparação "Seu cliente"
- [ ] US-015 — Sala por voz do navegador (nível 2)
- [ ] US-016 — Sala com o agente conversacional (nível 1)
- [ ] US-017 — Tentativas, retomada e histórico do vendedor
- [ ] US-018 — Agente avaliador
- [ ] US-019 — Feedback que ensina
- [ ] US-020 — E-mail do resultado
- [ ] US-021 — Modelo de IA por tarefa (nasce no pdi-time)
- [ ] US-022 — Painel da simulação — Visão geral
- [ ] US-023 — Aba Equipe
- [ ] US-024 — Aba Personas
- [ ] US-025 — Evolução ao longo do tempo
- [ ] US-026 — Equipe (tela) e a conversa real
- [ ] US-027 — Home
- [ ] US-028 — Voz por persona e Configurações › Voz
- [ ] US-029 — MCP, rotina, artefato e formulário
- [ ] US-030 — Modo demonstração completo
- [ ] US-031 — Fechamento

## Desvios do PRD encontrados na implementação

(registre aqui toda premissa do PRD que não se confirmou no código)

- **US-001 / `scripts/verificar-padrao.sh`.** A AC dizia "o modelo já existe desde o `whatsapp-atendente`, nenhuma mudança no script". Não existia: o script só conhecia `"padrao": "proprio"` (automl-pocket), que tira o app inteiro da conferência — forte demais, porque levaria junto a infraestrutura. A antiga lista `ARQUIVOS` foi separada em `INFRA` (conferida em todo app, sempre) e `CAMADA_PRODUTO` (`components/ui.tsx`, `components/setup.tsx`, `components/conta.tsx`, `lib/navegacao.ts`, `lib/ilustracao.ts`, `app/globals.css`), pulada só nos apps com `"independente": true`. Saída idêntica à anterior para os 16 outros apps.
- **US-002 / `lib/vendedores.ts`.** A AC manda substituir por `lib/participantes.ts` e parar de ler a tabela antiga. Feito como casca fina (mesma assinatura, dados vindos de `participantes`) em vez de reescrever os sete chamadores no meio do PRD. **A US-026 apaga a casca** e leva os chamadores para `participantes` de uma vez.
- **US-002 / personas.** A migração precisa dos ids das 7 personas antes da US-007 existir. Estão numa constante local em `lib/banco.ts` (`PERSONAS_PADRAO`), com comentário pedindo a troca por um import de `lib/personas.ts` **ao implementar a US-007**.
