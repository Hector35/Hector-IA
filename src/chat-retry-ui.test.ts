import {describe,expect,it} from 'vitest';
import {isFailedAssistantMessage,previousUserMessage} from './chat-retry-ui';

describe('chat retry',()=>{
 it('detecta errores y detenciones visibles',()=>{expect(isFailedAssistantMessage('Error: servicio no disponible')).toBe(true);expect(isFailedAssistantMessage('Respuesta detenida. Puedes continuar.')).toBe(true);expect(isFailedAssistantMessage('Resultado correcto')).toBe(false);});
 it('recupera la instrucción de usuario anterior',()=>{expect(previousUserMessage([{role:'user',content:'Primera'},{role:'assistant',content:'Ok'},{role:'user',content:'Corrige esto'},{role:'assistant',content:'Error: fallo'}],3)).toBe('Corrige esto');});
});
