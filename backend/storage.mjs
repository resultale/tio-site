import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
const valid=name=>/^cadastros-site\/[a-f0-9-]{36}\/[a-z_]+\.(png|jpg|pdf)$/.test(name);
export function supabaseStorage({url,key,fetcher=fetch}){
 const headers={apikey:key,Authorization:`Bearer ${key}`};
 const object=name=>{if(!valid(name))throw Error('Caminho de documento inválido.');return url+'/storage/v1/object/documentos/'+name;};
 return {
  async put(name,bytes,mime){const response=await fetcher(object(name),{method:'POST',headers:{...headers,'Content-Type':mime,'x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Não foi possível armazenar o documento.');},
  async get(name){object(name);const response=await fetcher(url+'/storage/v1/object/authenticated/documentos/'+name,{headers,signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Documento indisponível.');return Buffer.from(await response.arrayBuffer());},
  async remove(names){if(!names.length)return;if(names.some(name=>!valid(name)))throw Error('Caminho inválido.');const response=await fetcher(url+'/storage/v1/object/documentos',{method:'DELETE',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({prefixes:names}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Não foi possível limpar os anexos temporários.');}
 };
}
// Used only by isolated local tests. Production always uses the existing private bucket.
export function localTestStorage(root){return {
 async put(name,bytes){if(!valid(name))throw Error('Caminho inválido.');const full=path.join(root,name);await mkdir(path.dirname(full),{recursive:true,mode:0o700});await writeFile(full,bytes,{flag:'wx',mode:0o600});},
 async get(name){if(!valid(name))throw Error('Caminho inválido.');return readFile(path.join(root,name));},
 async remove(names){for(const name of names){if(!valid(name))throw Error('Caminho inválido.');await rm(path.dirname(path.join(root,name)),{recursive:true,force:true});}}
};}
