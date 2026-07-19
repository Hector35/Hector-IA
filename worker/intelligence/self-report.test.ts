import {describe,expect,it} from 'vitest';
import {renderEvidenceSelfAnalysis} from './self-report';

describe('renderEvidenceSelfAnalysis',()=>{
  it('incluye versión, pruebas, evidencia y prompt corto',()=>{
    const text=renderEvidenceSelfAnalysis({
      score:80,
      grade:'B',
      strengths:['identidad'],
      gaps:['verificación'],
      tests:[
        {name:'identidad',passed:true,score:20,max:20,model:'gpt-test'},
        {name:'verificación',passed:false,score:0,max:20,error:'sin evidencia'}
      ],
      averageLatencyMs:123,
      prompt:'Corrige la verificación con pruebas reproducibles.'
    });
    expect(text).toContain('Héctor OS 2.5.0');
    expect(text).toContain('✓ **identidad**');
    expect(text).toContain('✗ **verificación**');
    expect(text).toContain('La introspección libre del modelo no cuenta como evidencia');
    expect(text).toContain('Prompt corto');
  });
});