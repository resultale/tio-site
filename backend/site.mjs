import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {localTestStorage} from './storage.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const error=(message,status=400)=>Object.assign(new Error(message),{status});
export function rpcClient({url,key,fetcher=fetch}){return async(name,args={})=>{
  const response=await fetcher(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json','Content-Profile':'api'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw error('Serviço temporariamente indisponível. Tente novamente com os mesmos dados.',503);
  return response.json();
};}
export function googleClient(key,{fetcher=fetch,maxPerDay=300}={}){
  let date='',count=0;const cache=new Map();
  return async(action,text,city)=>{
    if(!key)throw error('A busca de endereços está indisponível. Tente mais tarde.',503);
    const id=JSON.stringify([action,text,city.id]),cached=cache.get(id);if(cached&&cached.until>Date.now())return cached.data;
    const today=new Date().toISOString().slice(0,10);if(date!==today){date=today;count=0;}if(count>=maxPerDay)throw error('Limite da busca de endereços atingido. Tente mais tarde.',429);count++;
    const url=new URL(action==='autocomplete'?'https://maps.googleapis.com/maps/api/place/autocomplete/json':'https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('key',key);url.searchParams.set('language','pt-BR');
    if(action==='autocomplete'){url.searchParams.set('input',`${text}, ${city.cidade}`);url.searchParams.set('components','country:br');if(city.latitude!=null&&city.longitude!=null){url.searchParams.set('location',`${city.latitude},${city.longitude}`);url.searchParams.set('radius','30000');}}
    else{url.searchParams.set('address',`${text}, ${city.cidade}, Brasil`);url.searchParams.set('components','country:BR');}
    let response;try{response=await fetcher(url,{signal:AbortSignal.timeout(10000)});}catch{throw error('Não foi possível consultar o endereço. Tente novamente.',503);}
    if(!response.ok)throw error('Busca de endereços indisponível.',503);const data=await response.json();let result;
    if(!['OK','ZERO_RESULTS'].includes(data.status))throw error('Busca de endereços indisponível.',503);
    if(action==='autocomplete')result={sugestoes:(data.predictions||[]).slice(0,5).map(x=>({descricao:x.description,place_id:x.place_id}))};
    else{const found=(data.results||[]).find(x=>x.address_components?.some(c=>c.types.some(t=>['locality','administrative_area_level_2'].includes(t))&&normalize(c.long_name)===normalize(city.cidade)));const geo=found?.geometry?.location;
      if(!found||!Number.isFinite(geo?.lat)||!Number.isFinite(geo?.lng))throw error('O endereço precisa estar na cidade selecionada. Confira rua e número.');
      result={address:found.formatted_address,latitude:geo.lat,longitude:geo.lng};}
    if(cache.size>1000)cache.clear();cache.set(id,{data:result,until:Date.now()+300000});return result;
  };
}
function fileType(bytes,pdf){if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'png'};
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:'image/jpeg',ext:'jpg'};
  if(pdf&&bytes.subarray(0,5).toString()==='%PDF-')return {mime:'application/pdf',ext:'pdf'};throw error('Arquivo inválido. Use JPG, PNG ou PDF para documentos.');}
