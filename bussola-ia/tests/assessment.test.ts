import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerContexto, validarAdaptacao, validarQuestionario } from '../lib/assessment-input';
import { QUESTIONARIO_MODELO } from '../lib/modelo';
import { estadoColeta, participacao, type AssessmentPainel } from '../lib/painel';
test('valida estrutura do modelo e recusa adaptações que alteram a metodologia',()=>{
 assert.ok(validarQuestionario(QUESTIONARIO_MODELO));
 assert.ok(validarAdaptacao(QUESTIONARIO_MODELO,QUESTIONARIO_MODELO));
 const errado=structuredClone(QUESTIONARIO_MODELO);errado.perguntas[0].tipo='texto';
 assert.equal(validarAdaptacao(errado,QUESTIONARIO_MODELO),false);
 errado.perguntas[0].id=errado.perguntas[1].id;
 assert.equal(validarQuestionario(errado),false);
 assert.equal(validarQuestionario({titulo:'x',perguntas:[null],dimensoes:[]}),false);
});
test('grupos antigos continuam válidos; área exige nome e meta válida',()=>{
 assert.equal(lerContexto({}).grupoTipo,'empresa');
 assert.throws(()=>lerContexto({grupoTipo:'area'}));
 for(const participantes of [0,-1,2.5,'12',100001]) assert.throws(()=>lerContexto({participantes}));
 assert.deepEqual(lerContexto({grupoTipo:'area',grupoNome:' Marketing ',participantes:12}).grupoNome,'Marketing');
});
test('participação usa a meta, sem confundir teto com tamanho do grupo',()=>{
 const a={totalRespostas:7,participantes:10,limite:50,encerrada:false} as AssessmentPainel;
 assert.equal(participacao(a),70);assert.equal(estadoColeta(a),'em-coleta');
 assert.equal(participacao({...a,participantes:undefined}),null);
 assert.equal(participacao({...a,totalRespostas:12}),120);
 assert.equal(estadoColeta({...a,totalRespostas:50}),'completa');
 assert.equal(estadoColeta({...a,encerrada:true}),'encerrada');
});
