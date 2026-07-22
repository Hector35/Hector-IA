import {describe,expect,it} from 'vitest';
import {conversationMatches,normalizeConversationText} from './chat-history-search-ui';

describe('búsqueda de conversaciones',()=>{
 it('ignora acentos y mayúsculas',()=>{expect(conversationMatches('Programación Héctor OS','programacion')).toBe(true);});
 it('filtra coincidencias parciales',()=>{expect(conversationMatches('Plan semanal de trabajo','semanal')).toBe(true);expect(conversationMatches('Plan semanal de trabajo','archivos')).toBe(false);});
 it('muestra todo con consulta vacía',()=>{expect(conversationMatches('Cualquier conversación','   ')).toBe(true);});
 it('normaliza texto',()=>{expect(normalizeConversationText('  MÉTRICAS  ')).toBe('metricas');});
});
