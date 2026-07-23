from __future__ import annotations
import argparse,gc,hashlib,json,math,os,platform,resource,time,unicodedata
from pathlib import Path
import torch
from peft import PeftModel
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed

MODEL="Qwen/Qwen2.5-1.5B-Instruct"; REV="989aa7980e4cf806f80c7fef2b1adb7bc71aa306"
BASE_SHA="31bead5f59982d8e321517fd235b81f992f83d2e3792a55690c2a841ff0e28f8"; BASE_BYTES=73911112

def args():
 p=argparse.ArgumentParser()
 p.add_argument("--baseline-adapter",required=True);p.add_argument("--output-dir",required=True)
 p.add_argument("--train-files",nargs="+",required=True);p.add_argument("--validation-files",nargs="+",required=True);p.add_argument("--test-files",nargs="+",required=True)
 p.add_argument("--experiment-id",default="hector-asi-qwen15-c4-v1");p.add_argument("--epochs",type=int,default=2);p.add_argument("--max-length",type=int,default=128)
 p.add_argument("--lr",type=float,default=1.5e-5);p.add_argument("--seed",type=int,default=40435);p.add_argument("--max-new-tokens",type=int,default=48)
 return p.parse_args()
def sha(p):
 h=hashlib.sha256()
 with open(p,"rb") as f:
  for c in iter(lambda:f.read(1<<20),b""):h.update(c)
 return h.hexdigest()
def norm(s):
 s=unicodedata.normalize("NFKD",s.lower());return " ".join("".join(c for c in s if not unicodedata.combining(c)).split())
def read(paths):
 rows=[]
 for p in paths:rows += [json.loads(x) for x in Path(p).read_text().splitlines() if x.strip()]
 if not rows:raise ValueError("empty dataset")
 for r in rows:
  v=r.get("verification",{})
  if v.get("verified") is not True or v.get("source") not in {"author-generated",None} or v.get("license") not in {"Apache-2.0-compatible",None}:raise ValueError(f"bad provenance {r.get('id')}")
  roles=[m.get("role") for m in r.get("messages",[])]
  if roles[-1:]!=["assistant"] or "user" not in roles:raise ValueError(f"bad messages {r.get('id')}")
 ids=[r["id"] for r in rows];prompts=[norm(next(m["content"] for m in r["messages"] if m["role"]=="user")) for r in rows]
 if len(ids)!=len(set(ids)) or len(prompts)!=len(set(prompts)):raise ValueError("duplicates")
 return rows
def sig(rows):return {r["id"] for r in rows},{norm(next(m["content"] for m in r["messages"] if m["role"]=="user")) for r in rows}
def encode(tok,rows,n):
 out=[]
 for r in rows:
  prefix=tok.apply_chat_template(r["messages"][:-1],tokenize=False,add_generation_prompt=True)
  full=tok.apply_chat_template(r["messages"],tokenize=False,add_generation_prompt=False)
  plen=len(tok(prefix,add_special_tokens=False)["input_ids"])
  b=tok(full,return_tensors="pt",add_special_tokens=False,truncation=True,max_length=n);lab=b["input_ids"].clone();lab[:,:min(plen,lab.shape[1])]=-100
  if torch.all(lab==-100):raise ValueError(f"truncated assistant {r['id']}")
  b["labels"]=lab;out.append(b)
 return out
def loss(model,batches):
 model.eval();vals=[]
 with torch.no_grad():
  for b in batches:vals.append(float(model(**b).loss.detach().cpu()))
 return sum(vals)/len(vals)
def generate(model,tok,row,n):
 prompt=tok.apply_chat_template(row["messages"][:-1],tokenize=False,add_generation_prompt=True);x=tok(prompt,return_tensors="pt",add_special_tokens=False);t=time.perf_counter()
 with torch.no_grad():y=model.generate(**x,do_sample=False,max_new_tokens=n,pad_token_id=tok.eos_token_id,eos_token_id=tok.eos_token_id)
 z=y[0,x["input_ids"].shape[1]:];return tok.decode(z,skip_special_tokens=True).strip(),(time.perf_counter()-t)*1000,int(z.numel())
