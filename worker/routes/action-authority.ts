import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {ACTION_AUTHORITY_MANIFEST,approveActionPreview,createActionPreview,type ActionPreview} from '../lib/action-authority';

export const actionAuthority=new Hono<{Bindings:Bindings;Variables:Variables}>();
actionAuthority.use('*',requireAuth);

const fieldValue=z.union([z.string().max(500),z.number().finite(),z.boolean(),z.null()]);
const previewInput=z.object({
 action:z.string().trim().min(1).max(80),
 target:z.string().trim().min(1).max(300),
 summary:z.string().trim().min(1).max(800),
 fields:z.record(z.string().max(80),fieldValue).optional(),
 risk:z.enum(['low','medium','high']),
 reversible:z.boolean(),
 rollback:z.string().trim().max(800).optional(),
 estimatedCost:z.number().min(0).max(1_000_000).optional(),
 maximumCost:z.number().min(0).max(1_000_000).optional(),
 currency:z.enum(['MXN','USD']).optional(),
 maximumRequests:z.number().int().min(1).max(ACTION_AUTHORITY_MANIFEST.maximumRequestsPerGrant).optional(),
 expiresInSeconds:z.number().int().min(30).max(ACTION_AUTHORITY_MANIFEST.maximumPreviewLifetimeSeconds).optional()
});
const previewSchema=z.object({schemaVersion:z.literal(1),id:z.string().uuid(),ownerId:z.string(),action:z.string(),target:z.string(),summary:z.string(),fields:z.record(z.string(),fieldValue),risk:z.enum(['low','medium','high']),reversible:z.boolean(),rollback:z.string().nullable(),estimatedCost:z.number(),maximumCost:z.number(),currency:z.enum(['MXN','USD']),maximumRequests:z.number().int(),createdAt:z.string().datetime(),expiresAt:z.string().datetime(),digest:z.string().regex(/^[a-f0-9]{64}$/),approvalPhrase:z.string().regex(/^APROBAR [A-F0-9]{8}$/),executable:z.literal(false),sideEffects:z.literal('none')});

actionAuthority.get('/status',c=>c.json({manifest:ACTION_AUTHORITY_MANIFEST,availableActions:[],executionEnabled:false,notice:'El sistema sólo genera vistas previas y recibos de consentimiento. No existe ningún ejecutor de escritura habilitado.'}));

actionAuthority.post('/preview',async c=>{
 const parsed=previewInput.safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Vista previa inválida',details:parsed.error.flatten()},400);
 try{return c.json({preview:await createActionPreview(c.get('userId'),parsed.data),executionEnabled:false,sideEffects:'none'});}
 catch(error){return c.json({error:error instanceof Error?error.message:'No se pudo crear la vista previa'},400);}
});

actionAuthority.post('/approve',async c=>{
 const parsed=z.object({preview:previewSchema,phrase:z.string().max(80)}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Aprobación inválida',details:parsed.error.flatten()},400);
 try{
  const receipt=await approveActionPreview(parsed.data.preview as ActionPreview,c.get('userId'),parsed.data.phrase);
  return c.json({receipt,executed:false,notice:'Consentimiento registrado en el recibo de respuesta, pero no se ejecutó ninguna escritura porque los ejecutores permanecen deshabilitados.'});
 }catch(error){return c.json({error:error instanceof Error?error.message:'No se pudo aprobar la vista previa'},403);}
});
