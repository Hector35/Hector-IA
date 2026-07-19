const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function sha256(value: string) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
export function randomToken(bytes = 32) { const data = crypto.getRandomValues(new Uint8Array(bytes)); return btoa(String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
export async function hashPassword(password: string, salt = randomToken(16)) { const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:encoder.encode(salt), iterations:210_000, hash:'SHA-256' }, key, 256); return { hash:hex(bits), salt }; }
export async function verifyPassword(password:string, salt:string, expected:string) { return (await hashPassword(password, salt)).hash === expected; }
