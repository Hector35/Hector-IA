import {describe,expect,it} from 'vitest';
import {budgetNotification,dedupeOperationalNotifications,qualityNotification,workNotification} from './operational-notifications';

describe('operational notifications',()=>{
 it('prioriza severidad y deduplica por clave',()=>{const items=dedupeOperationalNotifications([
  {key:'x',source:'work',severity:'warning',title:'a',message:'a'},
  {key:'x',source:'work',severity:'critical',title:'b',message:'b'},
  {key:'y',source:'budget',severity:'info',title:'c',message:'c'}
 ]);expect(items).toHaveLength(2);expect(items[0].severity).toBe('critical');expect(items[0].title).toBe('b');});
 it('crea avisos de presupuesto solo al superar umbral',()=>{expect(budgetNotification({dailyPercent:40,monthlyPercent:30,warnPercent:80,state:'ok'})).toBeNull();expect(budgetNotification({dailyPercent:82,monthlyPercent:30,warnPercent:80,state:'warning'})?.severity).toBe('warning');expect(budgetNotification({dailyPercent:101,monthlyPercent:30,warnPercent:80,state:'exceeded'})?.severity).toBe('critical');});
 it('normaliza alertas de calidad sin contenido privado',()=>{const item=qualityNotification({task:'ingeniería',reason:'aceptación baja',sample_count:7});expect(item.key).toBe('quality:ingeniería');expect(item.metadata).toEqual({samples:7});});
 it('trata trabajos bloqueados como críticos',()=>{expect(workNotification({id:'1',status:'blocked',last_error:'Runner no disponible'}).severity).toBe('critical');});
});
