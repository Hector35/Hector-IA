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
   m.created_at message_created_at
  FROM conversations c
  LEFT JOIN messages m ON m.conversation_id=c.id
  WHERE c.user_id=?
  ORDER BY c.created_at ASC,m.created_at ASC
 `).bind(userId).all()).results as any[];
 const byId=new Map<string,any>();
 for(const row of rows){
  let conversation=byId.get(row.conversation_id);
  if(!conversation){
   conversation={
    id:row.conversation_id,
    title:row.title,
    createdAt:row.conversation_created_at,
    updatedAt:row.conversation_updated_at,
    internal:Boolean(row.is_internal),
    messages:[] as any[]
   };
   byId.set(row.conversation_id,conversation);
  }
  if(row.message_id)conversation.messages.push({
   id:row.message_id,
   role:row.role,
   content:row.content,
   createdAt:row.message_created_at
  });
 }
 const payload={
  format:'hector-os-chat-export',
  version:1,
  exportedAt:new Date().toISOString(),
  conversations:[...byId.values()]
 };
 const day=new Date().toISOString().slice(0,10);
 return c.body(JSON.stringify(payload,null,2),200,{
  'Content-Type':'application/json; charset=utf-8',
  'Content-Disposition':`attachment; filename="hector-os-chats-${day}.json"`,
  'Cache-Control':'no-store'
 });
});

conversations.get('/:id/messages',async c=>{
 const allowed=await c.env.DB.prepare('SELECT id FROM conversations WHERE id=? AND user_id=? AND COALESCE(is_internal,0)=0').bind(c.req.param('id'),c.get('userId')).first();
 if(!allowed)return c.json({error:'Conversación no encontrada'},404);
 const items=(await c.env.DB.prepare('SELECT id,role,content,created_at FROM messages WHERE conversation_id=? ORDER BY created_at').bind(c.req.param('id')).all()).results;
 return c.json({items});
});
