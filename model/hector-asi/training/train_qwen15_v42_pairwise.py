from __future__ import annotations
import argparse, hashlib, json, os, platform, random, time
from pathlib import Path
import torch
import torch.nn.functional as F
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE='Qwen/Qwen2.5-1.5B-Instruct'
REV='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
TARGET=['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj']

def sha(p:Path): return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p): return [json.loads(x) for x in Path(p).read_text().splitlines() if x.strip()]
def ids(rows): return {x['id'] for x in rows}
def prompts(rows): return {' '.join(x['prompt'].lower().split()) for x in rows}

def sequence_logp(model,tok,prompt,answer,max_len=192):
    prefix=tok.apply_chat_template([{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True)
    full=prefix+answer+tok.eos_token
    enc=tok(full,return_tensors='pt',truncation=True,max_length=max_len)
    pref=tok(prefix,return_tensors='pt',truncation=True,max_length=max_len)['input_ids'].shape[1]
    labels=enc['input_ids'].clone(); labels[:,:pref]=-100
    out=model(**enc); logits=out.logits[:,:-1]; lab=labels[:,1:]
    mask=lab.ne(-100); safe=lab.masked_fill(~mask,0)
    lp=F.log_softmax(logits,dim=-1).gather(-1,safe.unsqueeze(-1)).squeeze(-1)
    return (lp*mask).sum()/mask.sum().clamp_min(1)

def evaluate(model,tok,rows):
    model.eval(); wins=0; margins=[]
    with torch.no_grad():
        for r in rows:
            m=(sequence_logp(model,tok,r['prompt'],r['chosen'])-sequence_logp(model,tok,r['prompt'],r['rejected'])).item()
            margins.append(m); wins+=m>0
    return {'accuracy':wins/len(rows),'mean_margin':sum(margins)/len(margins),'count':len(rows)}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--train',required=True); ap.add_argument('--test',required=True); ap.add_argument('--out',required=True); ap.add_argument('--seed',type=int,default=35); a=ap.parse_args()
    random.seed(a.seed); torch.manual_seed(a.seed); torch.set_num_threads(min(4,os.cpu_count() or 1))
    tr,te=load(a.train),load(a.test)
    assert len(tr)==12 and len(te)==6 and not(ids(tr)&ids(te)) and not(prompts(tr)&prompts(te))
    tok=AutoTokenizer.from_pretrained(BASE,revision=REV,use_fast=True); tok.pad_token=tok.pad_token or tok.eos_token
    base=AutoModelForCausalLM.from_pretrained(BASE,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager')
    model=get_peft_model(base,LoraConfig(r=8,lora_alpha=16,lora_dropout=.05,target_modules=TARGET,bias='none',task_type='CAUSAL_LM'))
    before=evaluate(model,tok,te); opt=torch.optim.AdamW((p for p in model.parameters() if p.requires_grad),lr=2e-5,weight_decay=.01,foreach=False)
    started=time.time(); model.train(); losses=[]
    for r in tr:
        opt.zero_grad(set_to_none=True)
        margin=sequence_logp(model,tok,r['prompt'],r['chosen'])-sequence_logp(model,tok,r['prompt'],r['rejected'])
        loss=-F.logsigmoid(0.1*margin); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); opt.step(); losses.append(loss.item())
    after=evaluate(model,tok,te)
    out=Path(a.out); out.mkdir(parents=True,exist_ok=True); model.save_pretrained(out/'adapter',safe_serialization=True); tok.save_pretrained(out/'adapter')
    af=out/'adapter'/'adapter_model.safetensors'
    manifest={'experiment':'hector-asi-qwen15-v42','method':'pairwise-preference-LoRA','baseModel':BASE,'baseRevision':REV,'seed':a.seed,'trainRows':len(tr),'testRows':len(te),'trainSha256':sha(Path(a.train)),'testSha256':sha(Path(a.test)),'rank':8,'alpha':16,'beta':0.1,'lr':2e-5,'steps':len(tr),'before':before,'after':after,'meanTrainLoss':sum(losses)/len(losses),'adapterSha256':sha(af),'adapterBytes':af.stat().st_size,'durationSeconds':round(time.time()-started,3),'hardware':platform.platform(),'torch':torch.__version__,'rollback':'hector-asi-qwen15-v15'}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)); print(json.dumps(manifest,sort_keys=True))
    assert after['accuracy']>=before['accuracy'] and after['mean_margin']>before['mean_margin']
if __name__=='__main__': main()
