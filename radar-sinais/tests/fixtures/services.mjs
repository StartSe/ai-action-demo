// Serviços externos simulados para testar a aplicação de produção sem credenciais reais.
const original = global.fetch;
export {};
global.fetch = async (input, init) => {
 const url = String(input);
 if (url.startsWith('https://www.searchapi.io/api/v1/search')) return Response.json({organic_results:[{title:'IA aplicada à educação',link:'https://www.startse.com/artigos/ia-educacao',snippet:'Empresas experimentam agentes de IA para capacitação.'},{title:'Mudanças no trabalho',link:'https://www.startse.com/artigos/trabalho',snippet:'Novas competências necessárias.'}]});
 if (url.startsWith('https://api.firecrawl.dev/')) return Response.json({success:true,data:{markdown:'# Produto monitorado\nPrograma de educação com agentes de IA.',metadata:{statusCode:200}}});
 if (url.startsWith('https://openrouter.ai/api/v1/chat/completions')) {
  const b=JSON.parse(init.body); if(b.messages[0].content.includes('Você planeja buscas')) return Response.json({choices:[{message:{content:JSON.stringify({buscas:JSON.parse(b.messages[1].content).palavrasChave.map(tema=>({tema,consultas:[tema+' adoção',tema+' riscos']}))})}}]}); const chat=b.messages[0].content.includes('Analista do Radar');
  const v=chat?{resposta:'O sinal conecta adoção de IA e novas competências. A relação sugere uma oportunidade de capacitação; valide a hipótese com compradores.',nos:['s1','t1'],fontes:['https://www.startse.com/artigos/ia-educacao']}:{sinais:[{id:'s1',titulo:'Agentes na educação',resumo:'Adoção experimental em programas de capacitação.',tendencia:'subindo',temas:['IA'],oQueFazer:'Entrevistar compradores e testar um piloto.',fontes:[{url:'https://www.startse.com/artigos/ia-educacao'},{url:'https://empresa.com/produto?id=2'}]},{id:'s2',titulo:'Novas competências',resumo:'Mudanças no trabalho exigem aprendizagem.',tendencia:'estavel',temas:['IA'],oQueFazer:'Mapear lacunas de competências.',fontes:[{url:'https://www.startse.com/artigos/trabalho'}]}],nos:[{id:'t1',rotulo:'IA',tipo:'tema',peso:8},{id:'s1',rotulo:'Agentes na educação',tipo:'sinal',peso:6},{id:'s2',rotulo:'Novas competências',tipo:'sinal',peso:5},{id:'a1',rotulo:'Empresas',tipo:'ator',peso:3}],arestas:[{origem:'t1',destino:'s1',relacao:'habilita',peso:3},{origem:'s1',destino:'s2',relacao:'exige',peso:2},{origem:'a1',destino:'s1',relacao:'experimenta',peso:2}],conexoes:[{titulo:'Aprender para adotar IA',explicacao:'A adoção de agentes aumenta a importância de desenvolver competências.',nos:['s1','s2','t1']}]};
  return Response.json({choices:[{message:{content:JSON.stringify(v)}}]});
 }
 if(url.startsWith('https://api.elevenlabs.io/v2/voices'))return Response.json({voices:[{voice_id:'voz_teste',name:'Voz Brasileira',labels:{accent:'Brazilian'}}],has_more:false});
 if(url.startsWith('https://api.elevenlabs.io/v1/convai/tools'))return Response.json({id:'tool_radar'});
 if(url.startsWith('https://api.elevenlabs.io/v1/convai/agents/create'))return Response.json({agent_id:'agent_radar'});
 if(url.startsWith('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url'))return Response.json({signed_url:'wss://api.elevenlabs.io/v1/convai/conversation?authorization=fixture'});
 if(url.startsWith('https://openrouter.ai/api/v1/models'))return Response.json({data:[]});
 if(url.startsWith('https://news.google.com/'))return new Response('<rss></rss>');
 if(url.startsWith('https://hn.algolia.com/'))return Response.json({hits:[]});
 if(url.includes('reddit.com/'))return Response.json({data:{children:[]}});
 if(url.startsWith('https://api.github.com/'))return Response.json({items:[]});
 return original(input,init);
};
