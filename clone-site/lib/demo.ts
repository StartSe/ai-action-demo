// Respostas de exemplo usadas quando não há modelo de visão configurado (ver lib/ai.ts: visionEnabled()).
// A landing fictícia abaixo é completa (cabeçalho, herói, benefícios, depoimentos, preços, perguntas e rodapé),
// em português, com imagens trocadas por blocos na cor da marca — exatamente o que o gerador pede à IA.
import type { Marca, Pedido, Stack } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

export const MARCA_DEMO: Marca = { nome: "Nimbus Finanças", corPrimaria: "#0f766e", corSecundaria: "#f59e0b" };

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Um HTML único com Tailwind pela CDN, no formato "html-tailwind". */
function landingTailwind(marca: Marca): string {
  const nome = escaparHtml(marca.nome);
  const cor = marca.corPrimaria;
  const cor2 = marca.corSecundaria || "#f59e0b";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${nome} · Gestão financeira sem planilha</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
    .marca { color: ${cor}; }
    .bg-marca { background-color: ${cor}; }
    .bg-marca-suave { background-color: ${cor}14; }
    .borda-marca { border-color: ${cor}; }
    .bg-destaque { background-color: ${cor2}; }
    .imagem { background-color: ${cor}; background-image: linear-gradient(135deg, ${cor} 0%, ${cor}b3 100%); }
  </style>
</head>
<body class="bg-white text-slate-900 antialiased">
  <header class="border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <a href="#" class="flex items-center gap-2 font-extrabold text-lg tracking-tight">
        <span class="w-8 h-8 rounded-lg bg-marca inline-block"></span>
        ${nome}
      </a>
      <nav class="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
        <a href="#beneficios" class="hover:text-slate-900">Benefícios</a>
        <a href="#como-funciona" class="hover:text-slate-900">Como funciona</a>
        <a href="#precos" class="hover:text-slate-900">Preços</a>
        <a href="#perguntas" class="hover:text-slate-900">Perguntas</a>
      </nav>
      <div class="flex items-center gap-3">
        <a href="#" class="hidden sm:inline-block text-sm font-semibold text-slate-700 hover:text-slate-900">Entrar</a>
        <a href="#" class="bg-marca text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90">Começar grátis</a>
      </div>
    </div>
  </header>

  <section class="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
    <div>
      <span class="inline-block bg-marca-suave marca text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full mb-5">Feito para pequenas e médias empresas</span>
      <h1 class="text-4xl md:text-5xl font-extrabold leading-[1.1] tracking-tight mb-5">O caixa da sua empresa claro todos os dias, sem planilha.</h1>
      <p class="text-lg text-slate-600 mb-8">${nome} conecta seus bancos, organiza entradas e saídas e mostra quanto sobra no fim do mês. Você decide com número na mão, não com palpite.</p>
      <div class="flex flex-col sm:flex-row gap-3">
        <a href="#" class="bg-marca text-white font-semibold px-6 py-3 rounded-lg text-center hover:opacity-90">Testar por 14 dias</a>
        <a href="#como-funciona" class="border border-slate-300 font-semibold px-6 py-3 rounded-lg text-center hover:bg-slate-50">Ver como funciona</a>
      </div>
      <p class="text-sm text-slate-500 mt-4">Sem cartão de crédito. Cancele quando quiser.</p>
    </div>
    <div class="imagem rounded-2xl aspect-[4/3] flex items-end p-6" role="img" aria-label="Painel financeiro com gráfico de fluxo de caixa dos últimos seis meses e saldo projetado">
      <span class="text-white/90 text-sm font-medium">Painel de fluxo de caixa</span>
    </div>
  </section>

  <section class="bg-slate-50 border-y border-slate-200">
    <div class="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      <div><p class="text-3xl font-extrabold marca">4.200</p><p class="text-sm text-slate-600 mt-1">empresas atendidas</p></div>
      <div><p class="text-3xl font-extrabold marca">R$ 2,1 bi</p><p class="text-sm text-slate-600 mt-1">movimentados por mês</p></div>
      <div><p class="text-3xl font-extrabold marca">6 h</p><p class="text-sm text-slate-600 mt-1">economizadas por semana</p></div>
      <div><p class="text-3xl font-extrabold marca">4,8/5</p><p class="text-sm text-slate-600 mt-1">nota média dos clientes</p></div>
    </div>
  </section>

  <section id="beneficios" class="max-w-6xl mx-auto px-6 py-20">
    <div class="max-w-2xl mb-12">
      <h2 class="text-3xl font-extrabold tracking-tight mb-3">Tudo o que o financeiro precisa, em um lugar só</h2>
      <p class="text-slate-600">Menos retrabalho, menos surpresa no fim do mês. Cada recurso foi desenhado com quem vive o caixa no dia a dia.</p>
    </div>
    <div class="grid md:grid-cols-3 gap-6">
      <article class="border border-slate-200 rounded-2xl p-6">
        <div class="imagem w-12 h-12 rounded-xl mb-5" role="img" aria-label="Ícone de conexão bancária"></div>
        <h3 class="font-bold text-lg mb-2">Bancos conectados</h3>
        <p class="text-slate-600 text-sm">Extratos chegam sozinhos, todos os dias, dos principais bancos do país. Nada de baixar arquivo.</p>
      </article>
      <article class="border border-slate-200 rounded-2xl p-6">
        <div class="imagem w-12 h-12 rounded-xl mb-5" role="img" aria-label="Ícone de categorias automáticas"></div>
        <h3 class="font-bold text-lg mb-2">Categorias automáticas</h3>
        <p class="text-slate-600 text-sm">Cada lançamento cai na categoria certa. Você só revisa o que ficou em dúvida.</p>
      </article>
      <article class="border border-slate-200 rounded-2xl p-6">
        <div class="imagem w-12 h-12 rounded-xl mb-5" role="img" aria-label="Ícone de projeção de caixa"></div>
        <h3 class="font-bold text-lg mb-2">Projeção de 90 dias</h3>
        <p class="text-slate-600 text-sm">Veja quando o caixa aperta antes de acontecer e antecipe a conversa com o banco ou com o cliente.</p>
      </article>
    </div>
  </section>

  <section id="como-funciona" class="bg-slate-900 text-white">
    <div class="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
      <div class="imagem rounded-2xl aspect-video" role="img" aria-label="Tela do aplicativo mostrando a conciliação de um extrato bancário"></div>
      <div>
        <h2 class="text-3xl font-extrabold tracking-tight mb-8">Pronto em três passos</h2>
        <ol class="space-y-6">
          <li class="flex gap-4"><span class="bg-destaque text-slate-900 font-extrabold w-9 h-9 rounded-full flex items-center justify-center shrink-0">1</span><div><h3 class="font-bold">Conecte suas contas</h3><p class="text-slate-300 text-sm">Leva dois minutos. Só leitura, sem acesso para movimentar dinheiro.</p></div></li>
          <li class="flex gap-4"><span class="bg-destaque text-slate-900 font-extrabold w-9 h-9 rounded-full flex items-center justify-center shrink-0">2</span><div><h3 class="font-bold">Revise as categorias</h3><p class="text-slate-300 text-sm">Sugerimos tudo. Você ajusta o que quiser uma vez e o sistema aprende.</p></div></li>
          <li class="flex gap-4"><span class="bg-destaque text-slate-900 font-extrabold w-9 h-9 rounded-full flex items-center justify-center shrink-0">3</span><div><h3 class="font-bold">Acompanhe pelo celular</h3><p class="text-slate-300 text-sm">Saldo, contas a pagar e projeção chegam todo dia às 8h, no aplicativo ou por e-mail.</p></div></li>
        </ol>
      </div>
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-20">
    <h2 class="text-3xl font-extrabold tracking-tight text-center mb-12">Quem usa, recomenda</h2>
    <div class="grid md:grid-cols-3 gap-6">
      <figure class="bg-slate-50 rounded-2xl p-6">
        <blockquote class="text-slate-700 mb-5">“Fechávamos o mês no dia 15. Hoje sabemos o saldo real todo dia de manhã.”</blockquote>
        <figcaption class="flex items-center gap-3"><span class="imagem w-10 h-10 rounded-full" role="img" aria-label="Foto de Renata Alves"></span><div><p class="font-bold text-sm">Renata Alves</p><p class="text-xs text-slate-500">Sócia, Clínica Vida Ativa</p></div></figcaption>
      </figure>
      <figure class="bg-slate-50 rounded-2xl p-6">
        <blockquote class="text-slate-700 mb-5">“A projeção de 90 dias evitou um empréstimo caro. Vimos o aperto com seis semanas de antecedência.”</blockquote>
        <figcaption class="flex items-center gap-3"><span class="imagem w-10 h-10 rounded-full" role="img" aria-label="Foto de Marcos Tavares"></span><div><p class="font-bold text-sm">Marcos Tavares</p><p class="text-xs text-slate-500">Diretor, Tavares Distribuidora</p></div></figcaption>
      </figure>
      <figure class="bg-slate-50 rounded-2xl p-6">
        <blockquote class="text-slate-700 mb-5">“Minha contadora recebe tudo organizado. Acabou a troca de planilha por e-mail.”</blockquote>
        <figcaption class="flex items-center gap-3"><span class="imagem w-10 h-10 rounded-full" role="img" aria-label="Foto de Juliana Prado"></span><div><p class="font-bold text-sm">Juliana Prado</p><p class="text-xs text-slate-500">Fundadora, Prado Arquitetura</p></div></figcaption>
      </figure>
    </div>
  </section>

  <section id="precos" class="bg-slate-50 border-y border-slate-200">
    <div class="max-w-6xl mx-auto px-6 py-20">
      <h2 class="text-3xl font-extrabold tracking-tight text-center mb-3">Planos simples, sem letra miúda</h2>
      <p class="text-slate-600 text-center mb-12">Troque de plano quando quiser. Todos incluem suporte por chat em horário comercial.</p>
      <div class="grid md:grid-cols-3 gap-6 items-start">
        <div class="bg-white border border-slate-200 rounded-2xl p-7">
          <h3 class="font-bold text-lg">Essencial</h3>
          <p class="text-4xl font-extrabold mt-3">R$ 89<span class="text-base font-medium text-slate-500">/mês</span></p>
          <ul class="mt-6 space-y-3 text-sm text-slate-700"><li>✓ 1 conta bancária</li><li>✓ Categorias automáticas</li><li>✓ Relatório mensal</li></ul>
          <a href="#" class="block text-center border border-slate-300 font-semibold px-5 py-3 rounded-lg mt-8 hover:bg-slate-50">Começar</a>
        </div>
        <div class="bg-white border-2 borda-marca rounded-2xl p-7 relative">
          <span class="absolute -top-3 left-7 bg-destaque text-slate-900 text-xs font-bold px-3 py-1 rounded-full">Mais escolhido</span>
          <h3 class="font-bold text-lg">Crescimento</h3>
          <p class="text-4xl font-extrabold mt-3">R$ 189<span class="text-base font-medium text-slate-500">/mês</span></p>
          <ul class="mt-6 space-y-3 text-sm text-slate-700"><li>✓ Até 5 contas bancárias</li><li>✓ Projeção de caixa de 90 dias</li><li>✓ Acesso para o contador</li><li>✓ Aplicativo para celular</li></ul>
          <a href="#" class="block text-center bg-marca text-white font-semibold px-5 py-3 rounded-lg mt-8 hover:opacity-90">Testar por 14 dias</a>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-7">
          <h3 class="font-bold text-lg">Empresarial</h3>
          <p class="text-4xl font-extrabold mt-3">R$ 449<span class="text-base font-medium text-slate-500">/mês</span></p>
          <ul class="mt-6 space-y-3 text-sm text-slate-700"><li>✓ Contas ilimitadas</li><li>✓ Várias empresas no mesmo painel</li><li>✓ Gerente de conta dedicado</li></ul>
          <a href="#" class="block text-center border border-slate-300 font-semibold px-5 py-3 rounded-lg mt-8 hover:bg-slate-50">Falar com vendas</a>
        </div>
      </div>
    </div>
  </section>

  <section id="perguntas" class="max-w-3xl mx-auto px-6 py-20">
    <h2 class="text-3xl font-extrabold tracking-tight text-center mb-10">Perguntas frequentes</h2>
    <div class="divide-y divide-slate-200">
      <details class="py-4"><summary class="font-semibold cursor-pointer">Meus dados bancários ficam seguros?</summary><p class="text-slate-600 text-sm mt-2">Sim. A conexão é somente leitura, feita pelo sistema oficial de dados abertos dos bancos, e nenhuma senha fica salva conosco.</p></details>
      <details class="py-4"><summary class="font-semibold cursor-pointer">Preciso trocar de contador?</summary><p class="text-slate-600 text-sm mt-2">Não. Seu contador ganha um acesso próprio e recebe tudo organizado, no formato que ele já usa.</p></details>
      <details class="py-4"><summary class="font-semibold cursor-pointer">Funciona para mais de uma empresa?</summary><p class="text-slate-600 text-sm mt-2">Sim, no plano Empresarial você acompanha várias empresas no mesmo painel, com saldo consolidado.</p></details>
      <details class="py-4"><summary class="font-semibold cursor-pointer">E se eu quiser cancelar?</summary><p class="text-slate-600 text-sm mt-2">Cancela em um clique, sem multa. Seus dados ficam disponíveis para exportar por 30 dias.</p></details>
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-6 pb-20">
    <div class="bg-marca rounded-3xl px-8 py-14 text-center text-white">
      <h2 class="text-3xl font-extrabold tracking-tight mb-3">Comece hoje e feche o mês sem susto</h2>
      <p class="text-white/85 mb-8">14 dias grátis, sem cartão. Em uma tarde o seu caixa já está organizado.</p>
      <a href="#" class="inline-block bg-white text-slate-900 font-semibold px-6 py-3 rounded-lg hover:bg-slate-100">Criar minha conta</a>
    </div>
  </section>

  <footer class="border-t border-slate-200">
    <div class="max-w-6xl mx-auto px-6 py-10 grid md:grid-cols-4 gap-8 text-sm">
      <div class="md:col-span-2"><p class="font-extrabold text-lg mb-2">${nome}</p><p class="text-slate-600 max-w-sm">Gestão financeira simples para empresas que querem crescer com o caixa sob controle.</p></div>
      <div><p class="font-bold mb-3">Produto</p><ul class="space-y-2 text-slate-600"><li><a href="#beneficios">Benefícios</a></li><li><a href="#precos">Preços</a></li><li><a href="#perguntas">Perguntas</a></li></ul></div>
      <div><p class="font-bold mb-3">Empresa</p><ul class="space-y-2 text-slate-600"><li><a href="#">Sobre</a></li><li><a href="#">Contato</a></li><li><a href="#">Privacidade</a></li></ul></div>
    </div>
    <p class="text-center text-xs text-slate-500 pb-8">© 2026 ${nome}. Todos os direitos reservados.</p>
  </footer>
</body>
</html>
`;
}

/** A mesma landing, no formato "html-css": sem Tailwind, com o CSS próprio dentro de <style>. */
function landingCss(marca: Marca): string {
  const nome = escaparHtml(marca.nome);
  const cor = marca.corPrimaria;
  const cor2 = marca.corSecundaria || "#f59e0b";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${nome} · Gestão financeira sem planilha</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --marca: ${cor}; --destaque: ${cor2}; --ink: #0f172a; --muted: #475569; --line: #e2e8f0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; color: var(--ink); background: #fff; line-height: 1.55; }
    a { color: inherit; text-decoration: none; }
    .container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
    header { border-bottom: 1px solid var(--line); }
    .topo { height: 64px; display: flex; align-items: center; justify-content: space-between; }
    .logo { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 18px; }
    .logo span { width: 32px; height: 32px; border-radius: 8px; background: var(--marca); display: inline-block; }
    nav { display: flex; gap: 32px; font-size: 14px; font-weight: 500; color: var(--muted); }
    .btn { display: inline-block; padding: 12px 24px; border-radius: 10px; font-weight: 600; text-align: center; }
    .btn-marca { background: var(--marca); color: #fff; }
    .btn-borda { border: 1px solid #cbd5e1; }
    .btn-branco { background: #fff; color: var(--ink); }
    .heroi { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; padding: 80px 0; }
    .selo { display: inline-block; background: ${cor}14; color: var(--marca); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 4px 12px; border-radius: 999px; margin-bottom: 20px; }
    h1 { font-size: 48px; line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 20px; }
    h2 { font-size: 30px; letter-spacing: -0.02em; margin: 0 0 12px; }
    h3 { font-size: 18px; margin: 0 0 8px; }
    .lead { font-size: 18px; color: var(--muted); margin-bottom: 32px; }
    .acoes { display: flex; gap: 12px; flex-wrap: wrap; }
    .nota { font-size: 14px; color: #64748b; margin-top: 16px; }
    .imagem { background: var(--marca); background-image: linear-gradient(135deg, var(--marca) 0%, ${cor}b3 100%); border-radius: 16px; }
    .imagem-heroi { aspect-ratio: 4 / 3; display: flex; align-items: flex-end; padding: 24px; color: rgba(255,255,255,.9); font-size: 14px; font-weight: 500; }
    .numeros { background: #f8fafc; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .numeros .container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; padding: 40px 24px; text-align: center; }
    .numeros p { margin: 0; } .numeros strong { display: block; font-size: 30px; color: var(--marca); }
    .numeros small { color: var(--muted); font-size: 14px; }
    section.bloco { padding: 80px 0; }
    .grade3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .cartao { border: 1px solid var(--line); border-radius: 16px; padding: 24px; }
    .cartao .imagem { width: 48px; height: 48px; border-radius: 12px; margin-bottom: 20px; }
    .cartao p { color: var(--muted); font-size: 14px; margin: 0; }
    .escuro { background: #0f172a; color: #fff; }
    .escuro .heroi { padding: 80px 0; }
    .escuro .imagem { aspect-ratio: 16 / 9; }
    ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 24px; }
    ol li { display: flex; gap: 16px; }
    ol li span { background: var(--destaque); color: var(--ink); font-weight: 800; width: 36px; height: 36px; border-radius: 999px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    ol li p { color: #cbd5e1; font-size: 14px; margin: 0; }
    figure { background: #f8fafc; border-radius: 16px; padding: 24px; margin: 0; }
    blockquote { margin: 0 0 20px; color: #334155; }
    figcaption { display: flex; align-items: center; gap: 12px; font-size: 14px; }
    figcaption .imagem { width: 40px; height: 40px; border-radius: 999px; }
    figcaption small { display: block; color: #64748b; font-size: 12px; }
    .precos { background: #f8fafc; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .plano { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 28px; position: relative; }
    .plano.destaque { border: 2px solid var(--marca); }
    .plano .selo-plano { position: absolute; top: -12px; left: 28px; background: var(--destaque); font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; }
    .preco { font-size: 36px; font-weight: 800; margin: 12px 0 0; } .preco small { font-size: 16px; font-weight: 500; color: #64748b; }
    .plano ul { list-style: none; padding: 0; margin: 24px 0 0; display: grid; gap: 12px; font-size: 14px; color: #334155; }
    .plano .btn { display: block; margin-top: 32px; }
    .perguntas { max-width: 720px; margin: 0 auto; }
    details { padding: 16px 0; border-bottom: 1px solid var(--line); }
    summary { font-weight: 600; cursor: pointer; }
    details p { color: var(--muted); font-size: 14px; margin: 8px 0 0; }
    .chamada { background: var(--marca); color: #fff; border-radius: 24px; padding: 56px 32px; text-align: center; }
    .chamada p { color: rgba(255,255,255,.85); margin-bottom: 32px; }
    footer { border-top: 1px solid var(--line); font-size: 14px; }
    .rodape { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 32px; padding: 40px 24px; }
    .rodape ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; color: var(--muted); }
    .rodape p { margin: 0 0 8px; }
    .direitos { text-align: center; font-size: 12px; color: #64748b; padding: 0 0 32px; margin: 0; }
    .centro { text-align: center; }
    @media (max-width: 768px) {
      nav, .entrar { display: none; }
      .heroi, .grade3, .rodape { grid-template-columns: 1fr; }
      .numeros .container { grid-template-columns: 1fr 1fr; }
      h1 { font-size: 36px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container topo">
      <a href="#" class="logo"><span></span>${nome}</a>
      <nav><a href="#beneficios">Benefícios</a><a href="#como-funciona">Como funciona</a><a href="#precos">Preços</a><a href="#perguntas">Perguntas</a></nav>
      <div class="acoes"><a href="#" class="entrar btn" style="padding:8px 12px">Entrar</a><a href="#" class="btn btn-marca" style="padding:8px 16px;font-size:14px">Começar grátis</a></div>
    </div>
  </header>

  <section class="container heroi">
    <div>
      <span class="selo">Feito para pequenas e médias empresas</span>
      <h1>O caixa da sua empresa claro todos os dias, sem planilha.</h1>
      <p class="lead">${nome} conecta seus bancos, organiza entradas e saídas e mostra quanto sobra no fim do mês. Você decide com número na mão, não com palpite.</p>
      <div class="acoes"><a href="#" class="btn btn-marca">Testar por 14 dias</a><a href="#como-funciona" class="btn btn-borda">Ver como funciona</a></div>
      <p class="nota">Sem cartão de crédito. Cancele quando quiser.</p>
    </div>
    <div class="imagem imagem-heroi" role="img" aria-label="Painel financeiro com gráfico de fluxo de caixa dos últimos seis meses e saldo projetado">Painel de fluxo de caixa</div>
  </section>

  <section class="numeros">
    <div class="container">
      <p><strong>4.200</strong><small>empresas atendidas</small></p>
      <p><strong>R$ 2,1 bi</strong><small>movimentados por mês</small></p>
      <p><strong>6 h</strong><small>economizadas por semana</small></p>
      <p><strong>4,8/5</strong><small>nota média dos clientes</small></p>
    </div>
  </section>

  <section id="beneficios" class="container bloco">
    <h2>Tudo o que o financeiro precisa, em um lugar só</h2>
    <p class="lead">Menos retrabalho, menos surpresa no fim do mês.</p>
    <div class="grade3">
      <article class="cartao"><div class="imagem" role="img" aria-label="Ícone de conexão bancária"></div><h3>Bancos conectados</h3><p>Extratos chegam sozinhos, todos os dias, dos principais bancos do país. Nada de baixar arquivo.</p></article>
      <article class="cartao"><div class="imagem" role="img" aria-label="Ícone de categorias automáticas"></div><h3>Categorias automáticas</h3><p>Cada lançamento cai na categoria certa. Você só revisa o que ficou em dúvida.</p></article>
      <article class="cartao"><div class="imagem" role="img" aria-label="Ícone de projeção de caixa"></div><h3>Projeção de 90 dias</h3><p>Veja quando o caixa aperta antes de acontecer e antecipe a conversa com o banco ou com o cliente.</p></article>
    </div>
  </section>

  <section id="como-funciona" class="escuro">
    <div class="container heroi">
      <div class="imagem" role="img" aria-label="Tela do aplicativo mostrando a conciliação de um extrato bancário"></div>
      <div>
        <h2>Pronto em três passos</h2>
        <ol>
          <li><span>1</span><div><h3>Conecte suas contas</h3><p>Leva dois minutos. Só leitura, sem acesso para movimentar dinheiro.</p></div></li>
          <li><span>2</span><div><h3>Revise as categorias</h3><p>Sugerimos tudo. Você ajusta o que quiser uma vez e o sistema aprende.</p></div></li>
          <li><span>3</span><div><h3>Acompanhe pelo celular</h3><p>Saldo, contas a pagar e projeção chegam todo dia às 8h, no aplicativo ou por e-mail.</p></div></li>
        </ol>
      </div>
    </div>
  </section>

  <section class="container bloco">
    <h2 class="centro">Quem usa, recomenda</h2>
    <div class="grade3" style="margin-top:48px">
      <figure><blockquote>“Fechávamos o mês no dia 15. Hoje sabemos o saldo real todo dia de manhã.”</blockquote><figcaption><span class="imagem" role="img" aria-label="Foto de Renata Alves"></span><div><strong>Renata Alves</strong><small>Sócia, Clínica Vida Ativa</small></div></figcaption></figure>
      <figure><blockquote>“A projeção de 90 dias evitou um empréstimo caro. Vimos o aperto com seis semanas de antecedência.”</blockquote><figcaption><span class="imagem" role="img" aria-label="Foto de Marcos Tavares"></span><div><strong>Marcos Tavares</strong><small>Diretor, Tavares Distribuidora</small></div></figcaption></figure>
      <figure><blockquote>“Minha contadora recebe tudo organizado. Acabou a troca de planilha por e-mail.”</blockquote><figcaption><span class="imagem" role="img" aria-label="Foto de Juliana Prado"></span><div><strong>Juliana Prado</strong><small>Fundadora, Prado Arquitetura</small></div></figcaption></figure>
    </div>
  </section>

  <section id="precos" class="precos">
    <div class="container bloco">
      <h2 class="centro">Planos simples, sem letra miúda</h2>
      <p class="lead centro">Troque de plano quando quiser. Todos incluem suporte por chat em horário comercial.</p>
      <div class="grade3">
        <div class="plano"><h3>Essencial</h3><p class="preco">R$ 89<small>/mês</small></p><ul><li>✓ 1 conta bancária</li><li>✓ Categorias automáticas</li><li>✓ Relatório mensal</li></ul><a href="#" class="btn btn-borda">Começar</a></div>
        <div class="plano destaque"><span class="selo-plano">Mais escolhido</span><h3>Crescimento</h3><p class="preco">R$ 189<small>/mês</small></p><ul><li>✓ Até 5 contas bancárias</li><li>✓ Projeção de caixa de 90 dias</li><li>✓ Acesso para o contador</li><li>✓ Aplicativo para celular</li></ul><a href="#" class="btn btn-marca">Testar por 14 dias</a></div>
        <div class="plano"><h3>Empresarial</h3><p class="preco">R$ 449<small>/mês</small></p><ul><li>✓ Contas ilimitadas</li><li>✓ Várias empresas no mesmo painel</li><li>✓ Gerente de conta dedicado</li></ul><a href="#" class="btn btn-borda">Falar com vendas</a></div>
      </div>
    </div>
  </section>

  <section id="perguntas" class="container bloco">
    <div class="perguntas">
      <h2 class="centro">Perguntas frequentes</h2>
      <details><summary>Meus dados bancários ficam seguros?</summary><p>Sim. A conexão é somente leitura, feita pelo sistema oficial de dados abertos dos bancos, e nenhuma senha fica salva conosco.</p></details>
      <details><summary>Preciso trocar de contador?</summary><p>Não. Seu contador ganha um acesso próprio e recebe tudo organizado, no formato que ele já usa.</p></details>
      <details><summary>Funciona para mais de uma empresa?</summary><p>Sim, no plano Empresarial você acompanha várias empresas no mesmo painel, com saldo consolidado.</p></details>
      <details><summary>E se eu quiser cancelar?</summary><p>Cancela em um clique, sem multa. Seus dados ficam disponíveis para exportar por 30 dias.</p></details>
    </div>
  </section>

  <section class="container" style="padding-bottom:80px">
    <div class="chamada"><h2>Comece hoje e feche o mês sem susto</h2><p>14 dias grátis, sem cartão. Em uma tarde o seu caixa já está organizado.</p><a href="#" class="btn btn-branco">Criar minha conta</a></div>
  </section>

  <footer>
    <div class="container rodape">
      <div><p style="font-weight:800;font-size:18px">${nome}</p><p style="color:var(--muted);max-width:360px">Gestão financeira simples para empresas que querem crescer com o caixa sob controle.</p></div>
      <div><p style="font-weight:700">Produto</p><ul><li><a href="#beneficios">Benefícios</a></li><li><a href="#precos">Preços</a></li><li><a href="#perguntas">Perguntas</a></li></ul></div>
      <div><p style="font-weight:700">Empresa</p><ul><li><a href="#">Sobre</a></li><li><a href="#">Contato</a></li><li><a href="#">Privacidade</a></li></ul></div>
    </div>
    <p class="direitos">© 2026 ${nome}. Todos os direitos reservados.</p>
  </footer>
</body>
</html>
`;
}