def score(row,text):
 n=norm(text);e=row.get("evaluation",{});missing=[]
 for group in e.get("required",[]):
  if not any(norm(x) in n for x in group):missing.append(group)
 bad=[norm(x) for x in e.get("forbidden",[]) if norm(x) in n]
 return {"passed":not missing and not bad,"missingRequired":missing,"forbiddenPresent":bad}
def behavior(model,tok,rows,n):
 cases=[]
 for r in rows:
  text,ms,tokens=generate(model,tok,r,n);cases.append({"id":r["id"],"category":r["verification"]["category"],"critical":bool(r.get("evaluation",{}).get("critical")),"response":text,"latencyMs":ms,"tokens":tokens,**score(r,text)})
 crit=[c for c in cases if c["critical"]]
 return {"passed":sum(c["passed"] for c in cases),"total":len(cases),"score":sum(c["passed"] for c in cases)/len(cases),"criticalPassed":sum(c["passed"] for c in crit),"criticalTotal":len(crit),"meanLatencyMs":sum(c["latencyMs"] for c in cases)/len(cases),"cases":cases}
def rss():return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
def base():
 m=AutoModelForCausalLM.from_pretrained(MODEL,revision=REV,torch_dtype=torch.float32,low_cpu_mem_usage=True);m.config.use_cache=False;return m
