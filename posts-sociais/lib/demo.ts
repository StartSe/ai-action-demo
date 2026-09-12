// Respostas de exemplo usadas quando não há chave de IA configurada.
import type { Post, Rede, ResultadoPosts } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

const LIMITES: Record<Rede, number> = { linkedin: 1300, instagram: 2200, x: 280 };

export function postsDemo({ empresa = "Vetra Logística", redes = ["linkedin", "instagram"] as Rede[] }: { empresa?: string; tema?: string; redes?: Rede[] } = {}): ResultadoPosts {
  const marca = empresa.trim() || "Vetra Logística";
  const ideia = `${marca} passou a mostrar ao cliente, em tempo real, onde a carga está e quando chega. Menos ligação para perguntar, mais confiança para comprar de novo.`;

  const todos: Record<Rede, Post> = {
    linkedin: {
      rede: "linkedin",
      texto: `Cliente que liga para perguntar "onde está minha carga" é cliente que já perdeu a confiança.\n\nNa ${marca}, essa pergunta representava 38% das ligações do atendimento. Não era um problema de transporte. Era um problema de informação.\n\nA partir de hoje, cada embarque tem um link de rastreamento em tempo real: posição do veículo, previsão de chegada e alerta automático quando algo muda na rota.\n\nO que aprendemos no piloto com 40 clientes:\n\n- As ligações de "onde está" caíram 71% em seis semanas.\n- O NPS dos clientes do piloto subiu 12 pontos.\n- O time de atendimento passou a resolver problemas em vez de repetir status.\n\nTecnologia boa em logística não é a que impressiona. É a que faz o cliente parar de se preocupar.\n\nSe a sua operação ainda depende de alguém ligar para saber, vale uma conversa.`,
      hashtags: ["#logistica", "#experienciadocliente", "#supplychain", "#gestao"],
      melhor_horario: "terça ou quarta, entre 8h e 9h",
      prompt_imagem: "Wide editorial photograph of a modern logistics control room at dawn, a large wall screen showing a clean map with a single glowing route line and a truck icon, one operator calmly watching with a coffee mug, soft purple and white light, minimal, premium corporate aesthetic, no text, no logos",
    },
    instagram: {
      rede: "instagram",
      texto: `Sabe aquela ligação de "e a minha carga?" 📞\n\nAcabou. Agora todo embarque da ${marca} tem um link que mostra onde o caminhão está e quando ele chega, em tempo real.\n\nNo piloto com 40 clientes, as ligações caíram 71%. E a gente passou a usar esse tempo para resolver o que importa.\n\nMenos ansiedade, mais previsibilidade. É assim que a gente cuida de quem confia na nossa entrega. 💜`,
      hashtags: ["#logistica", "#rastreamento", "#entregas", "#experienciadocliente", "#transportes", "#inovacao", "#supplychain", "#operacoes"],
      melhor_horario: "quarta ou quinta, entre 11h e 13h",
      prompt_imagem: "Square minimalist illustration of a delivery truck seen from above on a winding road, a soft glowing location pin above it, warm purple and cream color palette, flat vector style with subtle grain, calm and friendly mood, no text, no logos",
    },
    x: {
      rede: "x",
      texto: `38% das ligações no atendimento da ${marca} eram "onde está minha carga?".\n\nAgora todo embarque tem rastreamento em tempo real. No piloto: ligações caíram 71%, NPS subiu 12 pontos.\n\nInformação também é serviço.`,
      hashtags: ["#logistica", "#supplychain"],
      melhor_horario: "segunda a quinta, entre 12h e 13h",
      prompt_imagem: "Wide bold graphic of a single glowing route line crossing a dark purple map, a small truck icon at the end of the line, high contrast, clean geometric style, no text, no logos",
    },
  };

  const lista = (redes.length ? redes : (["linkedin", "instagram"] as Rede[])).filter((r) => todos[r]).map((r) => todos[r]);
  return { ideia_central: ideia, posts: lista };
}

// Versão encurtada simples: mantém as primeiras frases até caber em cerca de metade do limite da rede.
export function reescreverDemo({ texto = "", rede = "linkedin" as Rede }: { texto?: string; rede?: Rede }) {
  const alvo = Math.floor((LIMITES[rede] || 1300) * 0.55);
  const paragrafos = String(texto).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const saida: string[] = [];
  let total = 0;
  for (const p of paragrafos) {
    if (total + p.length > alvo && saida.length) break;
    if (p.length > alvo) {
      const frases = p.match(/[^.!?]+[.!?]+/g) || [p];
      let acc = "";
      for (const f of frases) {
        if ((acc + f).length > alvo) break;
        acc += f;
      }
      saida.push((acc || frases[0]).trim());
      total += acc.length;
      break;
    }
    saida.push(p);
    total += p.length;
  }
  return saida.join("\n\n") || String(texto).slice(0, alvo).trim();
}
