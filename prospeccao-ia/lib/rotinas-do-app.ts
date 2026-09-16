// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
import { escreverAbordagem } from "./abordagem";
import { salvar } from "./historico";
import { buscarLeadsNovos } from "./leads-vistos";
import { registrarExecutor, type Rotina, type TipoRotina } from "./rotinas";
import { ultimaBusca } from "./ultima-busca";
import type { Abordagem, DadosBusca } from "./types";

const SEM_PERFIL =
  "Esta rotina precisa do perfil de busca: faça uma busca de leads e use o botão “Receber leads novos toda semana”, na tela de resultado.";

/** Perfil completo o bastante para buscar e escrever (segmento, cargo, localização e proposta). */
function perfilCompleto(dados: Partial<DadosBusca> | null | undefined): dados is DadosBusca {
  return Boolean(dados?.segmento && dados?.cargo && dados?.localizacao && dados?.proposta);
}

/**
 * Perfil que a rotina vai usar: o salvo nos parâmetros (botão do resultado) ou, quando a rotina foi
 * criada pelo cartão genérico de /setup (sem parâmetros), o último perfil buscado neste app.
 */
export function perfilDaRotina(parametros: unknown): DadosBusca | null {
  const dados = (parametros && typeof parametros === "object" ? parametros : {}) as Partial<DadosBusca>;
  if (perfilCompleto(dados)) return dados;
  const ultimo = ultimaBusca();
  return perfilCompleto(ultimo) ? ultimo : null;
}

/** Tipos de rotina deste app, para o cartão "Rotinas" de /setup listar num seletor. O `validar` recusa
 * criar "Leads novos toda semana" enquanto não houver perfil nenhum (nem nos parâmetros, nem de uma
 * busca anterior): sem ele a rotina falharia em silêncio no dia marcado. */
export const TIPOS_ROTINA: TipoRotina[] = [
  {
    tipo: "leads-semanais",
    rotulo: "Leads novos toda semana",
    validar: (parametros) => (perfilDaRotina(parametros) ? undefined : SEM_PERFIL),
  },
];

registrarExecutor("leads-semanais", async (rotina: Rotina) => {
  const dados = perfilDaRotina(rotina.parametros);
  if (!dados) return { titulo: "Leads novos toda semana", texto: SEM_PERFIL };

  const titulo = `Leads novos: ${dados.cargo} em ${dados.segmento}`;
  const bruto = (rotina.parametros && typeof rotina.parametros === "object" ? rotina.parametros : {}) as Partial<DadosBusca>;
  const quantidade = bruto.quantidade || dados.quantidade || "10";

  const { fonte, leads, meta: metaGerada } = await buscarLeadsNovos({ ...dados, quantidade });
  if (leads.length === 0) {
    return { titulo, texto: "Nenhum lead novo esta semana para esse perfil: todos os encontrados já foram entregues antes. Amplie o cargo, o segmento ou a região para alcançar gente nova." };
  }

  // Escreve a abordagem de cada lead novo, um por vez (mesmo espírito de "escreverEmLote" em app/page.tsx: não sobrecarregar a IA/demo).
  // Uma falha isolada não derruba a rotina: os que deram certo são entregues e o aviso diz quem ficou de fora.
  const abordagens: Record<string, Abordagem> = {};
  const semAbordagem: string[] = [];
  for (const lead of leads) {
    try {
      const { abordagem } = await escreverAbordagem({
        lead,
        proposta: dados.proposta,
        segmento: dados.segmento,
        remetenteNome: dados.remetenteNome,
        remetenteEmpresa: dados.remetenteEmpresa,
      });
      abordagens[lead.id] = abordagem;
    } catch (err) {
      semAbordagem.push(lead.nome);
      console.error("Rotina leads-semanais: falha ao escrever para", lead.nome, err);
    }
  }

  const plural = leads.length > 1;
  const resultadoId = salvar({ tipo: "leads", titulo, entrada: dados, saida: { fonte, leads, abordagens }, meta: metaGerada });
  const texto = [
    `${leads.length} lead${plural ? "s" : ""} novo${plural ? "s" : ""} para ${dados.cargo} em ${dados.segmento}, com abordagem pronta para cada um: ${leads.map((l) => l.nome).join(", ")}.`,
    semAbordagem.length > 0 ? `A abordagem de ${semAbordagem.join(", ")} não saiu: abra o resultado e clique em Escrever abordagem.` : "",
    fonte === "demo" ? "Os leads são fictícios: a busca de leads não está conectada, então a lista mostra o formato da entrega." : "",
  ].filter(Boolean).join(" ");

  return { titulo, texto, resultadoId };
});
