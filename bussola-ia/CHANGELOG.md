# Notas de versão

## 0.2.1 — 2026-09-20

- Catálogo público e índices principais atualizados com o painel do gestor para assessments por empresa, área e time, identidade verde e versão visível.
- Escolha entre instalação gratuita de teste e instalação paga com volume persistente de 1 GB no Render.
- Blueprint dedicado com disco em `/app/data`, preservando o banco, a chave de criptografia, as contas, as respostas e os planos de ação.
- Gerador publica automaticamente a alternativa `deploy-bussola-ia-persistente` e seus links de instalação.

Validação: 5 testes do gerador, 10 testes de unidade, 15 testes de navegador, lint e build. Catálogo conferido em 1440 e 390 px, com troca dos links gratuito/pago e verificação de acessibilidade.

## 0.2.0 — 2026-09-20

- Painel do gestor com acompanhamento de assessments por empresa, área ou time, metas, participação, prazos e respostas.
- Oficina de criação com agente Arquiteto, edição e biblioteca de questionários, geração de links e revisão antes de compartilhar.
- Coleta pública por dimensões e sala de análise com conselho de agentes, radar, comparação entre áreas, plano de ação persistido e exportação.
- Identidade visual compartilhada entre painel, configurações, histórico, acesso, impressão e estados de erro, com navegação para desktop e celular.
- Recuperação de falhas no acompanhamento dos grupos, preservação da última consulta e cancelamento de consultas ao trocar de assessment.
- Versão exibida no rodapé do painel, em `/api/health` e na identificação do servidor MCP, a partir de `package.json`.

Validação da entrega: 10 testes de unidade e 15 testes de navegador, com verificações de acessibilidade, responsividade, persistência, limites de coleta e recuperação de falhas. Testes usam banco temporário e integrações simuladas.

## 0.1.0

- Versão inicial com questionário modelo, diagnóstico de demonstração, histórico e integrações.
