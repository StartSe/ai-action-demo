# Deploy no Coolify

Use uma aplicação a partir deste repositório, branch `main`, com Build Pack **Docker Compose**:

- Base Directory: `/build-agentflows`
- Docker Compose Location: `/docker-compose.coolify.yml`
- Variável `APP_URL`: endereço público HTTPS, sem porta interna, por exemplo `https://fluxos.exemplo.com`.
- Domínio do serviço `app`: `https://fluxos.exemplo.com:10000`. O sufixo indica a porta interna para o proxy do Coolify; o acesso público continua em HTTPS normal.

O volume `dados` em `/app/data` preserva banco SQLite, chave mestra, configurações, anexos, sessões e autenticação ChatGPT entre deploys. Faça backup do volume inteiro; a chave mestra é necessária para recuperar as credenciais. Não remova o volume ao atualizar.

Mantenha uma única réplica, sem duas instâncias simultâneas acessando o mesmo volume: o executor persistente e o SQLite foram projetados para essa configuração. Após um reinício, tarefas interrompidas pedem revisão antes de repetir ações; aprovações pendentes e conversas são restauradas.

Após o primeiro deploy, crie a conta administrativa e conecte os provedores em Configurações. Em Segurança, você pode limitar os domínios do chat; em Implantar, autorize os sites de cada fluxo. A interseção das duas listas controla o acesso. A lista global vazia mantém as restrições de cada fluxo.

O chat da aplicação alvo precisa implementar a integração descrita em `public/embed-integration.md`.

Referência: https://coolify.io/docs/applications/builds/docker-compose
