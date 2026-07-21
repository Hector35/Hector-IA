import {describe,expect,it} from 'vitest';
import {SHELL_ACCESSIBILITY_CONTRACT} from './hector-shell-accessibility';

describe('premium shell accessibility contract',()=>{
 it('declara foco visible y objetivo táctil mínimo',()=>{expect(SHELL_ACCESSIBILITY_CONTRACT.focusVisible).toBe(true);expect(SHELL_ACCESSIBILITY_CONTRACT.minTouchTargetPx).toBe(44);});
 it('declara soporte de movimiento, contraste y colores forzados',()=>{expect(SHELL_ACCESSIBILITY_CONTRACT).toMatchObject({reducedMotion:true,highContrast:true,forcedColors:true});});
 it('declara navegación actual y estado vivo de pensamiento',()=>{expect(SHELL_ACCESSIBILITY_CONTRACT).toMatchObject({currentPage:true,liveThinkingStatus:true});});
});
