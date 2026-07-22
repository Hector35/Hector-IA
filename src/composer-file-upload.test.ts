import {describe,expect,it} from 'vitest';
import {uploadedFileMessage} from './composer-file-upload';

describe('uploadedFileMessage',()=>{
 it('confirma el nombre exacto del archivo cargado',()=>{
  expect(uploadedFileMessage('reporte julio.pdf')).toBe('Archivo subido: reporte julio.pdf');
 });
});
