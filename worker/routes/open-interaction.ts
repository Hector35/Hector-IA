import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';

export const openInteraction=new Hono<{Bindings:Bindings;Variables:Variables}>();
openInteraction.use('*',requireAuth);

openInteraction.post('/chat',c=>c.json({
 error:'Esta ruta heredada fue retirada para impedir respuestas mediante OpenAI.',
 replacement:'/api/intelligence/chat',
 providerPolicy:'open-model-only'
},410));

openInteraction.post('/vision',async c=>{
 const form=await c.req.formData(),file=form.get('image'),prompt=String(form.get('prompt')||'Describe y analiza esta imagen con precisión.');
 if(!(file instanceof File)||!file.type.startsWith('image/')||file.size>8*1024*1024)return c.json({error:'Imagen inválida o mayor a 8 MB'},400);
 if(!c.env.AI)return c.json({error:'La visión abierta de Héctor no está disponible. La imagen no se enviará a OpenAI.'},503);
 const model='@cf/llava-hf/llava-1.5-7b-hf',bytes=[...new Uint8Array(await file.arrayBuffer())],started=Date.now();
 try{
  const result=await c.env.AI.run(model as any,{image:bytes,prompt,max_tokens:700} as any) as any;
  const text=typeof result==='string'?result:result?.description||result?.response||result?.result?.description||result?.result?.response||'';
  if(!String(text).trim())throw new Error('El modelo de visión abierto devolvió una respuesta vacía');
  await c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),c.get('userId'),'Cloudflare','vision-open-model',model,0,0,0,0,JSON.stringify({size:file.size,type:file.type,latencyMs:Date.now()-started,pricingKnown:false,openAIUsed:false})).run();
  return c.json({answer:String(text),provider:'cloudflare',model,openAIUsed:false});
 }catch(error){return c.json({error:error instanceof Error?error.message:'Error de visión abierta',provider:'cloudflare',openAIUsed:false},502);}
});
