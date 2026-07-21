import {describe,expect,it} from 'vitest';
import {parseFeedbackCommand} from './response-feedback';

describe('parseFeedbackCommand',()=>{
 it('reconoce aprobación explícita',()=>{expect(parseFeedbackCommand('Esa respuesta me sirvió')).toEqual({rating:'up',reason:'other',retry:false});});
 it('clasifica una respuesta incorrecta y un reintento',()=>{expect(parseFeedbackCommand('Tu respuesta anterior estuvo mal, corrígela')).toEqual({rating:'down',reason:'incorrect',retry:true});});
 it('reconoce longitud y falta de personalización',()=>{expect(parseFeedbackCommand('Esa respuesta fue demasiado larga')).toMatchObject({rating:'down',reason:'too_long'});expect(parseFeedbackCommand('Esa respuesta fue genérica y no usó mi contexto')).toMatchObject({rating:'down',reason:'not_personalized'});});
 it('ignora comentarios que no apuntan a la respuesta del asistente',()=>{expect(parseFeedbackCommand('La respuesta del proveedor fue incorrecta')).toBeNull();expect(parseFeedbackCommand('Explícame qué significa una respuesta incompleta')).toBeNull();});
});
