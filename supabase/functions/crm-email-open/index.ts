import { service, rpc } from '../_shared/runtime.ts';
// Opaque, dedicated token; no IP, user-agent, cookies or email address retained.
const pixel=Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),c=>c.charCodeAt(0));
Deno.serve(async req=>{
 if(!['GET','HEAD'].includes(req.method))return new Response(null,{status:405});
 const token=new URL(req.url).searchParams.get('t')||'';
 if(req.method==='GET'&&/^[0-9a-f-]{36}$/i.test(token))await rpc(service(),'record_sdr_open',{pixel:token}).catch(()=>{});
 return new Response(req.method==='HEAD'?null:pixel,{headers:{'Content-Type':'image/gif','Cache-Control':'no-store, no-cache, max-age=0','X-Content-Type-Options':'nosniff'}});
});
