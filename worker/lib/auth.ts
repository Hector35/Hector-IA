import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Bindings, Variables } from '../types';
import { sha256 } from './crypto';
export async function requireAuth(c: Context<{Bindings:Bindings;Variables:Variables}>, next: Next) {
  const raw = getCookie(c, 'hector_session');
  if (!raw) return c.json({ error:'No autorizado' }, 401);
  const tokenHash = await sha256(raw);
  const row = await c.env.DB.prepare(`SELECT users.id, users.name FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at > datetime('now')`).bind(tokenHash).first<{id:string;name:string}>();
  if (!row) return c.json({ error:'Sesión expirada' }, 401);
  c.set('userId', row.id); c.set('userName', row.name); await next();
}
