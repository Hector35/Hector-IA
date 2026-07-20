import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';

export const conversations=new Hono<{Bindings:Bindings;Variables:Variables}>();
conversations.use('*',requireAuth);

conversations.get('/',async c=>{
 const items=(await c.env.DB.prepare("SELECT id,title,updated_at FROM conversations WHERE user_id=? AND COALESCE(is_internal,0)=0 ORDER BY updated_at DESC LIMIT 100").bind(c.get('userId')).all()).results;
 return c.json({items});
});

conversations.get('/:id/messages',async c=>{
 const allowed=await c.env.DB.prepare('SELECT id FROM conversations WHERE id=? AND user_id=? AND COALESCE(is_internal,0)=0').bind(c.req.param('id'),c.get('userId')).first();
 if(!allowed)return c.json({error:'Conversación no encontrada'},404);
 const items=(await c.env.DB.prepare('SELECT id,role,content,created_at FROM messages WHERE conversation_id=? ORDER BY created_at').bind(c.req.param('id')).all()).results;
 return c.json({items});
});
