// Testes dos Relatórios (lib/relatorios.ts, US-026), fora do Next (`npm test`).
//
// Estes números vão para uma reunião de liderança, e nenhum erro deles quebra tela nenhuma: um funil
// que sobe no meio, uma taxa de conclusão contando um convite cancelado pela própria casa ou um
// período que ninguém consegue reproduzir passam despercebidos na tela e mudam a conclusão de quem
// lê. Por isso o que se exercita aqui é:
//
//  - o funil em cascata (quem concluiu abriu, mesmo sem o carimbo de abertura);
//  - o recorte do período, inclusive o que chega malformado pela barra de endereço;
//  - o que fica de fora da conta (convite cancelado) e o que continua contando (convite vencido);
//  - média e mediana do tempo até a conclusão, que descrevem coisas diferentes.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// `lib/store.ts` lê `DATA_DIR` no momento em que é importado: a variável vem ANTES dos imports do
// app, que por isso são dinâmicos.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-relatorios-"));
delete process.env.OPENROUTER_API_KEY;

const { criar: criarCandidato } = await import("./candidatos");
const { cancelar, criar: criarEntrevista, mudarStatus, decidir } = await import("./entrevistas");
const { periodoDoPedido, relatorio, DIAS_PADRAO } = await import("./relatorios");
const { criar: criarVaga } = await import("./vagas");

const DIA_MS = 86_400_000;
const TUDO = { de: new Date(Date.now() - 365 * DIA_MS).toISOString(), ate: new Date(Date.now() + DIA_MS).toISOString() };

let contador = 0;

/** Uma vaga com um candidato e a entrevista dos dois, no estado pedido. */
function entrevista(vagaId: string, estado: "convidada" | "aberta" | "concluida" | "avaliada" | "cancelada" | "expirada") {
  contador += 1;
  const candidato = criarCandidato({ nome: `Pessoa ${contador}` });
  const criada = criarEntrevista({ vagaId, candidatoId: candidato.id });
  if (estado === "cancelada") return cancelar(criada.id);
  if (estado === "expirada") return mudarStatus(criada.id, "expirada");
  if (estado === "concluida" || estado === "avaliada") mudarStatus(criada.id, estado, { nivelVoz: "navegador" });
  else if (estado === "aberta") mudarStatus(criada.id, "aberta");
  return criada;
}

function vagaNova() {
  contador += 1;
  return criarVaga({ cargo: `Analista ${contador}`, requisitos: "Atendimento\nCRM" });
}

describe("periodoDoPedido", () => {
  const agora = new Date("2026-09-18T12:00:00.000Z");

  it("entende os atalhos de 7, 30 e 90 dias", () => {
    for (const dias of [7, 30, 90]) {
      const pedido = periodoDoPedido(new URLSearchParams({ dias: String(dias) }), agora);
      assert.equal(pedido.dias, dias);
      assert.equal(new Date(pedido.ate).getTime() - new Date(pedido.de).getTime(), dias * DIA_MS);
    }
  });

  it("leva o dia final inteiro no período digitado à mão", () => {
    const pedido = periodoDoPedido(new URLSearchParams({ de: "2026-09-01", ate: "2026-09-18" }), agora);
    assert.equal(pedido.dias, null);
    // Quem escolhe "até 18/09" espera ver o que aconteceu no dia 18, e não até a meia-noite dele.
    const fim = new Date(pedido.ate);
    assert.equal(fim.getDate(), 18);
    assert.equal(fim.getHours(), 23);
  });

  it("cai no padrão quando o endereço não faz sentido", () => {
    const casos: Record<string, string>[] = [{ dias: "abc" }, { dias: "1000" }, { de: "ontem", ate: "hoje" }, { de: "2026-09-18", ate: "2026-09-01" }];
    for (const params of casos) {
      assert.equal(periodoDoPedido(new URLSearchParams(params), agora).dias, DIAS_PADRAO, JSON.stringify(params));
    }
  });

  it("carrega a vaga escolhida", () => {
    assert.equal(periodoDoPedido(new URLSearchParams({ vagaId: "abc" }), agora).vagaId, "abc");
    assert.equal(periodoDoPedido(new URLSearchParams(), agora).vagaId, undefined);
  });
});

