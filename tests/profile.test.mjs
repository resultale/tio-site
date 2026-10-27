import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
const uid='11111111-1111-4111-8111-111111111111';
async function setup(t,fail=false){
 const files=new Map();let current=null;
 const server=createServer({maps:{},blobs:{put:async(p,b)=>files.set(p,b),get:async p=>files.get(p),remove:async ps=>ps.forEach(p=>files.delete(p))},rpc:async(name,p)=>{
  if(name==='app_foto_perfil_contexto')return {ok:p.p_sessao_token==='valid',usuario_id:uid};
  if(name==='app_foto_perfil_salvar'){if(fail)return {ok:false};current=p.p_foto_id;return {ok:true,public_url:`https://chamaotio.com/media/perfis/${uid}/${current}.jpg`};}
  if(name==='app_foto_perfil_publica')return {ok:p.p_usuario_id===uid&&p.p_foto_id===current,path:`perfis/${uid}/${current}.jpg`};
  throw Error('RPC inesperada');
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 return {base:`http://127.0.0.1:${server.address().port}`,files};
}
const photo=Buffer.from([255,216,255,0,1]).toString('base64');
test('upload autenticado e leitura apenas do avatar atual',async t=>{
 const {base,files}=await setup(t);
 const send=()=>fetch(base+'/api/perfil/foto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessao_token:'valid',base64:photo})});
 let r=await send();assert.equal(r.status,200);const first=await r.json();assert.equal(files.size,1);
 assert.equal((await fetch(base+new URL(first.public_url).pathname)).status,200);
 r=await send();assert.equal(r.status,200);
 assert.equal((await fetch(base+new URL(first.public_url).pathname)).status,404);
 assert.equal((await fetch(base+'/media/perfis/'+uid+'/cnh.jpg')).status,404);
});
test('sessão inválida e conteúdo inválido não armazenam nada',async t=>{
 const {base,files}=await setup(t);
 for(const [token,b64,status]of [['expired',photo,401],['valid','aGVsbG8=',400]]){
  const r=await fetch(base+'/api/perfil/foto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessao_token:token,base64:b64})});assert.equal(r.status,status);
 }assert.equal(files.size,0);
});
test('revogação entre upload e gravação remove apenas arquivo novo',async t=>{
 const {base,files}=await setup(t,true);
 const r=await fetch(base+'/api/perfil/foto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessao_token:'valid',base64:photo})});assert.equal(r.status,401);assert.equal(files.size,0);
});
