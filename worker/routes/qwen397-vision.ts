import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {estimateCost,inspectImage} from '../lib/openai';
import {callQwen397Vision,hasQwen397Endpoint,qwen397Status} from '../lib/qwen397-runtime';

export const qwen397Vision=new Hono<{Bindings:Bindings;Variables:Variables}>();
qwen397Vision.use('/vision',requireAuth);

function imageDataUrl(file:File,bytes:Uint8Array){
  let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return`data:${file.type};base64,${btoa(binary)}`;
}

async function recordUsage(env:Bindings,userId:string,data:{provider:string;service:string;model:string;input:number;output:number;cost:number;metadata:Record<string,unknown>}){
  await env.DB.prepare('INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),userId,data.provider,data.service,data.model,data.input,0,data.output,data.cost,JSON.stringify(data.metadata)).run();
}

qwen397Vision.post('/vision',async c=>{
  const form=await c.req.formData();
  const file=form.get('image');
  const prompt=String(form.get('prompt')||'Analiza esta imagen y explica lo importante.');
  if(!(file instanceof File)||!file.type.startsWith('image/')||file.size>8*1024*1024)return c.json({error:'Imagen inválida o mayor a 8 MB'},400);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const dataUrl=imageDataUrl(file,bytes);
  const status=qwen397Status(c.env);
  let qwenFailure:string|undefined;

  if(hasQwen397Endpoint(c.env)){
    try{
      const out=await callQwen397Vision(c.env,prompt,dataUrl);
      await recordUsage(c.env,c.get('userId'),{
        provider:'Qwen',service:'qwen3.5-397b-vision',model:out.model,input:Number(out.usage.input_tokens||0),output:Number(out.usage.output_tokens||0),cost:0,
        metadata:{size:file.size,type:file.type,requestedModel:status.model,effectiveModel:out.model,fallback:false,runtimeId:status.runtimeId,multimodal:true,license:status.license}
      });
      return c.json({answer:out.text,provider:'qwen',model:out.model,requestedModel:status.model,modelTier:'open-multimodal-moe-397b',fallback:false,runtime:status});
    }catch(error){
      qwenFailure=error instanceof Error?error.message:'Qwen 397B no respondió';
    }
  }else{
    qwenFailure=status.reason;
  }

  try{
    const fallbackPrompt=`${prompt}\n\nQwen3.5-397B-A17B no estuvo disponible (${qwenFailure||'endpoint no configurado'}). Responde como fallback visual identificado y no afirmes que analizó Qwen.`;
    const out=await inspectImage(c.env,fallbackPrompt,dataUrl);
    const usage=estimateCost(out.usage,out.model);
    await recordUsage(c.env,c.get('userId'),{
      provider:'OpenAI',service:'qwen397-vision-fallback',model:out.model,input:usage.input,output:usage.output,cost:usage.costUsd,
      metadata:{size:file.size,type:file.type,requestedModel:status.model,effectiveModel:out.model,fallback:true,fallbackReason:qwenFailure||null,pricingModel:usage.pricingModel,pricingKnown:usage.pricingKnown,pricingSource:usage.pricingSource,longContext:usage.longContext,cacheWriteTokens:usage.cacheWrite}
    });
    return c.json({answer:out.text,provider:'openai',model:out.model,requestedModel:status.model,modelTier:'vision-fallback',fallback:true,fallbackReason:qwenFailure,runtime:status});
  }catch(error){
    return c.json({error:error instanceof Error?error.message:'Error de visión',qwenFailure,runtime:status},502);
  }
});