describe("o funil", () => {
  it("conta em cascata: quem concluiu abriu, mesmo sem o carimbo de abertura", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "convidada");
    // Uma conversa conduzida pelo agente volta pelo aviso de pós-conversa e nunca passa pela rota
    // que carimba a abertura: sem a cascata, o funil mostraria mais gente concluindo do que abrindo.
    entrevista(vaga.id, "concluida");

    const numeros = relatorio({ vagaId: vaga.id, ...TUDO });
    const valor = (chave: string) => numeros.funil.find((e) => e.chave === chave)?.valor;
    assert.equal(valor("convidados"), 2);
    assert.equal(valor("abriram"), 1);
    assert.equal(valor("concluiram"), 1);
    assert.equal(valor("decididas"), 0);
  });

  it("nunca sobe de uma etapa para a seguinte", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "convidada");
    entrevista(vaga.id, "aberta");
    entrevista(vaga.id, "concluida");
    const decidida = entrevista(vaga.id, "avaliada");
    decidir(decidida!.id, "avancar");

    const valores = relatorio({ vagaId: vaga.id, ...TUDO }).funil.map((e) => e.valor);
    for (let i = 1; i < valores.length; i++) assert.ok(valores[i] <= valores[i - 1], `etapa ${i} subiu: ${valores.join(" > ")}`);
    assert.deepEqual(valores, [4, 3, 2, 1, 1]);
  });

  it("tira o convite cancelado da conta e mantém o vencido", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "concluida");
    entrevista(vaga.id, "expirada");
    entrevista(vaga.id, "cancelada");

    const numeros = relatorio({ vagaId: vaga.id, ...TUDO });
    // Cancelar foi decisão da própria casa (encerrar a vaga, por exemplo); contá-la derrubaria a
    // taxa de conclusão por algo que não é do candidato. O convite vencido é justamente o que o
    // relatório existe para mostrar.
    assert.equal(numeros.funil[0].valor, 2);
    assert.equal(numeros.taxaConclusao, 0.5);
    assert.equal(numeros.itens.length, 2);
  });
});

describe("os números do período", () => {
  it("não inventa taxa nem tempo quando nada aconteceu", () => {
    const vaga = vagaNova();
    const numeros = relatorio({ vagaId: vaga.id, ...TUDO });
    assert.equal(numeros.taxaConclusao, null);
    assert.equal(numeros.tempoMedioHoras, null);
    assert.equal(numeros.tempoMedianoHoras, null);
    assert.equal(numeros.notaMedia, null);
  });

  it("separa média de mediana no tempo até a conclusão", async () => {
    const vaga = vagaNova();
    const { banco } = await import("./banco");
    const base = Date.now() - 10 * DIA_MS;
    // Três conversas: duas no mesmo dia e uma respondida uma semana depois. A média sobe com a
    // retardatária; a mediana continua descrevendo o que aconteceu com a maioria.
    for (const horas of [2, 4, 168]) {
      const criada = entrevista(vaga.id, "concluida");
      banco()
        .prepare("UPDATE entrevistas SET convidadaEm = ?, concluidaEm = ? WHERE id = ?")
        .run(new Date(base).toISOString(), new Date(base + horas * 3_600_000).toISOString(), criada!.id);
    }

    const numeros = relatorio({ vagaId: vaga.id, ...TUDO });
    assert.equal(numeros.tempoMedianoHoras, 4);
    assert.ok(numeros.tempoMedioHoras! > 50, `média ${numeros.tempoMedioHoras}`);
  });

  it("só olha a vaga pedida e diz qual é", () => {
    const umaVaga = vagaNova();
    const outraVaga = vagaNova();
    entrevista(umaVaga.id, "convidada");
    entrevista(outraVaga.id, "convidada");
    entrevista(outraVaga.id, "convidada");

    assert.equal(relatorio({ vagaId: outraVaga.id, ...TUDO }).funil[0].valor, 2);
    assert.equal(relatorio({ vagaId: outraVaga.id, ...TUDO }).vaga?.cargo, outraVaga.cargo);
    assert.equal(relatorio(TUDO).vaga, null);
  });

  it("deixa de fora o que aconteceu antes do período", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "convidada");
    const antigo = { de: new Date(Date.now() - 365 * DIA_MS).toISOString(), ate: new Date(Date.now() - 300 * DIA_MS).toISOString() };
    assert.equal(relatorio({ vagaId: vaga.id, ...antigo }).funil[0].valor, 0);
  });
});
