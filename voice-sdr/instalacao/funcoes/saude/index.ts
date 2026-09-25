// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/saude/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
//#region supabase/functions/_shared/versao-da-instalacao.ts
const VERSAO_DA_INSTALACAO = {
	migracao: "20261020000000",
	funcoes: "fbe34aa4dee0eda7"
};
//#endregion
//#region supabase/functions/saude/saude.ts
function enderecoDasFuncoes(urlDoProjeto) {
	const limpo = urlDoProjeto.trim().replace(/\/+$/, "");
	if (!/^https?:\/\/[^\s/]+(:\d+)?$/.test(limpo)) return null;
	return `${limpo}/functions/v1`;
}
async function atenderSaude(pedido, porta, ambiente) {
	if (pedido.metodo !== "GET") return {
		status: 405,
		corpo: {
			ok: false,
			erro: "metodo_invalido"
		}
	};
	let banco;
	try {
		banco = await porta.versaoDoBanco();
	} catch {
		banco = null;
	}
	let rotinas = "sem_endereco";
	const endereco = enderecoDasFuncoes(ambiente.urlDoProjeto);
	if (endereco) try {
		rotinas = await porta.registrarUrlBase(endereco) ? "registrada" : "ja_registrada";
	} catch {
		rotinas = "falhou";
	}
	const ok = banco !== null && (rotinas === "registrada" || rotinas === "ja_registrada");
	const chave = ambiente.chavePublicavel.trim();
	return {
		status: ok ? 200 : 503,
		corpo: {
			ok,
			chave: chave === "" ? null : chave,
			rotinas,
			versao: {
				banco,
				funcoes: ambiente.versaoDasFuncoes
			}
		}
	};
}
//#endregion
//#region supabase/functions/saude/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CHAVE_PUBLICAVEL = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
	"access-control-allow-methods": "GET, OPTIONS"
};
const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
const porta = {
	async registrarUrlBase(url) {
		const { data, error } = await servico.rpc("registrar_url_base_das_rotinas", { p_url: url });
		if (error) throw new Error(error.message);
		return data === true;
	},
	async versaoDoBanco() {
		const { data, error } = await servico.rpc("versao_da_instalacao");
		if (error) throw new Error(error.message);
		const versao = data ?? {};
		return {
			migracao: versao.migracao ?? null,
			funcoes: versao.funcoes ?? null
		};
	}
};
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	const resposta = await atenderSaude({ metodo: requisicao.method }, porta, {
		urlDoProjeto: URL_DO_SUPABASE,
		chavePublicavel: CHAVE_PUBLICAVEL,
		versaoDasFuncoes: VERSAO_DA_INSTALACAO
	});
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
