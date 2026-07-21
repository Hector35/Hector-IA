import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';

export const conversations=new Hono<{Bindings:Bindings;Variables:Variables}>();
conversations.use('*',requireAuth);

conversations.get('/',async c=>{
 const items=(await c.env.DB.prepare("SELECT id,title,updated_at FROM conversations WHERE user_id=? AND COALESCE(is_internal,0)=0 ORDER BY updated_at DESC LIMIT 100").bind(c.get('userId')).all()).results;
 return c.json({items});
});

conversations.get('/export',async c=>{
 const userId=c.get('userId');
 const rows=(await c.env.DB.prepare(`
  SELECT
   c.id conversation_id,
   c.title,
   c.created_at conversation_created_at,
   c.updated_at conversation_updated_at,
   COALESCE(c.is_internal,0) is_internal,
   m.id message_id,
   m.role,
   m.content,
   m.provider,
   m.model,
   m.model_tier,
   m.task,
   m.created_at message_created_at,
   rf.rating feedback_rating,
   rf.reason feedback_reason
  FROM conversations c
  LEFT JOIN messages m ON m.conversation_id=c.id
  LEFT JOIN response_feedback rf ON rf.message_id=m.id AND rf.user_id=c.user_id
  WHERE c.user_id=?
  ORDER BY c.created_at ASC,m.created_at ASC
 `).bind(userId).all()).results as any[];
 const byId=new Map<string,any>();
 for(const row of rows){
  let conversation=byId.get(row.conversation_id);
  if(!conversation){
   conversation={id:row.conversation_id,title:row.title,createdAt:row.conversation_created_at,updatedAt:row.conversation_updated_at,internal:Boolean(row.is_internal),messages:[] as any[]};
   byId.set(row.conversation_id,conversation);
  }
  if(row.message_id)conversation.messages.push({
   id:row.message_id,role:row.role,content:row.content,provider:row.provider,model:row.model,modelTier:row.model_tier,task:row.task,feedback:row.feedback_rating===1?'up':row.feedback_rating===-1?'down':null,feedbackReason:row.feedback_reason,createdAt:row.message_created_at
  });
 }
 const payload={format:'hector-os-chat-export',version:2,exportedAt:new Date().toISOString(),conversations:[...byId.values()]};
 const day=new Date().toISOString().slice(0,10);
 return c.body(JSON.stringify(payload,null,2),200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="hector-os-chats-${day}.json"`,'Cache-Control':'no-store'});
});

conversations.get('/:id/messages',async c=>{
 const userId=c.get('userId'),conversationId=c.req.param('id');
 const allowed=await c.env.DB.prepare('SELECT id FROM conversations WHERE id=? AND user_id=? AND COALESCE(is_internal,0)=0').bind(conversationId,userId).first();
 if(!allowed)return c.json({error:'Conversación no encontrada'},404);
 const items=(await c.env.DB.prepare(`SELECT m.id,m.role,m.content,m.provider,m.model,m.model_tier AS modelTier,m.task,m.created_at AS createdAt,
  CASE rf.rating WHEN 1 THEN 'up' WHEN -1 THEN 'down' END feedback,rf.reason AS feedbackReason
  FROM messages m LEFT JOIN response_feedback rf ON rf.message_id=m.id AND rf.user_id=?
  WHERE m.conversation_id=? ORDER BY m.created_at`).bind(userId,conversationId).all()).results;
 return c.json({items});
});
