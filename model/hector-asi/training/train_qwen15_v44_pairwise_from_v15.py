from __future__ import annotations
import argparse, hashlib, json, os, platform, random, time
from pathlib import Path
import torch
import torch.nn.functional as F
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE='Qwen/Qwen2.5-1.5B-Instruct'
REV='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
SOURCE_RUNTIME='hector-asi-qwen15-v15'
SOURCE_SHA='ef9d36b288e100bbcddbab475758699416908627a59206c9a82f60ce711d66dc'
BETA=.1

def sha(p:Path): return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p): return [json.loads(x) for x in Path(p).read_text().splitlines() if x.strip()]
def ids(rows): return {x['id'] for x in rows}
def prompts(rows): return {' '.join(x['prompt'].lower().split()) for x in rows}

def encoded(tok,prompt,answer,max_len=192):
    prefix=tok.apply_chat_template([{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True)
    enc=tok(prefix+answer+tok.eos_token,return_tensors='pt',truncation=True,max_length=max_len)
    pref=tok(prefix,return_tensors='pt',truncation=True,max_length=max_len)['input_ids'].shape[1]
    labels=enc['input_ids'].clone(); labels[:,:pref]=-100
    return enc,labels

def sequence_logp(model,enc,labels):
    out=model(**enc); logits=out.logits[:,:-1]; lab=labels[:,1:]
    mask=lab.ne(-100); safe=lab.masked_fill(~mask,0)
    lp=F.log_softmax(logits,dim=-1).gather(-1,safe.unsqueeze(-1)).squeeze(-1)
    return (lp*mask).sum()/mask.sum().clamp_min(1)

def evaluate(model,tok,rows):
    model.eval(); wins=0; margins=[]
    with torch.no_grad():
        for r in rows:
            ce,cl=encoded(tok,r['prompt'],r['chosen']); re,rl=encoded(tok,r['prompt'],r['rejected'])
            m=(sequence_logp(model,ce,cl)-sequence_logp(model,re,rl)).item()
            margins.append(m); wins+=m>0
    return {'accuracy':wins/len(rows),'mean_margin':sum(margins)/len(margins),'count':len(rows)}

def pairwise_step(model,tok,row,opt):
    ce,cl=encoded(tok,row['prompt'],row['chosen']); re,rl=encoded(tok,row['prompt'],row['rejected'])
    with torch.no_grad():
        margin_value=sequence_logp(model,ce,cl)-sequence_logp(model,re,rl)
        grad_margin=(-BETA*torch.sigmoid(-BETA*margin_value)).item()
        loss=(-F.logsigmoid(BETA*margin_value)).item()
    opt.zero_grad(set_to_none=True)
    (grad_margin*sequence_logp(model,ce,cl)).backward(); del ce,cl
    ((-grad_margin)*sequence_logp(model,re,rl)).backward(); del re,rl
    torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); opt.step()
    return loss,float(margin_value)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--train',required=True); ap.add_argument('--test',required=True); ap.add_argument('--source-adapter',required=True); ap.add_argument('--out',required=True); ap.add_argument('--seed',type=int,default=35); a=ap.parse_args()
    random.seed(a.seed); torch.manual_seed(a.seed); torch.use_deterministic_algorithms(True); torch.set_num_threads(min(4,os.cpu_count() or 1))
    tr,te=load(a.train),load(a.test); source=Path(a.source_adapter); source_file=source/'adapter_model.safetensors'
    assert len(tr)==12 and len(te)==6 and not(ids(tr)&ids(te)) and not(prompts(tr)&prompts(te))
    assert source_file.is_file() and sha(source_file)==SOURCE_SHA
    tok=AutoTokenizer.from_pretrained(BASE,revision=REV,use_fast=True); tok.pad_token=tok.pad_token or tok.eos_token
    base=AutoModelForCausalLM.from_pretrained(BASE,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager')
    model=PeftModel.from_pretrained(base,source,is_trainable=True)
    trainable=sum(p.numel() for p in model.parameters() if p.requires_grad); assert trainable>0
    before=evaluate(model,tok,te); opt=torch.optim.AdamW((p for p in model.parameters() if p.requires_grad),lr=1e-5,weight_decay=.01,foreach=False)
    started=time.time(); losses=[]; train_margins=[]; model.train()
    for r in tr:
        loss,margin=pairwise_step(model,tok,r,opt); losses.append(loss); train_margins.append(margin)
    after=evaluate(model,tok,te)
    out=Path(a.out); out.mkdir(parents=True,exist_ok=True); model.save_pretrained(out/'adapter',safe_serialization=True); tok.save_pretrained(out/'adapter')
    af=out/'adapter'/'adapter_model.safetensors'
    manifest={'experiment':'hector-asi-qwen15-v44','method':'pairwise-preference-continuation-from-v15','sourceRuntime':SOURCE_RUNTIME,'sourceAdapterSha256':SOURCE_SHA,'baseModel':BASE,'baseRevision':REV,'seed':a.seed,'trainRows':len(tr),'testRows':len(te),'trainSha256':sha(Path(a.train)),'testSha256':sha(Path(a.test)),'beta':BETA,'lr':1e-5,'steps':len(tr),'trainableParameters':trainable,'before':before,'after':after,'meanTrainLoss':sum(losses)/len(losses),'meanTrainMargin':sum(train_margins)/len(train_margins),'adapterSha256':sha(af),'adapterBytes':af.stat().st_size,'durationSeconds':round(time.time()-started,3),'hardware':platform.platform(),'torch':torch.__version__,'rollback':SOURCE_RUNTIME}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)); print(json.dumps(manifest,sort_keys=True))
    assert after['accuracy']>=before['accuracy'] and after['mean_margin']>before['mean_margin']
if __name__=='__main__': main()
