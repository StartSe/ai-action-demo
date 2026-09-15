# Prospecção com IA

Monta a lista de leads a partir do perfil de cliente ideal e escreve a primeira abordagem personalizada por lead. Área: Vendas.

## O que resolve
O time comercial perde horas montando listas de prospecção e escrevendo a primeira mensagem para cada lead. Este app pede o perfil de cliente ideal (segmento, cargo-alvo, porte, localização e o que sua empresa vende), busca ou gera a lista de leads, e escreve para cada um o gancho, o e-mail, a mensagem de LinkedIn, a de WhatsApp e o próximo passo de contato — prontos para copiar.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, e também pode conectar a busca de leads (Apollo) e o enriquecimento com o site do lead (Bright Data) — todas testáveis com um clique. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração: leads fictícios verossímeis e abordagens montadas a partir dos próprios dados do lead.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev              # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher, buscar os leads e já abrir a abordagem do primeiro.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3005
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/prospeccao-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-prospeccao-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3005:10000 -v prospeccao-ia-dados:/app/data ghcr.io/startse/prospeccao-ia:latest` e abra http://localhost:3005.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Ativa a IA que escreve as abordagens. Obtenha em https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `APOLLO_API_KEY` | Alternativa ao setup. Ativa a busca de leads reais na Apollo.io. Obtenha em https://app.apollo.io/#/settings/integrations/api |
| `BRIGHTDATA_API_KEY` | Alternativa ao setup. Enriquecimento opcional: lê o site da empresa do lead para dar mais contexto à abordagem. Obtenha em https://brightdata.com/cp/zones |
| `BRIGHTDATA_ZONE` | Alternativa ao setup. Nome da zona Web Unlocker configurada na Bright Data. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

Qualquer serviço de enriquecimento de leads (Clay, Lusha, Hunter e outros) pode substituir a Apollo.io na rota `/api/leads` — basta trocar a chamada mantendo a resposta no formato `{ fonte, leads: [...] }` descrito abaixo.

## Estrutura
```
app/page.tsx              tela única (formulário + lista de leads + abordagem)
app/api/leads/route.ts    busca leads via Apollo.io ou gera leads de exemplo
app/api/abordagem/route.ts escreve a abordagem (gancho, e-mail, LinkedIn, WhatsApp, próximo passo)
app/setup/page.tsx        configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/            leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts   informa ao frontend o que está conectado (IA, Apollo, Bright Data)
app/api/health/route.ts   health check
components/ui.tsx         componentes visuais compartilhados pela suíte
components/setup.tsx      tela de setup genérica, gerada a partir de lib/integracoes.ts
lib/store.ts               configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts         tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts         integrações que este app precisa (OpenRouter, Apollo, Bright Data)
lib/ai.ts                  cliente OpenRouter (askText, askJSON)
lib/demo.ts                leads e abordagens de exemplo do modo demonstração
lib/types.ts               tipos do domínio
Dockerfile                 build multi-stage com saída standalone
docker-compose.yml         sobe este app isolado (porta 3005)
render.yaml                blueprint do Render (runtime image)
```

## Limites conhecidos
- A Apollo.io não devolve um "sinal" de prospecção pronto: quando a integração está conectada, o sinal exibido é montado a partir de campos públicos da organização (ano de fundação, setor, número estimado de funcionários), não de um evento recente real.
- O enriquecimento via Bright Data depende do site da empresa estar acessível publicamente e devolver HTML legível; falhas de enriquecimento não impedem a geração da abordagem (o texto sai sem esse contexto extra).
- Nada é salvo: a lista de leads e as abordagens existem só na sessão do navegador. Só as chaves de configuração ficam persistidas (SQLite).
