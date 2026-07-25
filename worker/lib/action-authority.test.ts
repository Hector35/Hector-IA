import {describe,expect,it} from 'vitest';
import {ACTION_AUTHORITY_MANIFEST,approveActionPreview,createActionPreview,verifyActionPreview} from './action-authority';

const now=new Date('2026-07-25T19:10:00.000Z');

describe('action authority contract',()=>{
 it('creates a bounded, owner-bound and non-executing preview',async()=>{
  const preview=await createActionPreview('owner-1',{action:'update-record',target:'project/alpha/task/7',summary:'Cambiar estado de pendiente a completado',fields:{status:'completed'},risk:'medium',reversible:true,rollback:'Restaurar status=pending',estimatedCost:0,maximumCost:0,currency:'MXN',maximumRequests:1,expiresInSeconds:300},now);
  expect(preview).toMatchObject({ownerId:'owner-1',action:'update-record',target:'project/alpha/task/7',currency:'MXN',maximumRequests:1,executable:false,sideEffects:'none'});
  expect(preview.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(preview.approvalPhrase).toMatch(/^APROBAR [A-F0-9]{8}$/);
  await expect(verifyActionPreview(preview,'owner-1',new Date('2026-07-25T19:11:00.000Z'))).resolves.toBe(true);
 });

 it('requires the exact phrase and emits only a non-execution receipt',async()=>{
  const preview=await createActionPreview('owner-1',{action:'send-message',target:'contact:42',summary:'Enviar seguimiento revisado',risk:'low',reversible:false,estimatedCost:0,maximumCost:0,maximumRequests:1},now);
  await expect(approveActionPreview(preview,'owner-1','aprobar',now)).rejects.toThrow(/coincidir exactamente/);
  const receipt=await approveActionPreview(preview,'owner-1',preview.approvalPhrase,now);
  expect(receipt).toMatchObject({status:'approved-not-executed',executionEnabled:false,sideEffects:'none',ownerId:'owner-1',previewDigest:preview.digest});
 });

 it('fails closed for owner changes, tampering, expiry and irreversible high risk',async()=>{
  const preview=await createActionPreview('owner-1',{action:'update-record',target:'record:1',summary:'Actualizar un campo',risk:'medium',reversible:true,rollback:'Restaurar el valor anterior'},now);
  await expect(verifyActionPreview(preview,'owner-2',now)).rejects.toThrow(/otro propietario/);
  await expect(verifyActionPreview({...preview,target:'record:2'},'owner-1',now)).rejects.toThrow(/modificada/);
  await expect(verifyActionPreview(preview,'owner-1',new Date('2026-07-25T20:00:00.000Z'))).rejects.toThrow(/expiró/);
  await expect(createActionPreview('owner-1',{action:'delete-account',target:'account:1',summary:'Eliminar definitivamente',risk:'high',reversible:false},now)).rejects.toThrow(/permanecen denegadas/);
 });

 it('keeps all write executors disabled by default',()=>{
  expect(ACTION_AUTHORITY_MANIFEST).toMatchObject({defaultDecision:'deny',executorEnabled:false,writeToolsEnabled:[],exactApprovalPhraseRequired:true,ownerBindingRequired:true,costCeilingRequired:true,expirationRequired:true,revocationLedgerImplemented:false,executionReceiptImplemented:false});
 });
});
