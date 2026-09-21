import { notes, save, markOrganized } from "./brain";
export function seed() {
  if (notes().some((n) => n.demo)) return;
  const a = save({
    kind: "raw",
    title: "Reunião · estratégia do próximo trimestre",
    tags: ["estratégia"],
    demo: true,
    content:
      "Reunião de exemplo. A equipe quer reduzir o tempo entre uma ideia e seu primeiro teste. Decisão: começar com um piloto de agentes na pesquisa de clientes. Hipótese: uma memória compartilhada evita trabalho duplicado. Próximo passo: mapear as dúvidas recorrentes e escolher um responsável pelo piloto.",
  });
  const b = save({
    kind: "raw",
    title: "Leitura · o valor das conexões",
    tags: ["aprendizado"],
    demo: true,
    content:
      "Nota fictícia de leitura: guardar informação não é o mesmo que aprender. Uma ideia se torna útil quando encontra outra. Notas curtas, escritas com nossas palavras e ligadas às fontes, permitem retomar o raciocínio. Pergunta: como trazer esse hábito para a rotina da equipe?",
  });
  const c = save({
    kind: "raw",
    title: "Ideia de voz · um copiloto para o dia",
    tags: ["produto"],
    demo: true,
    content:
      "Transcrição de exemplo: quero começar o dia conversando com minha memória. O assistente pode cruzar decisões, projetos e aprendizados para mostrar o que merece atenção. Preciso conseguir entender de onde veio cada insight e transformar a conversa em um plano de ação.",
  });
  const defs = [
    [
      "Inteligência coletiva",
      "estratégia",
      "Uma memória compartilhada conecta o que a equipe aprende com o que decide.\n\n## Hipótese\nAcesso ao raciocínio por trás de uma decisão pode reduzir retrabalho. Ainda precisa ser validado.\n\n## Conexões\n[[Gestão do conhecimento]] sustenta [[Agentes de IA]].",
      a.id,
    ],
    [
      "Gestão do conhecimento",
      "aprendizado",
      "Conhecimento útil tem contexto, origem e conexões.\n\n## Prática\n- Uma ideia principal por nota.\n- Preserve o conteúdo original.\n- Crie ligações explícitas entre assuntos.\n\nVeja [[Aprendizado contínuo]] e [[Inteligência coletiva]].",
      b.id,
    ],
    [
      "Agentes de IA",
      "tecnologia",
      "## Oportunidade\nTestar agentes na pesquisa de clientes, começando com um escopo pequeno.\n\n## Decisão\nCriar um piloto antes de expandir.\n\n## Em aberto\nQuem será responsável? Como medir o resultado?\n\nConecta [[Estratégia de produto]] e [[Inteligência coletiva]].",
      a.id,
    ],
    [
      "Estratégia de produto",
      "produto",
      "Encurtar a distância entre uma ideia e um teste.\n\n## Próximo experimento\nMapear dúvidas recorrentes dos clientes e avaliar um piloto.\n\n[[Agentes de IA]] podem apoiar a pesquisa. [[Memória aumentada]] preserva decisões.",
      a.id,
    ],
    [
      "Aprendizado contínuo",
      "aprendizado",
      "Aprender é construir relações entre ideias. A revisão recorrente recupera contexto e revela novas perguntas.\n\n## Pergunta em aberto\nComo incorporar a escrita de notas à rotina da equipe?\n\nConecta [[Gestão do conhecimento]] e [[Ritual diário]].",
      b.id,
    ],
    [
      "Memória aumentada",
      "tecnologia",
      "Um assistente que recupera decisões e relaciona aprendizados deve mostrar suas fontes.\n\n## Princípios\nRastreabilidade, controle humano e contexto antes de recomendação.\n\nVer [[Ritual diário]] e [[Estratégia de produto]].",
      c.id,
    ],
    [
      "Ritual diário",
      "rotina",
      "## Um começo de dia com intenção\n1. Revisar decisões recentes.\n2. Conectar um aprendizado a um projeto.\n3. Escolher uma próxima ação.\n\n[[Memória aumentada]] e [[Aprendizado contínuo]] ajudam a manter o ritual.",
      c.id,
    ],
  ];
  const wiki = defs.map(([title, tag, content, source]) =>
    save({
      kind: "wiki",
      title,
      content,
      tags: [tag],
      sources: [source],
      demo: true,
    }),
  );
  [a, b, c].forEach((n) => markOrganized(n.id));
  save({
    kind: "outputs",
    title: "Briefing · da memória à ação",
    tags: ["briefing"],
    demo: true,
    sources: [wiki[0].id, wiki[2].id, wiki[6].id],
    content:
      "## O que está se conectando\nO piloto de agentes e a proposta de uma memória compartilhada partem do mesmo problema: transformar informação em ação.\n\n## Uma possibilidade\nUsar as dúvidas dos clientes como primeiro conjunto de fontes e criar um ritual semanal de revisão.\n\n## Próximas ações\n- [ ] Definir o responsável pelo piloto.\n- [ ] Selecionar três dúvidas recorrentes.\n- [ ] Registrar o que aprendemos.\n\n*Artefato de exemplo; hipóteses para explorar, não resultados medidos.*",
  });
  save({
    kind: "raw",
    title: "Reflexão · menos informação, mais sentido",
    tags: ["ideias"],
    demo: true,
    content:
      "Uma provocação para nossa próxima conversa: e se o melhor indicador da wiki fosse a quantidade de decisões que ela ajudou a tomar? Guardar menos e conectar melhor. Relacionar essa ideia ao ritual diário e ao aprendizado contínuo.",
  });
}
