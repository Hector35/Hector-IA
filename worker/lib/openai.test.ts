import { describe,expect,it } from 'vitest';
import { classify,conversationInput,relevantMemories,routeModel } from './openai';
import type { Bindings } from '../types';

const env={
  OPENAI_MODEL:'gpt-5.6-terra',
  OPENAI_MODEL_FAST:'gpt-5.6-luna',
  OPENAI_MODEL_BALANCED:'gpt-5.6-terra',
  OPENAI_MODEL_REASONING:'gpt-5.6-sol'
} as Bindings;

describe('Héctor OS model routing benchmark',()=>{
  const routingCases=[
    ['hola','fast','consulta general',false],
    ['gracias','fast','consulta general',false],
    ['Resume este texto en una frase','fast','consulta general',false],
    ['Explícame cómo funciona un transformador','balanced','explicación técnica',false],
    ['Calcula mi saldo y presupuesto de la quincena','balanced','finanzas personales',false],
    ['Tengo dolor y taquicardia después de una dosis','balanced','salud y análisis de riesgo',false],
    ['Diseña e implementa una arquitectura completa en Cloudflare Workers, D1 y R2, compara riesgos y optimiza el despliegue.','deep','ingeniería de software',false],
    ['Audita este backend, encuentra fallas de seguridad y propón un plan completo de refactorización.','deep','ingeniería de software',false],
    ['Compara todas las opciones y diseña una estrategia de migración con supuestos, riesgos y pruebas.','deep','planificación y toma de decisiones',false],
    ['Busca el precio actual y verifica la versión disponible','balanced','consulta general',true],
    ['Busca noticias recientes','balanced','consulta general',true],
    ['¿Qué cambió hoy en OpenAI y GPT-5.6?','balanced','consulta general',true]
  ] as const;

  it.each(routingCases)('routes %s', (prompt,tier,task,needsWeb)=>{
    const route=routeModel(env,prompt,true);
    expect(route.tier).toBe(tier);
    expect(route.task).toBe(task);
    expect(route.needsWeb).toBe(needsWeb);
  });

  it('respects disabled web access even for current questions',()=>{
    expect(routeModel(env,'Busca noticias recientes',false).needsWeb).toBe(false);
  });

  it('uses GPT-5.6 models configured for each tier',()=>{
    expect(routeModel(env,'hola',true).model).toBe('gpt-5.6-luna');
    expect(routeModel(env,'Explícame cómo funciona un transformador',true).model).toBe('gpt-5.6-terra');
    const deep=routeModel(env,'Diseña e implementa una arquitectura completa en Cloudflare Workers, D1 y R2.',true);
    expect(deep.model).toBe('gpt-5.6-sol');
    expect(deep.reasoning).toBe('xhigh');
  });
});

describe('Héctor OS domain classification benchmark',()=>{
  const cases=[
    ['Corrige este workflow de GitHub Actions','ingeniería de software'],
    ['Explícame qué hace Codex con este repositorio','ingeniería de software'],
    ['Tengo el dedo frío y azul después de una cirugía','salud y análisis de riesgo'],
    ['Calcula cuánto puedo gastar por día hasta la quincena','finanzas personales'],
    ['Ayúdame a decidir entre dos trabajos y construir un plan','planificación y toma de decisiones'],
    ['Explica cómo emerge la química desde la física','explicación técnica'],
    ['¿Qué opinas de esta idea?','consulta general']
  ] as const;

  it.each(cases)('classifies %s', (prompt,expected)=>{
    expect(classify(prompt)).toBe(expected);
  });
});

describe('Héctor OS memory retrieval benchmark',()=>{
  const memories=[
    'Saldo BBVA registrado: 4,396.50 MXN.',
    'El usuario trabaja como camillero en el IMSS.',
    'El usuario prefiere explicaciones técnicas como ingeniero.',
    'La lesión fue en el dedo índice y tuvo reparación de tendón.',
    'El próximo pago esperado es el 28 de julio.',
    'El proyecto Héctor OS usa Cloudflare Workers, D1 y R2.'
  ];

  it('selects finance memory and excludes medical memory',()=>{
    const selected=relevantMemories('¿Cuánto dinero tengo en BBVA y cómo organizo mi saldo?',memories);
    expect(selected).toContain('Saldo BBVA registrado: 4,396.50 MXN.');
    expect(selected).not.toContain('La lesión fue en el dedo índice y tuvo reparación de tendón.');
  });

  it('selects medical memory and excludes finance memory',()=>{
    const selected=relevantMemories('¿Qué sabemos de la lesión del dedo y el tendón?',memories);
    expect(selected).toContain('La lesión fue en el dedo índice y tuvo reparación de tendón.');
    expect(selected).not.toContain('Saldo BBVA registrado: 4,396.50 MXN.');
  });

  it('selects project architecture memory',()=>{
    const selected=relevantMemories('¿Qué infraestructura usa Héctor OS?',memories);
    expect(selected[0]).toContain('Cloudflare Workers');
  });

  it('prioritizes exact numeric matches',()=>{
    const selected=relevantMemories('Revisa el saldo de 4,396.50',[
      'Saldo anterior: 1,000 MXN.',
      'Saldo BBVA registrado: 4,396.50 MXN.'
    ]);
    expect(selected[0]).toContain('4,396.50');
  });

  it('matches exact text consistently across accent variations',()=>{
    const selected=relevantMemories('configuracion de la version disponible',[
      'La configuración de la versión disponible está registrada.',
      'Dato secundario sobre configuración general.'
    ]);
    expect(selected[0]).toBe('La configuración de la versión disponible está registrada.');
  });

  it('returns no unrelated memories',()=>{
    expect(relevantMemories('¿Cuál es la capital de Japón?',memories)).toEqual([]);
  });

  it('limits memory context to eight items',()=>{
    const many=Array.from({length:20},(_,i)=>`Proyecto arquitectura Cloudflare número ${i}`);
    expect(relevantMemories('arquitectura Cloudflare proyecto',many)).toHaveLength(8);
  });
});

describe('Héctor OS contextual conversation assembly',()=>{
  it('does not duplicate the current user input when history already ends with it',()=>{
    const input='Continúa con Héctor OS';
    const result=conversationInput([
      {role:'assistant',content:'Listo.'},
      {role:'user',content:input}
    ],input);
    expect(result).toEqual([
      {role:'assistant',content:'Listo.'},
      {role:'user',content:input}
    ]);
  });

  it('appends a new input when the latest turn is different',()=>{
    expect(conversationInput([
      {role:'user',content:'Mensaje anterior'},
      {role:'assistant',content:'Respuesta anterior'}
    ],'Mensaje nuevo')).toEqual([
      {role:'user',content:'Mensaje anterior'},
      {role:'assistant',content:'Respuesta anterior'},
      {role:'user',content:'Mensaje nuevo'}
    ]);
  });

  it('keeps only the latest sixteen history turns before appending',()=>{
    const history=Array.from({length:20},(_,index)=>({
      role:index%2===0?'user' as const:'assistant' as const,
      content:`Turno ${index}`
    }));
    const result=conversationInput(history,'Turno nuevo');
    expect(result).toHaveLength(17);
    expect(result[0].content).toBe('Turno 4');
    expect(result.at(-1)).toEqual({role:'user',content:'Turno nuevo'});
  });
});
