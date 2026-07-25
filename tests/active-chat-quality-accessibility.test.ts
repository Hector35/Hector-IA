import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const main=read('src/main.tsx');
const activeApp=read('src/HectorChatApp.tsx');
const overlay=read('src/HectorQualityOverlay.tsx');
const css=read('src/hector-quality-overlay.css');
const audit=read('scripts/iphone-visual-audit.mjs');
const evidence=JSON.parse(read('model/hector-asi/active-ui-quality-evidence.json'));

describe('active chat quality and accessibility',()=>{
 it('mounts the quality cockpit beside the application actually used in production',()=>{
  expect(main).toContain("import {HectorChatApp} from './HectorChatApp'");
  expect(main).toContain('<HectorChatApp/>');
  expect(main).toContain('<HectorQualityOverlay/>');
  expect(main).toContain("import './hector-quality-overlay.css'");
  expect(activeApp).toContain('className="hcComposer"');
  expect(evidence).toMatchObject({entrypoint:'src/main.tsx',activeApplication:'src/HectorChatApp.tsx',qualityOverlay:'src/HectorQualityOverlay.tsx'});
 });
 it('provides an authenticated evidence dialog with keyboard and screen-reader semantics',()=>{
  expect(overlay).toContain('api.systemQuality()');
  expect(overlay).toContain('Saltar al chat principal');
  expect(overlay).toContain('role="dialog"');
  expect(overlay).toContain('aria-modal="true"');
  expect(overlay).toContain('role="status"');
  expect(overlay).toContain('aria-live="polite"');
  expect(overlay).toContain('role="progressbar"');
  expect(overlay).toContain("event.key==='Escape'");
  expect(overlay).toContain('focus({preventScroll:true})');
 });
 it('enforces mobile touch, motion and contrast evidence on the active surface',()=>{
  expect(css).toContain('min-height:48px');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  expect(css).toContain('@media(prefers-contrast:more)');
  expect(css).toContain('@media(forced-colors:active)');
  expect(audit).toContain('.hcComposer textarea');
  expect(evidence.accessibility).toMatchObject({minimumTouchTargetPx:48,reducedMotion:true,increasedContrast:true,forcedColors:true,automatedContractAudit:true,manualWcagAudit:false});
  expect(evidence.visualAudit).toMatchObject({iphoneSe:true,iphone13Pro:true,overflowChecks:true,keyboardFocusChecks:true});
 });
});
