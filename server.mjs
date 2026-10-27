import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSiteApi,rpcClient,googleClient} from './backend/site.mjs';
import {createProfileApi} from './backend/profile.mjs';
import {supabaseStorage} from './backend/storage.mjs';
const publicRoot=fileURLToPath(new URL('./public/',import.meta.url));
const paths=new Map([['/','index.html'],['/cadastro-motorista/','cadastro-motorista/index.html'],['/cadastro-negocio/','cadastro-negocio/index.html'],['/privacidade/','privacidade/index.html'],['/styles.css','styles.css'],['/app.js','app.js'],['/logo-transparente.png','logo-transparente.png'],['/logo-oficial.png','logo-oficial.png'],['/logo.png','logo.png'],['/hero-bg.jpg','hero-bg.jpg'],['/equipe','equipe.html'],['/equipe.js','equipe.js']]);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',png:'image/png',jpg:'image/jpeg'};
export function createServer(options){const api=createSiteApi(options),profile=createProfileApi(options);return http.createServer(async(req,res)=>{
 try{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');const url=new URL(req.url,'http://site');
 if(await profile(req,res,url))return;
 if(await api(req,res,url))return;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});res.end(req.method==='HEAD'?undefined:'{"status":"ok","service":"tio-institucional-v2"}');return;}
 if(url.pathname==='/readyz'){try{const c=await options.rpc('site_catalogo');if(!Array.isArray(c.cidades)||!Array.isArray(c.categorias))throw Error();res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ready":true}');}catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"ready":false}');}return;}
 if(['/cadastro-motorista','/cadastro-negocio','/privacidade'].includes(url.pathname)){res.writeHead(308,{Location:url.pathname+'/'});res.end();return;}
 const file=paths.get(url.pathname);if(!file){res.writeHead(404);res.end('Não encontrado');return;}const body=await readFile(path.join(publicRoot,file));res.writeHead(200,{'Content-Type':types[file.split('.').at(-1)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:body);
 }catch{if(!res.headersSent){res.writeHead(500);res.end('Serviço temporariamente indisponível');}else res.end();}
 });}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {TIO_SUPABASE_URL:url,TIO_SERVICE_KEY:key,GOOGLE_MAPS_KEY:mapsKey}=process.env;if(!url||!key)throw Error('Configure o acesso ao banco v2 no servidor.');
 const server=createServer({rpc:rpcClient({url,key}),maps:googleClient(mapsKey),blobs:supabaseStorage({url,key}),origins:(process.env.SITE_ORIGINS||'https://chamaotio.com,https://www.chamaotio.com').split(',')});
 server.requestTimeout=60000;server.headersTimeout=15000;server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Institucional v2 iniciado.'));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
