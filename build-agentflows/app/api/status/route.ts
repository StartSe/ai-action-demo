import {chatGPT} from '@/lib/chatgpt';
import {sessaoAtual} from '@/lib/conta';
export const dynamic='force-dynamic';
export async function GET(req:Request){const connected=!!(await chatGPT().account()).account;return Response.json({ai:connected,demo:!connected,model:'ChatGPT',integrations:{chatgpt:connected},usuario:sessaoAtual(req)},{headers:{'Cache-Control':'no-store'}});}
