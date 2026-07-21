import {Hono} from 'hono';
import {secureHeaders} from 'hono/secure-headers';
import type {Bindings,Variables} from './types';
import {auth} from './routes/auth';
import {api} from './routes/api';
import {agent} from './routes/agent';
import {intelligence} from './routes/intelligence';
import {systemInfo} from './routes/system';
import {control} from './routes/control';
import {generated} from './routes/generated';
import {selfImprove} from './routes/self-improve';
import {runner} from './routes/runner';
import {pwaRunnerStatus} from './routes/pwa-runner-status';
import {pwaFactory} from './routes/pwa-factory';
import {evidence} from './routes/evidence';
import {workEvidence} from './routes/work-evidence';
import {memoryStatus} from './routes/memory-status';
import {providerHealth} from './routes/provider-health';
import {schedules,processDueSchedules} from './routes/schedules';
import {delegations,processNextDelegation} from './routes/delegations';
import {projects,processProjectQueue} from './routes/projects';
import {projectGovernance} from './routes/project-governance';
import {conversations} from './routes/conversations';
import {chatAgents,processChatAgentRuns} from './routes/chat-agents';
import {respond,estimateCost} from './lib/openai';
import {buildPlan} from './agent/planner';
import {recordExperience} from './agent/learning';
import {canRetry,JOB_LEASE_SECONDS,retryDelaySeconds} from './lib/job-reliability';

const app=new Hono<{Bindings:Bindings;Variables:Variables}>();
app.use('*',secureHeaders({contentSecurityPolicy:{defaultSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'",'data:'],styleSrc:["'self'","'unsafe-inline'"]}}));
app.route('/control/v1',control);app.route('/generated',generated);app.route('/self-improve/v1',selfImprove);app.route('/runner/v1',runner);app.route('/runner/v1',pwaRunnerStatus);app.route('/evidence/v1',evidence);app.route('/api/auth',auth);app.route('/api/agent',agent);app.route('/api/intelligence',intelligence);app.route('/api/system',systemInfo);app.route('/api/delegations',delegations);app.route('/api/projects',projectGovernance);app.route('/api/projects',projects);app.route('/api/pwa-factory',pwaFactory);app.route('/api/conversations',conversations);app.route('/api/chat-agents',chatAgents);app.route('/api/work-evidence',workEvidence);app.route('/api/memory',memoryStatus);app.route('/api/provider-health',providerHealth);app.route('/api/schedules',schedules);app.route('/api',intelligence);app.route('/api',api);
app.get('/health',c=>c.json({ok:true,service:c.env.APP_NAME}));app.all('*',c=>c.env.ASSETS.fetch(c.req.raw));

async function event(env:Bindings,jobId:string,message:string,progress:number){await env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),jobId,message,progress).run();}
async function recoverExpiredLeases(env:Bindings){await env.DB.prepare(`UPDATE work_jobs SET status='queued',lease_token=NULL,lease_expires_at=NULL,next_retry_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status='working' AND kind!='programming' AND (lease_expires_at IS NULL OR lease_expires_at<=CURRENT_TIMESTAMP)`).run();}
async function claimNextJob(env:Bindings){const leaseToken=crypto.randomUUID();const job=await env.DB.prepare(`UPDATE work_jobs SET status='working',progress=10,attempt_count=attempt_count+1,lease_token=?,lease_expires_at=datetime('now',?),heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM work_jobs WHERE status='queued' AND kind!='programming' AND (next_retry_at IS NULL OR next_retry_at<=CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *`).bind(leaseToken,`+${JOB_LEASE_SECONDS} seconds`).first<any>();return job?{job,leaseToken}:null;}
async function processNext(env:Bindings){
 await recoverExpiredLeases();
}
