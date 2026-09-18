// A lista de Equipe e o cadastro de uma pessoa pelo gestor (US-026).
//
// Substitui `/api/vendedores`: "vendedor" e "participante" são a mesma coisa desde a US-002, e a lista
// agora responde com o que a tela mostra (sessões, nota média, última atividade) em vez de só nome e
// e-mail. Nenhuma senha nasce aqui — o vendedor nunca cria conta (P3 do PRD).
import { emailInvalido } from "@/lib/conta-comum";
import { montarEquipe } from "@/lib/equipe";
import { criar } from "@/lib/participantes";

export async function GET() {
  return Response.json({ itens: montarEquipe() });
}

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { nome?: string; email?: string };
  const nome = (corpo.nome || "").trim();
  const email = (corpo.email || "").trim();
  if (!nome) return Response.json({ error: "Escreva o nome da pessoa." }, { status: 400 });
  // O e-mail é opcional no cadastro (quem ainda não treinou pode nem tê-lo à mão), mas escrito errado
  // ele impediria o feedback do treino de chegar — e ninguém descobriria por quê.
  if (email) {
    const erro = emailInvalido(email);
    if (erro) return Response.json({ error: erro }, { status: 400 });
  }

  // `criar` devolve quem já existe com aquele e-mail em vez de duplicar: a mesma pessoa cadastrada
  // duas vezes é uma linha só, e o nome salvo não é sobrescrito por um apelido digitado com pressa.
  const pessoa = criar({ nome, email: email || undefined, origem: "cadastro" });
  return Response.json({ pessoa: { id: pessoa.id, nome: pessoa.nome, email: pessoa.email ?? "" } });
}