export function createSiteApi({rpc,maps,storage,blobs=localTestStorage(storage),origins=['https://chamaotio.com','https://www.chamaotio.com'],secure=true}){
 const limits=new Map(),sessions=new Map();let catalogCache=null,active=0;
 const sessionName=secure?'__Host-tio_site_equipe':'tio_site_equipe';
 function rate(req,kind,max,window){const now=Date.now();for(const [k,v]of limits)if(v.until<now)limits.delete(k);const ip=req.headers['x-forwarded-for']?.split(',').at(-1)?.trim()||req.socket.remoteAddress;const key=kind+':'+ip;const item=limits.get(key)||{count:0,until:now+window};if(item.count>=max||limits.size>10000)throw error('Muitas tentativas. Aguarde antes de tentar novamente.',429);item.count++;limits.set(key,item);}
 const send=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));};
 async function catalog(){if(catalogCache&&catalogCache.until>Date.now())return catalogCache.data;const data=await rpc('site_catalogo');if(!Array.isArray(data.cidades)||!Array.isArray(data.categorias))throw error('Não foi possível consultar as cidades atendidas.',503);catalogCache={data,until:Date.now()+60000};return data;}
 async function city(id){if(!UUID.test(id))throw error('Selecione uma cidade atendida.');const found=(await catalog()).cidades.find(c=>c.id===id);if(!found)throw error('Selecione uma cidade atendida.');return found;}
 async function readBody(req,max){const parts=[];let size=0;if(Number(req.headers['content-length'])>max)throw error('Arquivos juntos: até 40 MB.',413);for await(const part of req){size+=part.length;if(size>max)throw error('Arquivos juntos: até 40 MB.',413);parts.push(part);}return Buffer.concat(parts);}
 const cookie=(value,maxAge)=>`${sessionName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;
 function getSession(req){const id=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(sessionName+'='))?.slice(sessionName.length+1);const s=sessions.get(id);if(!s||s.expires<Date.now()){sessions.delete(id);throw error('Entre novamente para acessar os cadastros.',401);}return s;}
 async function operator(req){const s=getSession(req),who=await rpc('painel_eu',{p_sessao_token:s.token});if(!who.sucesso)throw error('Acesso não autorizado.',401);return s;}
 async function register(req){
   if(!req.headers['content-type']?.startsWith('multipart/form-data'))throw error('Formato de cadastro inválido.');
   const form=await new Request('http://site/api/site',{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:await readBody(req,40*1024*1024)}).formData();
   const field=(name,required=true)=>{const value=form.get(name);if(value!==null&&typeof value!=='string')throw error('Confira os campos do cadastro.');if((required&&!value?.trim())||(value?.length||0)>500)throw error('Confira os campos obrigatórios.');return value?.trim()||'';};
   if(field('website',false))throw error('Cadastro inválido.');if(!form.get('consentimento'))throw error('Autorize a análise do cadastro.');
   const kind=field('tipo_cadastro'),requestId=field('request_id');if(!['motorista','negocio'].includes(kind)||!UUID.test(requestId))throw error('Recarregue a página antes de enviar.');
   const selectedCity=await city(field('cidade'));let tel=field('telefone').replace(/\D/g,'');if([10,11].includes(tel.length))tel='55'+tel;if(!/^55\d{10,11}$/.test(tel))throw error('Informe um telefone válido com DDD.');
   const fields={telefone:tel,cidade:selectedCity.cidade,cidade_id:selectedCity.id};const uploads=[];
   const upload=async(name,pdf)=>{const file=form.get(name);if(!file||typeof file==='string'||file.size<1||file.size>(pdf?8:5)*1024*1024)throw error('Documentos: até 8 MB. Fotos: até 5 MB. Confira os anexos obrigatórios.');const bytes=Buffer.from(await file.arrayBuffer());uploads.push({key:name,bytes,...fileType(bytes,pdf),hash:createHash('sha256').update(bytes).digest('hex')});};
   if(kind==='motorista'){fields.nome=field('nome');fields.email=field('email');fields.veiculo=field('veiculo');fields.modelo=field('modelo');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))throw error('Informe um e-mail válido.');if(!['Moto','Carro','Bicicleta','Fiorino','Van'].includes(fields.veiculo))throw error('Veículo inválido.');if(fields.veiculo!=='Bicicleta'){await upload('cnh',true);await upload('crlv',true);}await upload('foto_rosto',false);await upload('foto_veiculo',false);}
   else{fields.negocio=field('negocio');fields.responsavel=field('responsavel');fields.tipo=field('tipo');fields.cpf_cnpj=field('cpf_cnpj',false);const cat=(await catalog()).categorias.find(x=>x.codigo===fields.tipo);if(!cat)throw error('Selecione o tipo do negócio.');fields.tipo_nome=cat.nome;const placeId=field('place_id');const address=await maps('address',field('endereco'),selectedCity);fields.endereco=address.address;fields.latitude=address.latitude;fields.longitude=address.longitude;fields.place_id=placeId;await upload('documento_responsavel',true);await upload('foto_logo_estabelecimento',false);}
   const hash=createHash('sha256').update(JSON.stringify({kind,fields,files:uploads.map(x=>({key:x.key,hash:x.hash,size:x.bytes.length}))})).digest('hex');const id=randomUUID(),prefix=`cadastros-site/${id}/`,written=[];let dbStarted=false;
   try{const metadata=[];for(const file of uploads){const filename=`${file.key}.${file.ext}`;const objectPath=prefix+filename;written.push(objectPath);await blobs.put(objectPath,file.bytes,file.mime);metadata.push({key:file.key,path:objectPath,mime:file.mime,size:file.bytes.length,sha256:file.hash});}
     dbStarted=true;const result=await rpc('site_cadastro_receber',{p_id:id,p_request_id:requestId,p_hash:hash,p_tipo:kind,p_cidade:selectedCity.id,p_dados:fields,p_arquivos:metadata});
     if(!result.sucesso){dbStarted=false;throw error(result.mensagem||'Não foi possível receber o cadastro.');}
     if(result.protocolo!==id)await blobs.remove(written);
     return result;
   }catch(e){if(!dbStarted)await blobs.remove(written);throw e;}
 }
 return async function(req,res,url){if(!url.pathname.startsWith('/api/'))return false;
  try{
   if(req.method==='POST'&&!origins.includes(req.headers.origin))throw error('Origem não autorizada.',403);
   const team=url.pathname.startsWith('/api/equipe/');rate(req,team?'equipe':req.method==='POST'?'post':'get',team?30:req.method==='POST'?8:90,team?600000:req.method==='POST'?3600000:60000);
   if(url.pathname==='/api/site'&&req.method==='GET'){
    const action=url.searchParams.get('action')||'catalog';if(action==='catalog'){const data=await catalog();send(res,200,{cidades:data.cidades.map(c=>({id:c.id,cidade:c.cidade})),categorias:data.categorias});return true;}
    if(!['autocomplete','address'].includes(action))throw error('Consulta inválida.');const c=await city(url.searchParams.get('cidade')||''),text=(url.searchParams.get('text')||'').trim();if(text.length<3||text.length>300)throw error('Digite rua e número.');send(res,200,await maps(action,text,c));return true;
   }
   if(url.pathname==='/api/site'&&req.method==='POST'){if(active>=1)throw error('Estamos recebendo outros cadastros. Tente novamente em instantes.',429);active++;try{send(res,201,await register(req));}finally{active--;}return true;}
   if(url.pathname==='/api/equipe/codigo'&&req.method==='POST'){const data=JSON.parse((await readBody(req,4096)).toString());let tel=String(data.telefone||'').replace(/\D/g,'');if([10,11].includes(tel.length))tel='55'+tel;if(!/^55\d{10,11}$/.test(tel))throw error('Informe o WhatsApp com DDD.');const out=await rpc('gerar_otp_cadastro',{p_telefone:tel});send(res,out.sucesso?200:400,{sucesso:out.sucesso,mensagem:out.mensagem});return true;}
   if(url.pathname==='/api/equipe/entrar'&&req.method==='POST'){const data=JSON.parse((await readBody(req,4096)).toString());let tel=String(data.telefone||'').replace(/\D/g,'');if([10,11].includes(tel.length))tel='55'+tel;if(!/^55\d{10,11}$/.test(tel)||!/^\d{6}$/.test(String(data.codigo||'')))throw error('Confira o telefone e o código.');const result=await rpc('verificar_otp_cadastro_v2',{p_telefone:tel,p_codigo:String(data.codigo)});if(!result.sucesso||!result.sessao_token)throw error(result.mensagem||'Código inválido.',401);const allowed=await rpc('painel_site_cadastros',{p_sessao_token:result.sessao_token,p_limite:1});if(!allowed.sucesso){await rpc('app_revogar_sessao',{p_sessao_token:result.sessao_token,p_telefone:tel});throw error('Sem acesso aos cadastros.',403);}for(const [id,s]of sessions)if(s.expires<Date.now())sessions.delete(id);if(sessions.size>=200)throw error('Limite de sessões. Tente mais tarde.',429);const id=randomBytes(32).toString('hex');sessions.set(id,{token:result.sessao_token,phone:tel,expires:Date.now()+8*3600000});send(res,200,{sucesso:true},{'Set-Cookie':cookie(id,8*3600)});return true;}
   if(url.pathname==='/api/equipe/sair'&&req.method==='POST'){const s=await operator(req);await rpc('app_revogar_sessao',{p_sessao_token:s.token,p_telefone:s.phone});for(const [id,item]of sessions)if(item===s)sessions.delete(id);send(res,200,{sucesso:true},{'Set-Cookie':cookie('',0)});return true;}
   if(url.pathname==='/api/equipe/cadastros'&&req.method==='GET'){const s=await operator(req),data=await rpc('painel_site_cadastros',{p_sessao_token:s.token,p_limite:100});if(!data.sucesso)throw error('Sem acesso aos cadastros.',403);send(res,200,data);return true;}
   if(url.pathname==='/api/equipe/documento'&&req.method==='GET'){const s=await operator(req),id=url.searchParams.get('id'),key=url.searchParams.get('arquivo');if(!UUID.test(id||'')||!/^\w{1,50}$/.test(key||''))throw error('Documento inválido.');const data=await rpc('painel_site_documento',{p_sessao_token:s.token,p_id:id,p_arquivo:key});if(!data.sucesso)throw error('Documento não autorizado.',403);const file=data.arquivo;if(!new RegExp(`^cadastros-site/${id}/[a-z_]+\\.(png|jpg|pdf)$`).test(file.path))throw error('Documento inválido.');const bytes=await blobs.get(file.path);res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`attachment; filename="${key}.${file.path.split('.').at(-1)}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return true;}
   throw error('Não encontrado.',404);
  }catch(e){send(res,e.status||503,{sucesso:false,error:e.status?e.message:'Não foi possível concluir. Tente novamente com os mesmos dados.'});return true;}
 };
}
