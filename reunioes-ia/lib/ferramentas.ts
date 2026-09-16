// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { gerarAta } from "./ata";
import type { Ferramenta } from "./mcp";

export const NOME_SERVIDOR = "reunioes-ia";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "gerar_ata",
    descricao:
      "Gera a ata executiva de uma reunião a partir da transcrição: resumo executivo, decisões, ações com responsável e prazo, riscos, pendências, próximos passos e um e-mail de acompanhamento.",
    schema: {
      type: "object",
      properties: {
        transcricao: { type: "string", description: "Transcrição ou notas da reunião" },
        titulo: { type: "string", description: "Título da reunião (opcional)" },
        dataReuniao: { type: "string", description: "Data da reunião no formato AAAA-MM-DD, referência para prazos relativos como 'até sexta' (opcional; padrão hoje)" },
        participantes: { type: "string", description: "Participantes da reunião (opcional)" },
      },
      required: ["transcricao"],
    },
    async executar(args) {
      const transcricao = String(args.transcricao || "").trim();
      if (!transcricao) throw new Error("Envie a transcrição da reunião.");
      const titulo = args.titulo ? String(args.titulo).trim() : undefined;
      const participantes = args.participantes ? String(args.participantes).trim() : undefined;
      const dataReuniao = args.dataReuniao ? String(args.dataReuniao).trim() : undefined;
      const { ata } = await gerarAta({ transcricao, titulo, dataReuniao, participantes });
      return ata;
    },
  },
];
