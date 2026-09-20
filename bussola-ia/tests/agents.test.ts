import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QUESTIONARIO_MODELO } from '../lib/modelo';
import { calcularMediasPorDimensao } from '../lib/analise-bussola';
import { conselhoAutomatico, validarParecer } from '../lib/conselho';
import type { Resposta } from '../lib/types';
const respostas:Resposta[]=[1,5].map((nota,i)=>({id:String(i),criadoEm:new Date().toISOString(),valores:Object.fromEntries(QUESTIONARIO_MODELO.perguntas.map(p=>[p.id,p.tipo==='escala'?String(nota):'Exemplo real de resposta'])),respondente:{area:i?'Produto':'Marketing'}}));
test('cálculo desconsidera notas ausentes, vazias e fora de 1–5',()=>{
 const q={...QUESTIONARIO_MODELO,perguntas:[QUESTIONARIO_MODELO.perguntas[0]]};
 const rs=['','0','6','Infinity','abc','4'].map((v,i)=>({id:String(i),criadoEm:'',valores:{[q.perguntas[0].id]:v}}));
 assert.equal(calcularMediasPorDimensao(q,rs)[0].media,4);
});
test('contratos dos agentes, fallback e números calculados no servidor', async t=>{
 const data=mkdtempSync(join(tmpdir(),'bussola-agents-'));
 const env={data:process.env.DATA_DIR,key:process.env.OPENROUTER_API_KEY};
 process.env.DATA_DIR=data;process.env.OPENROUTER_API_KEY='test-only-mocked-provider';
 const originalFetch=globalThis.fetch;
 const {analisarAvaliacao,gerarQuestionarioParaSetor}=await import('../lib/bussola');
 const entrada={empresa:'Teste',titulo:'Diagnóstico',questionario:QUESTIONARIO_MODELO,respostas,contexto:{grupoTipo:'area' as const,grupoNome:'Marketing',participantes:20,objetivo:'Inovar'}};
 const leitura={resumo:'A maturidade está em estruturação.',forcas:['Estratégia'],lacunas:['Governança'],proximosPassos:['Nomear um responsável','Testar um piloto','Medir o resultado'],leituraPorDimensao:QUESTIONARIO_MODELO.dimensoes.map(d=>({dimensao:d.nome,leitura:'Prática em estruturação.'})),ondeDiscordam:[],nivelGeral:5};
 const parecer={mensagem:'Valide a amostra pequena antes de decidir.',recomendacoes:['Converse com o grupo'],pergunta:'Qual evidência falta?',dimensoes:[QUESTIONARIO_MODELO.dimensoes[0].nome]};
 const resposta=(v:unknown)=>Response.json({choices:[{message:{content:JSON.stringify(v)}}]});
 try {
  await t.test('três perspectivas reais com provedor simulado; notas não vêm do modelo',async()=>{
   const chamadas:string[]=[];
   globalThis.fetch=async(_url,opts)=>{const b=JSON.parse(String(opts?.body));const sys=b.messages[0].content;chamadas.push(sys);return resposta(sys.includes('agente Crítico')||sys.includes('agente Estrategista')?parecer:leitura);};
   const r=await analisarAvaliacao(entrada);
   assert.equal(r.meta.demo,false);assert.equal(r.avaliacao.analise?.nivelGeral,3);
   assert.equal(chamadas.length,3);assert.ok(r.avaliacao.analise?.conselho?.every(p=>p.origem==='ia'));
   assert.equal(conselhoAutomatico(r.avaliacao.analise!,2,entrada.contexto)[1].mensagem.includes('apenas 2'),true);
  });
  await t.test('falha parcial conserva leitura e sinaliza qual agente caiu para regras',async()=>{
   globalThis.fetch=async(_url,opts)=>{const sys=JSON.parse(String(opts?.body)).messages[0].content;return resposta(sys.includes('agente Crítico')?{...parecer,dimensoes:['Inventada']}:sys.includes('agente Estrategista')?parecer:leitura);};
   const r=await analisarAvaliacao(entrada);assert.equal(r.avaliacao.analise?.conselho?.[1].origem,'automatica');assert.ok(r.avaliacao.analise?.conselho?.[1].aviso);assert.equal(r.avaliacao.analise?.conselho?.[2].origem,'ia');
  });
  await t.test('JSON semanticamente inválido produz leitura automática utilizável',async()=>{
   globalThis.fetch=async()=>resposta({resumo:'incompleto'});
   const r=await analisarAvaliacao(entrada);assert.equal(r.avaliacao.analise?.origemLeitura,'automatica');assert.equal(r.meta.demo,false);assert.equal(r.avaliacao.analise?.proximosPassos.length,3);assert.ok(r.avaliacao.analise?.avisoIA);
  });
  await t.test('Arquiteto rejeita questionário que altera dimensões e aceita adaptação válida',async()=>{
   globalThis.fetch=async()=>resposta({titulo:'Inválido',perguntas:[],dimensoes:[]});
   await assert.rejects(()=>gerarQuestionarioParaSetor({setor:'Varejo'}),/estrutura incompleta/);
   globalThis.fetch=async()=>resposta(QUESTIONARIO_MODELO);
   assert.equal((await gerarQuestionarioParaSetor({setor:'Varejo'})).meta.demo,false);
   assert.equal(validarParecer({...parecer,dimensoes:['Inventada']},[]),false);
  });
 }finally{globalThis.fetch=originalFetch;if(env.data===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=env.data;if(env.key===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=env.key;rmSync(data,{recursive:true,force:true});}
});
