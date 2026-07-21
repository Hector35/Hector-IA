import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const css=readFileSync(new URL('./hector-shell-accessibility.css',import.meta.url),'utf8');
const source=readFileSync(new URL('./hector-shell-accessibility.ts',import.meta.url),'utf8');
const main=readFileSync(new URL('./main.tsx',import.meta.url),'utf8');

describe('premium shell accessibility contract',()=>{
 it('ofrece foco visible y objetivos táctiles mínimos',()=>{expect(css).toContain(':focus-visible');expect(css).toContain('min-height:44px');});
 it('respeta reducción de movimiento, contraste y colores forzados',()=>{expect(css).toContain('prefers-reduced-motion:reduce');expect(css).toContain('prefers-contrast:more');expect(css).toContain('forced-colors:active');});
 it('sincroniza navegación, paneles y estado de respuesta',()=>{expect(source).toContain("aria-current','page");expect(source).toContain("aria-label','Mensaje para Héctor OS");expect(source).toContain("role','status");expect(source).toContain("aria-live','polite");});
 it('monta la capa de semántica y estilos después del shell premium',()=>{expect(main).toContain("installHectorShellAccessibility();");expect(main).toContain("./hector-shell-accessibility.css");expect(main.indexOf('installHectorShellEnhancer();')).toBeLessThan(main.indexOf('installHectorShellAccessibility();'));});
});
