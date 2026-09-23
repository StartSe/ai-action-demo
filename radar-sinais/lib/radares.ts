import { randomUUID } from "node:crypto";
import { abrirBanco, getConfig } from "./store";
import { listarPorTipo, obter, type Resultado } from "./historico";
import { PESQUISA_PADRAO, validarPesquisa, type Pesquisa } from "./pesquisa";
import { chavePerfil } from "./perfil";
import type { DadosRadar, Radar } from "./types";
import type { Meta } from "./ai";

export type CadastroRadar = { id: string; nome: string; pesquisa: Pesquisa; criadoEm: string };
type Linha = Omit<CadastroRadar, "pesquisa"> & { pesquisa: string };
let pronto = false;
function banco() {
  const db = abrirBanco();
  if (pronto) return db;
  listarPorTipo("radar", 0);
  db.exec("CREATE TABLE IF NOT EXISTS radares (id TEXT PRIMARY KEY, nome TEXT NOT NULL, pesquisa TEXT NOT NULL, criadoEm TEXT NOT NULL)");
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT id FROM radares LIMIT 1").get()) {
      const antigo = getConfig("RADAR_PESQUISA");
      const legado = antigo ? JSON.parse(antigo) : PESQUISA_PADRAO;
      const pesquisa = validarPesquisa(Array.isArray(legado.temas) && !legado.termos ? { ...PESQUISA_PADRAO, termos: legado.temas.map((termo: string) => ({ termo, categoria: "Outros", ativo: true })), setor: legado.setor || "", periodoDias: legado.periodoDias || 30 } : legado);
      if (!pesquisa.fontes.some(f => /startse\.com\/artigos/.test(f.url)) && pesquisa.fontes.length < 6) pesquisa.fontes.push(PESQUISA_PADRAO.fontes[0]);
      for (const id of ["searchapi", "startse"] as const) if (!pesquisa.provedores.includes(id)) pesquisa.provedores.push(id);
      const perfis = new Map<string, string>();
      const inserir = (nome: string, config: Pesquisa) => {
        const id = randomUUID();
        db.prepare("INSERT INTO radares VALUES (?, ?, ?, ?)").run(id, nome, JSON.stringify(config), new Date().toISOString());
        return id;
      };
      const principal = inserir("Meu radar", pesquisa);
      perfis.set(chavePerfil(pesquisa.termos.filter(t => t.ativo).map(t => t.termo), pesquisa.setor), principal);
      const vincular = (dados: DadosRadar, demo = false) => {
        if (demo || !Array.isArray(dados.temas) || !dados.temas.length) return principal;
        const perfil = chavePerfil(dados.temas, dados.setor);
        let id = perfis.get(perfil);
        if (!id) {
          id = inserir(dados.temas.slice(0, 2).join(" · ").slice(0, 80), validarPesquisa({ ...pesquisa, termos: dados.temas.map(termo => ({ termo, categoria: "Outros", ativo: true })), periodoDias: [7, 30, 90].includes(dados.periodoDias) ? dados.periodoDias : pesquisa.periodoDias, setor: dados.setor || "" }));
          perfis.set(perfil, id);
        }
        return id;
      };
      const antigos = db.prepare("SELECT id, entrada, meta FROM resultados WHERE tipo = 'radar'").all() as { id: string; entrada: string; meta: string }[];
      for (const r of antigos) {
        const dados = JSON.parse(r.entrada);
        db.prepare("UPDATE resultados SET entrada = ? WHERE id = ?").run(JSON.stringify({ ...dados, radarId: vincular(dados, JSON.parse(r.meta).demo === true) }), r.id);
      }
      if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rotinas'").get()) {
        for (const r of db.prepare("SELECT id, parametros FROM rotinas WHERE tipo IN ('radar-diario', 'radar-semanal')").all() as { id: string; parametros: string }[]) {
          const dados = JSON.parse(r.parametros);
          db.prepare("UPDATE rotinas SET parametros = ? WHERE id = ?").run(JSON.stringify({ ...dados, radarId: vincular(dados) }), r.id);
        }
      }
    }
    db.exec("COMMIT"); pronto = true;
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  return db;
}
function converter(r: Linha): CadastroRadar { return { ...r, pesquisa: validarPesquisa(JSON.parse(r.pesquisa)) }; }
export function listarRadares(): CadastroRadar[] { return (banco().prepare("SELECT * FROM radares ORDER BY criadoEm, rowid").all() as Linha[]).map(converter); }
export function obterRadar(id?: string): CadastroRadar {
  const linha = (id ? banco().prepare("SELECT * FROM radares WHERE id = ?").get(id) : banco().prepare("SELECT * FROM radares ORDER BY criadoEm, rowid LIMIT 1").get()) as Linha | undefined;
  if (!linha) throw new Error("Radar não encontrado.");
  return converter(linha);
}
function nomeValido(nome: unknown): string {
  if (typeof nome !== "string" || !nome.trim() || nome.trim().length > 80) throw new Error("Dê um nome de até 80 caracteres ao radar.");
  return nome.trim();
}
export function criarRadar(nome: unknown, valor: unknown = PESQUISA_PADRAO): CadastroRadar {
  const titulo = nomeValido(nome), pesquisa = validarPesquisa(valor), db = banco(), id = randomUUID();
  db.prepare("INSERT INTO radares VALUES (?, ?, ?, ?)").run(id, titulo, JSON.stringify(pesquisa), new Date().toISOString());
  return obterRadar(id);
}
export function renomearRadar(id: string, nome: unknown): CadastroRadar {
  obterRadar(id);
  banco().prepare("UPDATE radares SET nome = ? WHERE id = ?").run(nomeValido(nome), id);
  return obterRadar(id);
}
export function atualizarPesquisa(id: string | undefined, valor: unknown): Pesquisa {
  const radar = obterRadar(id), pesquisa = validarPesquisa(valor);
  banco().prepare("UPDATE radares SET pesquisa = ? WHERE id = ?").run(JSON.stringify(pesquisa), radar.id);
  return pesquisa;
}
export function analisesRadar(id: string, limite = 30, somenteReal = false): Resultado<DadosRadar, Radar, Meta>[] {
  obterRadar(id);
  const linhas = banco().prepare(`SELECT id FROM resultados WHERE tipo = 'radar' AND json_extract(entrada, '$.radarId') = ? ${somenteReal ? "AND json_type(meta, '$.demo') = 'false'" : ""} ORDER BY criadoEm DESC, rowid DESC LIMIT ?`).all(id, limite) as { id: string }[];
  return linhas.map(r => obter<DadosRadar, Radar, Meta>(r.id)!);
}

/** Nome e pesquisa são atualizados juntos, sem deixar um cadastro parcialmente salvo. */
export function editarRadar(id: string, nome: unknown, valor: unknown): CadastroRadar {
  obterRadar(id);
  const titulo = nomeValido(nome), pesquisa = validarPesquisa(valor);
  banco().prepare("UPDATE radares SET nome = ?, pesquisa = ? WHERE id = ?").run(titulo, JSON.stringify(pesquisa), id);
  return obterRadar(id);
}
