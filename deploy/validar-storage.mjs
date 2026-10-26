const url=process.env.TIO_SUPABASE_URL,key=process.env.TIO_SERVICE_KEY;
const response=await fetch(url+'/storage/v1/bucket/documentos',{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000)});
if(!response.ok)throw Error('Nao foi possivel verificar o bucket existente: HTTP '+response.status);
const bucket=await response.json();if(bucket.public!==false)throw Error('O bucket precisa continuar privado.');
console.log(JSON.stringify({bucket:bucket.id,privado:!bucket.public,limite_bytes:bucket.file_size_limit,google_configurado:Boolean(process.env.GOOGLE_MAPS_KEY)}));
