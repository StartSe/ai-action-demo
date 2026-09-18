# Briefing de Campanha

Toda campanha começa com um briefing incompleto, e a agência ou o time perde dias fazendo perguntas que já deveriam estar respondidas. Este app conduz uma conversa rápida sobre a campanha e monta o briefing completo: público-alvo, proposta de valor, mensagens-chave, canais sugeridos, cronograma, KPIs e restrições. Área: Marketing.

## O que resolve
Quem pede uma campanha (marketing, um gestor, um cliente) raramente entrega um briefing completo de primeira — verba, canais, prazo e restrições costumam ficar de fora, e é a agência ou o time interno quem perde dias correndo atrás dessas respostas. Este app faz essas perguntas na hora, uma por vez, e já entrega o briefing pronto para trabalhar.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar a IA, o app roda em modo demonstração com perguntas e um briefing de exemplo.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Como funciona
1. Informe o nome da campanha, o objetivo e o produto ou serviço divulgado.
2. A IA conduz uma conversa de 5 a 7 perguntas: público-alvo, verba, canais preferidos, prazo, diferenciais, tom de voz e restrições.
3. Ao final, o briefing completo é montado e salvo, pronto para copiar, imprimir ou enviar para a agência ou o time.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3021
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/briefing-de-campanha:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-briefing-de-campanha (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3021:10000 -v briefing-de-campanha-dados:/app/data ghcr.io/startse/briefing-de-campanha:latest` e abra http://localhost:3021.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `gerar_briefing` diretamente (a partir do nome, objetivo, produto e das informações já levantadas na própria conversa com o assistente). Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0), em vez do pacote `@modelcontextprotocol/sdk` — mesma decisão de todos os apps da suíte.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                     tela única (dados da campanha, conversa e briefing)
app/api/campanha/proxima/route.ts próxima pergunta da conversa
app/api/campanha/gerar/route.ts  gera e salva o briefing a partir da conversa completa
app/api/campanha/route.ts        apaga todo o histórico salvo
app/setup/page.tsx               configuração inicial (chaves, OAuth, teste de conexão)
lib/campanha.ts                  o motor: conduz a conversa e gera o briefing
lib/demo.ts                      perguntas e briefing de exemplo (modo demonstração)
```
