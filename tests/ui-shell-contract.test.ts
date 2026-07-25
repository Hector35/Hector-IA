import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const main=read('src/main.tsx');
const serviceWorker=read('public/sw.js');

describe('interfaz eliminada',()=>{
  it('no monta ninguna aplicación ni componente visible',()=>{
    expect(main).not.toContain('HectorASIEvolutionApp');
    expect(main).not.toContain('TrainingOverlay');
    expect(main).not.toContain("import './hector-reboot.css'");
    expect(main).not.toContain('ReactDOM.createRoot');
    expect(main).toContain('root.replaceChildren()');
  });

  it('deja un lienzo negro vacío y fuera del árbol accesible',()=>{
    expect(main).toContain("document.documentElement.style.background='#000'");
    expect(main).toContain("root.setAttribute('aria-hidden','true')");
    expect(main).toContain("root.style.position='fixed'");
    expect(main).toContain("root.style.inset='0'");
  });

  it('invalida el shell anterior almacenado por la PWA',()=>{
    expect(serviceWorker).toContain("const CACHE='hector-empty-shell-v4'");
    expect(serviceWorker).toContain("fetch(request,{cache:'no-store'})");
  });
});
