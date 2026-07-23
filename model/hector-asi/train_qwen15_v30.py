from __future__ import annotations
import argparse,gc,hashlib,json,math,os,platform,resource,time
from pathlib import Path
import torch
from peft import LoraConfig,TaskType,get_peft_model
from torch.optim import AdamW
from transformers import AutoModelForCausalLM,AutoTokenizer,set_seed

MODEL='Qwen/Qwen2.5-1.5B-Instruct'
REVISION='989aa7980e4cf806f80c7fef2b1adb7bc71aa306'
TARGETS=['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj']

def cli():
 p=argparse.ArgumentParser()
 p.add_argument('--output-dir',required=True)
 p.add_argument('--train-files',nargs='+',required=True)
 p.add_argument('--validation-files',nargs='+',required=True)
 p.add_argument('--experiment-id',default='hector-asi-qwen15-v30')
 p.add_argument('--epochs',type=int,default=2)
 p.add_argument('--max-length',type=int,default=112)
 p.add_argument('--lr',type=float,default=3e-5)
 p.add_argument('--seed',type=int,default=35)
 return p.parse_args()

def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
 return h.hexdigest()

def read(paths):
 rows=[]
 for path in paths:rows += [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
 if not rows or any(row.get('verification',{}).get('verified') is not True for row in rows):raise ValueError('unverified data')
 ids=[row['id'] for row in rows]
 prompts=[' '.join(message.get('content','').lower().split()) for row in rows for message in row.get('messages',[]) if message.get('role')=='user']
 if len(ids)!=len(set(ids)) or len(prompts)!=len(set(prompts)):raise ValueError('duplicates')
 return rows

def encode(tokenizer,rows,max_length):
 batches=[]
 for row in rows:
  text=tokenizer.apply_chat_template(row['messages'],tokenize=False,add_generation_prompt=False)
  batch=tokenizer(text,return_tensors='pt',truncation=True,max_length=max_length)
  batch['labels']=batch['input_ids'].clone()
  batches.append(batch)
 return batches

def avg_loss(model,batches):
 model.eval();values=[]
 with torch.no_grad():
  for batch in batches:values.append(float(model(**batch).loss.detach().cpu()))
 return sum(values)/len(values)

def parameter_delta(parameters,before):
 total=torch.zeros((),dtype=torch.float64)
 with torch.no_grad():
  for parameter,initial in zip(parameters,before):
   difference=parameter.detach().float()-initial.float()
   total += torch.sum(difference.double()*difference.double())
 return float(torch.sqrt(total))

def main():
 args=cli();set_seed(args.seed);torch.use_deterministic_algorithms(True);torch.set_num_threads(1);torch.set_num_interop_threads(1)
 train_rows,validation_rows=read(args.train_files),read(args.validation_files)
 if {row['id'] for row in train_rows}&{row['id'] for row in validation_rows}:raise ValueError('split contamination')
 root=Path(args.output_dir);adapter=root/'adapter';root.mkdir(parents=True,exist_ok=True);started=time.time()
 tokenizer=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,use_fast=True);tokenizer.pad_token=tokenizer.pad_token or tokenizer.eos_token
 base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True);base.config.use_cache=False
 train_batches,validation_batches=encode(tokenizer,train_rows,args.max_length),encode(tokenizer,validation_rows,args.max_length)
 base_loss=avg_loss(base,validation_batches);gc.collect()
 config=LoraConfig(r=16,lora_alpha=32,lora_dropout=.05,bias='none',task_type=TaskType.CAUSAL_LM,target_modules=TARGETS,use_rslora=True)
 model=get_peft_model(base,config)
 parameters=[parameter for parameter in model.parameters() if parameter.requires_grad]
 before=[parameter.detach().to(dtype=torch.float16).clone() for parameter in parameters]
 optimizer=AdamW(parameters,lr=args.lr,weight_decay=.01,foreach=False)
 losses=[];model.train()
 for _ in range(args.epochs):
  for batch in train_batches:
   optimizer.zero_grad(set_to_none=True);loss=model(**batch).loss
   if not torch.isfinite(loss):raise RuntimeError('non-finite loss')
   loss.backward();torch.nn.utils.clip_grad_norm_(parameters,1.0);optimizer.step();losses.append(float(loss.detach().cpu()))
 delta=parameter_delta(parameters,before);candidate_loss=avg_loss(model,validation_batches)
 if not math.isfinite(delta) or delta<=0:raise RuntimeError('weights unchanged')
 adapter.mkdir(parents=True,exist_ok=True);model.save_pretrained(adapter,safe_serialization=True);tokenizer.save_pretrained(adapter)
 weights=adapter/'adapter_model.safetensors'
 dataset={'trainPaths':args.train_files,'trainSha256':{path:sha(path) for path in args.train_files},'trainExamples':len(train_rows),'validationPaths':args.validation_files,'validationSha256':{path:sha(path) for path in args.validation_files},'validationExamples':len(validation_rows),'privateUserData':False}
 results={'steps':len(losses),'firstTrainLoss':losses[0],'finalTrainLoss':losses[-1],'baseValidationLoss':base_loss,'candidateValidationLoss':candidate_loss,'relativeValidationImprovement':(base_loss-candidate_loss)/base_loss,'parameterDeltaL2':delta,'trainableParameters':sum(parameter.numel() for parameter in parameters),'weightsGenerated':True,'adapterBytes':weights.stat().st_size,'adapterSha256':sha(weights)}
 metrics={'schemaVersion':'1.0.0','experimentId':args.experiment_id,'status':'experimental-weights-generated','eligibleForChampion':False,'baseModel':{'repository':MODEL,'revision':REVISION,'license':'Apache-2.0'},'method':'rsLoRA SFT all-linear memory-safe retry','dataset':dataset,'hyperparameters':{'epochs':args.epochs,'maxLength':args.max_length,'learningRate':args.lr,'weightDecay':.01,'seed':args.seed,'loraRank':16,'loraAlpha':32,'loraDropout':.05,'useRsLora':True,'targetModules':TARGETS,'optimizerForeach':False,'initialSnapshotDtype':'float16'},'results':results,'runtime':{'seconds':time.time()-started,'python':platform.python_version(),'torch':torch.__version__,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'githubSha':os.getenv('GITHUB_SHA'),'githubRunId':os.getenv('GITHUB_RUN_ID')}}
 (root/'metrics.json').write_text(json.dumps(metrics,indent=2,sort_keys=True)+'\n')
 files=sorted(path for path in root.rglob('*') if path.is_file())
 (root/'SHA256SUMS').write_text(''.join(f'{sha(path)}  {path.relative_to(root)}\n' for path in files))
 (root/'run-manifest.json').write_text(json.dumps({'experimentId':args.experiment_id,'files':{str(path.relative_to(root)):sha(path) for path in files},'rollback':'Do not load or delete adapter; active v15 remains unchanged.'},indent=2,sort_keys=True)+'\n')
 print(json.dumps(metrics,indent=2,sort_keys=True))

if __name__=='__main__':main()