def main():
 a=args();set_seed(a.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1)
 bd=Path(a.baseline_adapter);bw=bd/"adapter_model.safetensors"
 if sha(bw)!=BASE_SHA or bw.stat().st_size!=BASE_BYTES:raise RuntimeError("baseline mismatch")
 tr,va,te=read(a.train_files),read(a.validation_files),read(a.test_files);ss=[sig(x) for x in (tr,va,te)]
 for i in range(3):
  for j in range(i+1,3):
   if ss[i][0]&ss[j][0] or ss[i][1]&ss[j][1]:raise ValueError("split contamination")
 root=Path(a.output_dir);best=root/"best-adapter";final=root/"adapter";root.mkdir(parents=True,exist_ok=True);started=time.time()
 tok=AutoTokenizer.from_pretrained(bd,use_fast=True);tok.pad_token=tok.pad_token or tok.eos_token
 tb,vb,eb=encode(tok,tr,a.max_length),encode(tok,va,a.max_length),encode(tok,te,a.max_length)
 b=base();old=PeftModel.from_pretrained(b,bd,is_trainable=False);old_val=loss(old,vb);old_test=loss(old,eb);old_beh=behavior(old,tok,te,a.max_new_tokens);del old,b;gc.collect()
 b=base();m=PeftModel.from_pretrained(b,bd,is_trainable=True);pars=[p for p in m.parameters() if p.requires_grad];opt=AdamW(pars,lr=a.lr,betas=(.9,.999),weight_decay=.01,foreach=False)
 hist=[];best_val=float("inf");best_epoch=0
 for epoch in range(1,a.epochs+1):
  m.train();ls=[]
  for batch in tb:
   opt.zero_grad(set_to_none=True);z=m(**batch).loss
   if not torch.isfinite(z):raise RuntimeError("non-finite loss")
   z.backward();torch.nn.utils.clip_grad_norm_(pars,1.0);opt.step();ls.append(float(z.detach().cpu()))
  v=loss(m,vb);hist.append({"epoch":epoch,"meanTrainLoss":sum(ls)/len(ls),"validationLoss":v,"peakRssMb":rss()})
  if v<best_val:best_val=v;best_epoch=epoch;m.save_pretrained(best,safe_serialization=True);tok.save_pretrained(best)
 del m,b,opt,pars;gc.collect()
 b=base();m=PeftModel.from_pretrained(b,best,is_trainable=False);cand_test=loss(m,eb);cand_beh=behavior(m,tok,te,a.max_new_tokens)
 l2=math.sqrt(sum(float(torch.sum(p.detach().cpu()**2)) for n,p in m.named_parameters() if "lora_B" in n));m.save_pretrained(final,safe_serialization=True);tok.save_pretrained(final);w=final/"adapter_model.safetensors"
 loss_ratio=cand_test/old_test;lat_ratio=cand_beh["meanLatencyMs"]/old_beh["meanLatencyMs"];eligible=cand_beh["score"]>old_beh["score"] and cand_beh["criticalPassed"]==cand_beh["criticalTotal"] and cand_beh["criticalPassed"]>=old_beh["criticalPassed"] and loss_ratio<=1.02 and lat_ratio<=1.25
 ds={"trainPaths":a.train_files,"validationPaths":a.validation_files,"testPaths":a.test_files,"trainSha256":{p:sha(p) for p in a.train_files},"validationSha256":{p:sha(p) for p in a.validation_files},"testSha256":{p:sha(p) for p in a.test_files},"trainExamples":len(tr),"validationExamples":len(va),"testExamples":len(te),"crossSplitOverlap":0,"privateUserData":False,"license":"author-generated Apache-2.0-compatible"}
 metrics={"schemaVersion":"1.0.0","experimentId":a.experiment_id,"status":"candidate-weights-generated","eligibleForChampion":eligible,"baseModel":{"repository":MODEL,"revision":REV,"license":"Apache-2.0"},"baseline":{"runtimeId":"hector-asi-qwen15-v41","adapterSha256":BASE_SHA,"adapterBytes":BASE_BYTES,"validationLoss":old_val,"hiddenTestLoss":old_test,"behavioral":old_beh},"method":"continued LoRA SFT from v41 with assistant-response-only loss and validation checkpointing","dataset":ds,"hyperparameters":{"epochs":a.epochs,"bestEpoch":best_epoch,"maxLength":a.max_length,"maxNewTokens":a.max_new_tokens,"learningRate":a.lr,"optimizer":"AdamW","seed":a.seed,"lossMasking":"assistant-response-only"},"candidate":{"bestValidationLoss":best_val,"hiddenTestLoss":cand_test,"hiddenLossRatioVsV41":loss_ratio,"behavioral":cand_beh,"latencyRatioVsV41":lat_ratio,"parameterL2":l2,"weightsGenerated":True,"adapterBytes":w.stat().st_size,"adapterSha256":sha(w),"history":hist},"gates":{"behavioralImprovement":cand_beh["score"]>old_beh["score"],"criticalPerfect":cand_beh["criticalPassed"]==cand_beh["criticalTotal"],"noCriticalRegression":cand_beh["criticalPassed"]>=old_beh["criticalPassed"],"hiddenLossWithin2Percent":loss_ratio<=1.02,"latencyWithin25Percent":lat_ratio<=1.25,"eligibleForChampion":eligible},"runtime":{"seconds":time.time()-started,"peakRssMb":rss(),"python":platform.python_version(),"torch":torch.__version__,"hardware":platform.platform(),"githubSha":os.getenv("GITHUB_SHA"),"githubRunId":os.getenv("GITHUB_RUN_ID")},"rollback":"Keep hector-asi-qwen15-v41 active unless every gate passes."}
 (root/"metrics.json").write_text(json.dumps(metrics,indent=2,sort_keys=True,ensure_ascii=False)+"\n");files=sorted(p for p in root.rglob("*") if p.is_file());(root/"SHA256SUMS").write_text("".join(f"{sha(p)}  {p.relative_to(root)}\n" for p in files));(root/"run-manifest.json").write_text(json.dumps({"experimentId":a.experiment_id,"baselineArtifactId":8560331055,"baselineAdapterSha256":BASE_SHA,"files":{str(p.relative_to(root)):sha(p) for p in files},"rollback":metrics["rollback"]},indent=2,sort_keys=True)+"\n");print(json.dumps(metrics,indent=2,sort_keys=True,ensure_ascii=False))
if __name__=="__main__":main()
