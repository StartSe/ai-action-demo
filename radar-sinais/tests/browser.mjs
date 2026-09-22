import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.RADAR_BASE_URL || 'http://127.0.0.1:3124';
const browser = await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try {
 const context = await browser.newContext({viewport:{width:1440,height:1000},permissions:['microphone']});
 const page = await context.newPage(), req = context.request, errors=[];
 page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 for(const path of ['/api/radar/chat','/api/radar/voz','/api/voz','/api/radar/destaques']) assert.equal((await req.post(base+path,{data:{}})).status(),401,path);
 const account = await req.post(base+'/api/conta',{data:{nome:'Teste Radar',email:'radar04@example.com',senha:'SenhaTeste123!',confirmarSenha:'SenhaTeste123!'}});
 if(account.status()!==201) assert.equal((await req.post(base+'/api/conta/entrar',{data:{email:'radar04@example.com',senha:'SenhaTeste123!'}})).status(),200);
 assert.equal((await (await req.get(base+'/api/health')).json()).version,'0.4.0');
 const setup=await (await req.get(base+'/api/setup')).json();assert.ok(!setup.integracoes.some(i=>i.id==='searchapi'));assert.ok(setup.integracoes.find(i=>i.id==='exa').campos.some(c=>c.chave==='SEARCHAPI_API_KEY'));
 console.log('modal, cadastro completo e edição');
 await page.goto(base+'/radar');await page.getByRole('button',{name:'+ Novo radar',exact:true}).click();
 const modal=page.getByRole('dialog');await modal.waitFor();
 await modal.getByLabel('Nome do radar',{exact:true}).fill('Educação 0.4');await modal.getByLabel('Palavras-chave',{exact:false}).fill('IA, EdTech');
 await page.screenshot({path:'/tmp/radar04-modal-desktop.png'});
 await modal.getByText('Fontes e páginas',{exact:false}).first().click();
 await modal.getByLabel('Endereço da página',{exact:true}).fill('https://empresa.com/produto?id=2');
 await modal.getByRole('button',{name:'Adicionar página',exact:true}).click();
 await modal.getByRole('button',{name:'Criar radar',exact:true}).click();await modal.waitFor({state:'detached'});
 await page.getByRole('heading',{name:'Educação 0.4',exact:true}).waitFor();const idA=await page.getByLabel('Radar ativo',{exact:true}).inputValue();
 let pesquisa=(await (await req.get(base+'/api/radar/pesquisa?radarId='+idA)).json()).pesquisa;
 assert.deepEqual(pesquisa.termos.map(t=>t.termo),['IA','EdTech']);assert.equal(pesquisa.paginas[0].url,'https://empresa.com/produto?id=2');
 const agenda=(await (await req.get(base+'/api/radar/monitoramentos?radarId='+idA)).json()).itens[0];assert.ok(agenda.ativa);assert.deepEqual(agenda.parametros.horarios,['08:00']);
 await page.getByRole('button',{name:'Editar radar',exact:true}).click();await modal.getByLabel('Nome do radar',{exact:true}).fill('Educação e futuro');await modal.getByRole('button',{name:'Salvar alterações',exact:true}).click();await modal.waitFor({state:'detached'});await page.getByRole('heading',{name:'Educação e futuro',exact:true}).waitFor();
 pesquisa.provedores=['searchapi'];await req.put(base+'/api/radar/pesquisa?radarId='+idA,{data:pesquisa});
 await page.getByRole('button',{name:'Atualizar radar',exact:true}).click();await page.getByRole('button',{name:'Tela cheia',exact:true}).waitFor();
 const salvo=await (await req.get(base+'/api/radar?ultimo=1&radarId='+idA)).json();assert.equal(salvo.radar.coleta.planejamento,'ia');assert.ok(salvo.radar.coleta.buscas.length>=4);
 console.log('destaques e conversa persistente');
 await page.getByRole('button',{name:'Possível hype',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('.highlight-signals button[aria-pressed="true"]'));
 await page.getByRole('button',{name:/Marcar artigo:/}).first().click();await page.waitForFunction(()=>document.querySelector('.highlight-articles button[aria-pressed="true"]'));
 assert.equal((await (await req.get(base+'/api/radar/destaques?radarId='+idA)).json()).itens.length,2);
 await page.getByRole('button',{name:'Conversar com a analista',exact:true}).click();await page.getByText('Você está no radar Educação e futuro',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/radar04-chat-welcome-desktop.png'});
 await page.getByLabel('Pergunta sobre o radar',{exact:true}).fill('Quero investigar retenção de alunos. O que validar?');await page.getByLabel('Pergunta sobre o radar',{exact:true}).press('Enter');await page.getByText(/O sinal conecta adoção de IA e novas competências/).waitFor();
 await page.reload();await page.getByRole('button',{name:'Conversar com a analista',exact:true}).click();await page.getByText('Quero investigar retenção de alunos. O que validar?',{exact:true}).waitFor();await page.screenshot({path:'/tmp/radar04-chat-desktop.png'});
 await page.getByRole('button',{name:'Fechar conversa',exact:true}).click();
 await page.getByRole('button',{name:'Pesquisar agora',exact:true}).click();await page.getByText('Pesquisa em segundo plano. Acompanhe o histórico de atualizações.',{exact:true}).waitFor();
 await page.goto(base+'/setup'); // execução continua sem a aba do radar
 let hist;
 for(let i=0;i<60;i++){hist=await (await req.get(base+'/api/radar/monitoramentos?radarId='+idA)).json();if(hist.execucoes.some(e=>e.estado==='sucesso'))break;await page.waitForTimeout(250);}
 assert.ok(hist.execucoes.some(e=>e.estado==='sucesso'));const segunda=hist.execucoes.find(e=>e.estado==='sucesso').resultadoId;assert.notEqual(segunda,salvo.id);
 assert.equal((await (await req.get(base+'/api/radar/chat?resultadoId='+segunda)).json()).mensagens.length,2);
 console.log('configurações e voz em tempo real');
 assert.equal(await page.getByText('Preferências da pesquisa',{exact:true}).count(),0);await page.getByRole('button',{name:/Busca na Web/}).first().click();await page.getByLabel('Chave da SearchAPI',{exact:false}).waitFor();
 await page.getByLabel('Chave da ElevenLabs',{exact:true}).fill('fixture-elevenlabs-key');await page.getByRole('button',{name:'Salvar conexão de voz',exact:true}).click();await page.getByLabel('Voz em português',{exact:true}).selectOption('voz_teste');await page.getByRole('button',{name:'Salvar conexão de voz',exact:true}).click();await page.getByText('Conversa por voz pronta.',{exact:true}).waitFor();
 await page.addInitScript(()=>{window.__tracks=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{const s=await original(c);window.__tracks.push(...s.getTracks());return s;};});
 let toolAnswered=false,audioChunks=0,socketClosed=false;
 await page.routeWebSocket('wss://api.elevenlabs.io/**',ws=>{
  let called=false;
  ws.onClose(()=>{socketClosed=true;});
  ws.onMessage(raw=>{
   const e=JSON.parse(String(raw));
   if(e.type==='conversation_initiation_client_data'){
    assert.ok(e.dynamic_variables.contexto.includes('Educação e futuro'));
    ws.send(JSON.stringify({type:'conversation_initiation_metadata',conversation_initiation_metadata_event:{user_input_audio_format:'pcm_16000',agent_output_audio_format:'pcm_16000'}}));
   }
   if(e.user_audio_chunk){audioChunks++;if(!called){called=true;ws.send(JSON.stringify({type:'user_transcript',user_transcription_event:{user_transcript:'Quais evidências faltam?'}}));ws.send(JSON.stringify({type:'client_tool_call',client_tool_call:{tool_call_id:'test-tool-1',tool_name:'consultar_radar',parameters:{pergunta:'Quais evidências faltam?'}}}));}}
   if(e.type==='client_tool_result'){assert.equal(e.is_error,false);assert.ok(JSON.parse(e.result).fontes.length);toolAnswered=true;ws.send(JSON.stringify({type:'agent_response',agent_response_event:{agent_response:'Valide esta hipótese com compradores.'}}));ws.send(JSON.stringify({type:'audio',audio_event:{event_id:1,audio_base_64:Buffer.alloc(3200).toString('base64')}}));}
  });
 });
 await page.goto(base+'/radar?radarId='+idA);await page.getByRole('button',{name:'Conversar com a analista',exact:true}).click();await page.getByText('Você está no radar Educação e futuro',{exact:true}).waitFor();await page.getByRole('button',{name:'Iniciar conversa por voz',exact:true}).click();
 await page.getByText('Valide esta hipótese com compradores.',{exact:true}).waitFor();assert.ok(toolAnswered && audioChunks>0);await page.screenshot({path:'/tmp/radar04-voice-desktop.png'});
 await page.getByRole('button',{name:'Pausar microfone',exact:true}).click();assert.ok(await page.evaluate(()=>window.__tracks.every(t=>!t.enabled)));
 await page.getByRole('button',{name:'Encerrar voz',exact:true}).click();await page.getByText('Quais evidências faltam?',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>window.__tracks.every(t=>t.readyState==='ended')));assert.ok(socketClosed);
 console.log('troca de radar, histórico e celular');
 await page.getByRole('button',{name:'Fechar conversa',exact:true}).click();await page.getByRole('button',{name:'+ Novo radar',exact:true}).click();await modal.getByLabel('Nome do radar',{exact:true}).fill('Outro mercado 0.4');await modal.getByLabel('Palavras-chave',{exact:false}).fill('Varejo');await modal.getByRole('button',{name:'Criar radar',exact:true}).click();await modal.waitFor({state:'detached'});await page.getByRole('heading',{name:'Outro mercado 0.4',exact:true}).waitFor();const idB=await page.getByLabel('Radar ativo',{exact:true}).inputValue();assert.notEqual(idA,idB);
 assert.equal((await (await req.get(base+'/api/radar?radarId='+idB)).json()).itens.length,0);assert.equal((await (await req.get(base+'/api/radar/destaques?radarId='+idB)).json()).itens.length,0);
 await page.getByLabel('Radar ativo',{exact:true}).selectOption(idA);await page.getByRole('button',{name:'Tela cheia',exact:true}).waitFor();await page.getByText('Histórico de atualizações',{exact:false}).first().click();await page.getByRole('link',{name:'Ver análise ↗',exact:true}).first().waitFor();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Editar radar',exact:true}).click();await modal.waitFor();await page.screenshot({path:'/tmp/radar04-modal-mobile.png'});assert.ok(await modal.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Tela cheia',exact:true}).click();const fullscreen=page.getByRole('dialog',{name:'Explorar mapa em tela cheia'});await fullscreen.waitFor();await page.getByRole('button',{name:'Conversar com a analista',exact:true}).click();await page.getByText('Você está no radar Educação e futuro',{exact:true}).waitFor();await page.screenshot({path:'/tmp/radar04-chat-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const panel=await page.getByRole('region',{name:'Conversa com a Analista do Radar'}).boundingBox();assert.ok(panel.x>=0 && panel.y>=0 && panel.x+panel.width<=390 && panel.y+panel.height<=844);
 await page.keyboard.press('Escape');await fullscreen.waitFor();await page.getByRole('button',{name:'Sair da tela cheia',exact:true}).click();
 await page.goto(base+'/?radarId='+idA);await page.getByRole('heading',{name:'Artigos para acompanhar',exact:true}).waitFor();await page.screenshot({path:'/tmp/radar04-home-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto(base+'/setup');await page.getByRole('heading',{name:'Conversa por voz',exact:true}).waitFor();await page.screenshot({path:'/tmp/radar04-setup-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({version:'0.4.0',modal:true,background:true,history:true,planning:true,radarMemory:true,highlights:true,voiceProtocol:true,microphoneReleased:true,mobile:true,errors}));
} finally {await browser.close();}
