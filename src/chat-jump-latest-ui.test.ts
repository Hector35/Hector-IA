import {describe,expect,it} from 'vitest';
import {shouldShowJump} from './chat-jump-latest-ui';

describe('chat jump latest',()=>{
 it('se oculta cuando el usuario está cerca del final',()=>{expect(shouldShowJump(760,600,1440)).toBe(false);});
 it('aparece cuando quedan mensajes fuera de la vista',()=>{expect(shouldShowJump(300,600,1440)).toBe(true);});
 it('respeta un umbral táctil estable',()=>{expect(shouldShowJump(700,600,1440,150)).toBe(false);expect(shouldShowJump(680,600,1440,150)).toBe(true);});
});
