import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {callQwen397Vision,hasQwen397Endpoint,qwen397Status} from '../lib/qwen397-runtime';
import {inspectImage,estimateCost} from '../lib/openai';

export const qwen397Vision=new Hono<{Bindings:Bindings;Variables:Variables}>();
qwen397Vision.use('/vision',requireAuth);

qwen397Vision.post('/vision',async c=>{
 const form=await c.req.formData(),file=form.get('image'),prompt=String(form.get('prompt')||'¿Qué ves y qué debería saber o hacer?');
 if(!(file instanceof File)||!file.type.startsWith('image/')||file.size>8*1024*1024)return c.json({error:'Imagen inválida o mayor a 8 MB'},400);
 const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 const dataUrl=`data:${file.type};base64,${btoa(binary)}`,configured=hasQwen397Endpoint(c.env),status=qwen397Status(c.env);
 try{
  if(configured){
   try{
    const out=await callQwen397Vision(c.env,prompt,dataUrl);
    await c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),c.get('userId'),'Qwen 397B endpoint','qwen397-vision',out.model,Number(out.usage?.input_tokens||0),0,Number(out.usage?.output_tokens||0),0,JSON.stringify({requestedModel:status.model,effectiveModel:out.model,fallback:false,size:file.size,type:file.type})).run();
    return c.json({answer:out.text,model:out.model,requestedModel:status.model,provider:'Qwen 397B endpoint',fallback:false,runtime:status,usage:out.usage});
   }catch(error){
    const reason=error instanceof Error?error.message:'Qwen 397B no respondió';
    const out=await inspectImage(c.env,prompt,dataUrl),u=estimateCost(out.usage,out.model);
    await c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),c.get('userId'),'OpenAI','qwen397-vision-fallback',out.model,u.input,u.cached,u.output,u.costUsd,JSON.stringify({requestedModel:status.model,effectiveModel:out.model,fallback:true,fallbackReason:reason,size:file.size,type:file.type})).run();
    return c.json({answer:out.text,model:out.model,requestedModel:status.model,provider:'OpenAI',fallback:true,fallbackReason:`Qwen 397B falló: ${reason}`,runtime:status,usage:u});
   }
  }
  const out=await inspectImage(c.env,prompt,dataUrl),u=estimateCost(out.usage,out.model),reason='Qwen 397B no tiene endpoint y secreto configurados';
  await c.env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),c.get('userId'),'OpenAI','qwen397-vision-fallback',out.model,u.input,u.cached,u.output,u.costUsd,JSON.stringify({requestedModel:status.model,effectiveModel:out.model,fallback:true,fallbackReason:reason,size:file.size,type:file.type})).run();
  return c.json({answer:out.text,model:out.model,requestedModel:status.model,provider:'OpenAI',fallback:true,fallbackReason:reason,runtime:status,usage:u});
 }catch(error){return c.json({error:error instanceof Error?error.message:'Error de visión',runtime:status},502);}
});
