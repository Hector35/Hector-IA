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
EPOCHS=2
LR=5e-6


def sha(path:Path)->str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path:str):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def normalized_prompts(rows):
    return {' '.join(row['prompt'].lower().split()) for row in rows}


def encoded(tokenizer,prompt,answer,max_len=224):
    prefix=tokenizer.apply_chat_template([{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True)
    batch=tokenizer(prefix+answer+tokenizer.eos_token,return_tensors='pt',truncation=True,max_length=max_len)
    prefix_len=tokenizer(prefix,return_tensors='pt',truncation=True,max_length=max_len)['input_ids'].shape[1]
    labels=batch['input_ids'].clone(); labels[:,:prefix_len]=-100
    if labels.ne(-100).sum().item()==0:
        raise ValueError('Respuesta completamente truncada')
    return batch,labels


def sequence_logp(model,batch,labels):
    logits=model(**batch).logits[:,:-1]
    shifted=labels[:,1:]
    mask=shifted.ne(-100)
    safe=shifted.masked_fill(~mask,0)
    token_logp=F.log_softmax(logits,dim=-1).gather(-1,safe.unsqueeze(-1)).squeeze(-1)
    return (token_logp*mask).sum()/mask.sum().clamp_min(1)


def evaluate(model,tokenizer,rows):
    model.eval(); wins=0; margins=[]; by_domain={}
    with torch.no_grad():
        for row in rows:
            chosen_batch,chosen_labels=encoded(tokenizer,row['prompt'],row['chosen'])
            rejected_batch,rejected_labels=encoded(tokenizer,row['prompt'],row['rejected'])
            margin=(sequence_logp(model,chosen_batch,chosen_labels)-sequence_logp(model,rejected_batch,rejected_labels)).item()
            passed=margin>0; wins+=passed; margins.append(margin)
            domain=by_domain.setdefault(row['domain'],{'wins':0,'count':0})
            domain['count']+=1; domain['wins']+=int(passed)
    return {'accuracy':wins/len(rows),'mean_margin':sum(margins)/len(margins),'count':len(rows),'byDomain':by_domain}


def pairwise_step(model,tokenizer,row,optimizer):
    chosen_batch,chosen_labels=encoded(tokenizer,row['prompt'],row['chosen'])
    rejected_batch,rejected_labels=encoded(tokenizer,row['prompt'],row['rejected'])
    with torch.no_grad():
        margin_value=sequence_logp(model,chosen_batch,chosen_labels)-sequence_logp(model,rejected_batch,rejected_labels)
        grad_margin=(-BETA*torch.sigmoid(-BETA*margin_value)).item()
        loss=(-F.logsigmoid(BETA*margin_value)).item()
    optimizer.zero_grad(set_to_none=True)
    (grad_margin*sequence_logp(model,chosen_batch,chosen_labels)).backward()
    del chosen_batch,chosen_labels
    ((-grad_margin)*sequence_logp(model,rejected_batch,rejected_labels)).backward()
    del rejected_batch,rejected_labels
    grad_norm=float(torch.nn.utils.clip_grad_norm_(model.parameters(),1.0))
    optimizer.step()
    return loss,float(margin_value),grad_norm


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--train',required=True); parser.add_argument('--test',required=True)
    parser.add_argument('--source-adapter',required=True); parser.add_argument('--out',required=True)
    parser.add_argument('--seed',type=int,default=35)
    args=parser.parse_args()
    random.seed(args.seed); torch.manual_seed(args.seed); torch.use_deterministic_algorithms(True)
    torch.set_num_threads(min(4,os.cpu_count() or 1))
    train,test=load(args.train),load(args.test)
    assert len(train)==18 and len(test)==8
    assert len({r['id'] for r in train})==18 and len({r['id'] for r in test})==8
    assert not ({r['id'] for r in train}&{r['id'] for r in test})
    assert not (normalized_prompts(train)&normalized_prompts(test))
    assert all({'id','prompt','chosen','rejected','domain'}<=set(r) for r in train+test)
    source=Path(args.source_adapter); source_file=source/'adapter_model.safetensors'
    assert source_file.is_file() and sha(source_file)==SOURCE_SHA
    tokenizer=AutoTokenizer.from_pretrained(BASE,revision=REV,use_fast=True)
    tokenizer.pad_token=tokenizer.pad_token or tokenizer.eos_token
    base=AutoModelForCausalLM.from_pretrained(BASE,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True,attn_implementation='eager')
    model=PeftModel.from_pretrained(base,source,is_trainable=True)
    trainable=sum(p.numel() for p in model.parameters() if p.requires_grad); assert trainable>0
    before=evaluate(model,tokenizer,test)
    optimizer=torch.optim.AdamW((p for p in model.parameters() if p.requires_grad),lr=LR,weight_decay=.01,foreach=False)
    started=time.time(); losses=[]; margins=[]; grad_norms=[]; steps=0
    for epoch in range(EPOCHS):
        order=list(range(len(train))); random.Random(args.seed+epoch).shuffle(order); model.train()
        for index in order:
            loss,margin,grad_norm=pairwise_step(model,tokenizer,train[index],optimizer)
            losses.append(loss); margins.append(margin); grad_norms.append(grad_norm); steps+=1
    after=evaluate(model,tokenizer,test)
    out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
    model.save_pretrained(out/'adapter',safe_serialization=True); tokenizer.save_pretrained(out/'adapter')
    adapter_file=out/'adapter'/'adapter_model.safetensors'
    manifest={'experiment':'hector-asi-qwen15-v45','method':'corrective-pairwise-continuation-from-v15','sourceRuntime':SOURCE_RUNTIME,'sourceAdapterSha256':SOURCE_SHA,'baseModel':BASE,'baseRevision':REV,'seed':args.seed,'trainRows':len(train),'testRows':len(test),'trainSha256':sha(Path(args.train)),'testSha256':sha(Path(args.test)),'beta':BETA,'lr':LR,'epochs':EPOCHS,'steps':steps,'trainableParameters':trainable,'before':before,'after':after,'meanTrainLoss':sum(losses)/len(losses),'meanTrainMargin':sum(margins)/len(margins),'meanGradNorm':sum(grad_norms)/len(grad_norms),'maxGradNorm':max(grad_norms),'adapterSha256':sha(adapter_file),'adapterBytes':adapter_file.stat().st_size,'durationSeconds':round(time.time()-started,3),'hardware':platform.platform(),'python':platform.python_version(),'torch':torch.__version__,'rollback':SOURCE_RUNTIME}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True))
    print(json.dumps(manifest,sort_keys=True))
    assert after['accuracy']>=before['accuracy']
    assert after['mean_margin']>before['mean_margin']


if __name__=='__main__':
    main()
