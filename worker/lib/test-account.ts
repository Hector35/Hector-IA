export const TEST_ACCOUNT_EMAIL='chatgpt-test@hectoros.invalid';
export const TEST_ACCOUNT_NAME='ChatGPT · Pruebas';

export type AccountRole='owner'|'test'|'other';

export function classifyAccountRole(currentUserId:string,currentEmail:string|null|undefined,ownerUserId:string|null|undefined):AccountRole{
 if(ownerUserId&&currentUserId===ownerUserId)return'owner';
 if((currentEmail||'').trim().toLowerCase()===TEST_ACCOUNT_EMAIL)return'test';
 return'other';
}

export function canProvisionTestAccount(role:AccountRole){return role==='owner';}
export function isPersistentTestAccount(email:string|null|undefined){return (email||'').trim().toLowerCase()===TEST_ACCOUNT_EMAIL;}
