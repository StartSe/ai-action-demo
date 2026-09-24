"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
type Widget = { destroy: () => void; open: () => void; emit: (name:string,data:unknown) => void };
export function EmbedPreview({ flowId }: { flowId: string }) {
  const [ready, setReady] = useState(false), [error, setError] = useState(""), [page, setPage] = useState(1), [selected, setSelected] = useState("");
  const widget = useRef<Widget | null>(null);
  useEffect(() => {
    if (!ready) return;
    const runtime = (window as unknown as {Agentflows:{mount:(options:unknown)=>Widget}}).Agentflows;
    const timer = setTimeout(() => {
    try {
      widget.current = runtime.mount({ url: location.origin, flowId, appVersion: "preview-1", getToken: async () => {
        const res = await fetch(`/api/flows/${flowId}/embed`, { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"preview"}) });
        const data = await res.json(); if (!res.ok) { setError(data.error); throw new Error(data.error); } return data;
      }, actions: {
        "app.openRecord": { description:"Abrir o cadastro de exemplo por nome", schema:{type:"object",properties:{name:{type:"string"}},required:["name"],additionalProperties:false}, handle: (args:{name:string}) => { setSelected(String(args.name).slice(0,80)); return {opened:true}; } }
      }});
      widget.current.open();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível abrir o chat."); }
    }, 0);
    return () => { clearTimeout(timer); widget.current?.destroy(); widget.current = null; };
  }, [flowId,ready]);
  return <main style={{maxWidth:1000,margin:"60px auto",padding:24,fontFamily:"var(--font-manrope), sans-serif"}}>
    <Script src="/embed.js" strategy="afterInteractive" onReady={() => setReady(true)}/>
    <a href={`/flows/${flowId}`} style={{color:"#635bff"}}>← Voltar ao fluxo</a><p style={{marginTop:40,color:"#888"}}>PÁGINA DE TESTE</p><h1 style={{fontSize:32,fontWeight:700,margin:"12px 0"}}>Sua aplicação, com uma conversa ao lado</h1><p style={{color:"#777",maxWidth:620}}>Use esta listagem para testar pedidos, seleção de elementos e navegação. Nenhum cadastro real é alterado.</p>
    {error && <p role="alert" style={{background:"#fff1ed",padding:16,borderRadius:12,marginTop:20}}>{error} Configure o chat na aba “Chat no site”, gere a chave do servidor e inclua o endereço desta instalação entre os sites permitidos.</p>}
    <section style={{marginTop:35,border:"1px solid #e6e3ef",borderRadius:18,padding:24,background:"white"}}><h2 style={{fontSize:21,fontWeight:600}}>Clientes</h2><table style={{width:"100%",marginTop:16,textAlign:"left"}}><thead><tr><th>Nome</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{(page===1?["Ana Souza","Bruno Lima","Carla Dias"]:["Daniel Reis","Elisa Rocha","Felipe Costa"]).map(name=><tr key={name}><td style={{padding:"18px 0"}}>{name}</td><td>Ativo</td><td><button data-agentflows-id={`open-${name.split(" ")[0]}`} onClick={()=>setSelected(name)} style={{color:"#635bff"}}>Abrir {name.split(" ")[0]}</button></td></tr>)}</tbody></table><div style={{display:"flex",gap:20,alignItems:"center",marginTop:20}}><button id="previous-page" disabled={page===1} onClick={()=>setPage(1)}>← Anterior</button><span>Página {page} de 2</span><button id="next-page" disabled={page===2} onClick={()=>setPage(2)}>Próxima →</button></div>{selected && <p role="status" style={{marginTop:20}}>Cadastro aberto: {selected}</p>}</section>
    <section style={{marginTop:30}}><button className="studio-button" onClick={()=>{widget.current?.emit("page.errorReported",{message:"A paginação não preservou o filtro aplicado.",source:"preview"});widget.current?.open();}}>Compartilhar problema de exemplo</button><p style={{fontSize:12,color:"#888",marginTop:12}}>O relato será contexto para a próxima análise do agente. Captura de tela e cliques solicitados pedem sua participação.</p></section>
  </main>;
}
