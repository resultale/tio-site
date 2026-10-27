import {randomUUID,createHash} from 'node:crypto';
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const media=new RegExp('^/media/perfis/('+UUID+')/('+UUID+')\\.jpg$','i');
const MAX=1024*1024;
const problem=(message,status=400)=>Object.assign(Error(message),{status});
export function createProfileApi({rpc,blobs}){
 const limits=new Map();
 function rate(id,max){const now=Date.now();for(const[k,v]of limits)if(v.until<=now)limits.delete(k);const item=limits.get(id)||{n:0,until:now+3600000};if(item.n>=max||limits.size>10000)throw problem('Muitas tentativas. Aguarde antes de enviar outra foto.',429);item.n++;limits.set(id,item);}
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 return async(req,res,url)=>{
  const match=media.exec(url.pathname),upload=url.pathname==='/api/perfil/foto';
  if(!match&&!upload)return false;
  try{
   if(match){if(!['GET','HEAD'].includes(req.method))throw problem('Método não permitido.',405);const d=await rpc('app_foto_perfil_publica',{p_usuario_id:match[1],p_foto_id:match[2]});if(!d?.ok)throw problem('Foto não encontrada.',404);const expected=`perfis/${match[1].toLowerCase()}/${match[2].toLowerCase()}.jpg`;if(d.path!==expected)throw problem('Foto não encontrada.',404);const bytes=await blobs.get(expected);res.writeHead(200,{'Content-Type':'image/jpeg','Content-Disposition':'inline','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);return true;}
   if(req.method!=='POST')throw problem('Método não permitido.',405);
   if(req.headers.origin&&!['https://chamaotio.com','https://www.chamaotio.com','https://painel.chamaotio.com'].includes(req.headers.origin))throw problem('Origem não autorizada.',403);
   if(!req.headers['content-type']?.startsWith('application/json'))throw problem('Envie uma foto válida.');
   rate('ip:'+(req.headers['x-forwarded-for']?.split(',').at(-1)?.trim()||req.socket.remoteAddress),120);
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2*MAX)throw problem('A foto deve ter até 1 MB.',413);chunks.push(chunk);}
   let data;try{data=JSON.parse(Buffer.concat(chunks));}catch{throw problem('Envie uma foto válida.');}
   const token=typeof data.sessao_token==='string'?data.sessao_token.trim():'';if(!token||token.length>512)throw problem('Entre novamente para atualizar sua foto.',401);
   rate('session:'+createHash('sha256').update(token).digest('hex'),20);
   const user=await rpc('app_foto_perfil_contexto',{p_sessao_token:token});if(!user?.ok||!new RegExp('^'+UUID+'$','i').test(user.usuario_id||''))throw problem('Entre novamente para atualizar sua foto.',401);
   if(typeof data.base64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64))throw problem('Foto inválida.');
   const bytes=Buffer.from(data.base64,'base64');if(!bytes.length||bytes.length>MAX)throw problem('A foto deve ter até 1 MB.',413);if(bytes.length<3||!bytes.subarray(0,3).equals(Buffer.from([255,216,255])))throw problem('Envie uma foto JPEG válida.');
   const photo=randomUUID(),path=`perfis/${user.usuario_id.toLowerCase()}/${photo}.jpg`;let dbStarted=false;
   try{await blobs.put(path,bytes,'image/jpeg');dbStarted=true;const result=await rpc('app_foto_perfil_salvar',{p_sessao_token:token,p_foto_id:photo});if(!result?.ok){dbStarted=false;throw problem('Entre novamente para atualizar sua foto.',401);}const expected=`https://chamaotio.com/media/perfis/${user.usuario_id.toLowerCase()}/${photo}.jpg`;if(result.public_url!==expected)throw problem('Não foi possível confirmar a foto.',503);send(res,200,{sucesso:true,public_url:expected});}
   catch(error){if(!dbStarted)await blobs.remove([path]);throw error;}return true;
  }catch(error){send(res,error.status||503,{sucesso:false,mensagem:error.status?error.message:'Não foi possível atualizar a foto. Tente novamente.'});return true;}
 };
}
