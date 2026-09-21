# Notas de versão

## 0.3.0 — 2026-09-20

- Conexão com assinatura ChatGPT por código de dispositivo, com cancelamento, conta conectada, modelos e desconexão, usando o protocolo oficial já adotado no build-agentflows.
- Seleção explícita entre ChatGPT e OpenRouter para criação de questionários e análise pelos agentes, sem troca automática de provedor em falhas.
- Remoção do quadro externo de tarefas, acesso por assistentes, rotinas, notificações e seção técnica das configurações, com retirada dos atalhos no painel e na análise.
- Agendador desativado e URLs antigas das integrações removidas retornando HTTP 410; assessments, respostas e planos de ação preservados.
- Sessão ChatGPT incluída no volume persistente e binário oficial incluído na imagem de produção.

Validação: lint, build, 16 testes de unidade, 16 testes de navegador e 5 testes do catálogo. Pacote standalone validado com o binário oficial e sessão isolada. Login e geração com assinatura são simulados nos testes; uso real exige autorização da conta.

## 0.2.1 — 2026-09-20

- Catálogo público e índices principais atualizados com o painel do gestor para assessments por empresa, área e time, identidade verde e versão visível.
- Escolha entre instalação gratuita de teste e instalação paga com volume persistente de 1 GB no Render.
- Blueprint dedicado com disco em `/app/data`, preservando o banco, a chave de criptografia, as contas, as respostas e os planos de ação.
- Gerador publica automaticamente a alternativa `deploy-bussola-ia-persistente` e seus links de instalação.
- Publicação preserva as versões e os indicadores de disco já disponíveis no catálogo dos demais apps.

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