/** Landing fictícia completa, na marca informada (ou na marca de exemplo), no formato pedido. */
export function paginaDemo(pedido: Pick<Pedido, "stack" | "marca">): string {
  const marca: Marca = {
    nome: pedido.marca?.nome?.trim() || MARCA_DEMO.nome,
    corPrimaria: pedido.marca?.corPrimaria || MARCA_DEMO.corPrimaria,
    corSecundaria: pedido.marca?.corSecundaria || MARCA_DEMO.corSecundaria,
  };
  const stack: Stack = pedido.stack === "html-css" ? "html-css" : "html-tailwind";
  return stack === "html-css" ? landingCss(marca) : landingTailwind(marca);
}

// Em modo demonstração, cada edição aplica mudanças fixas e visíveis, para mostrar o fluxo de versões:
// a cor de fundo do cabeçalho muda e o título principal é reescrito. Tons claros para o texto continuar legível.
const CORES_CABECALHO_DEMO = ["#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#ede9fe", "#ffedd5"];
const TITULOS_DEMO = [
  "Seu caixa em dia, sem planilha e sem susto.",
  "Controle financeiro simples para quem toca a empresa.",
  "Veja hoje quanto vai sobrar no fim do mês.",
  "Menos planilha, mais decisão.",
  "O dinheiro da empresa organizado em um só lugar.",
];

/** Aplica a edição de demonstração de número n (a versão que vai nascer) sobre o HTML atual. */
export function edicaoDemo(html: string, n: number): string {
  const cor = CORES_CABECALHO_DEMO[(n - 1) % CORES_CABECALHO_DEMO.length];
  const titulo = TITULOS_DEMO[(n - 1) % TITULOS_DEMO.length];
  let saida = html;
  const cabecalho = /<header\b([^>]*)>/i.exec(saida);
  if (cabecalho) {
    const atributos = cabecalho[1].replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*')/i, "");
    saida = saida.replace(cabecalho[0], `<header${atributos} style="background-color:${cor}">`);
  }
  saida = saida.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i, `$1${escaparHtml(titulo)}$2`);
  return saida;
}
