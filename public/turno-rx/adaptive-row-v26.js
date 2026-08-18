import {formatPatientName} from '/turno-rx/name-format-v23.js?v=1';

const GIVEN_NAMES=new Set(`
ADRIAN ADRIANA ALAN ALBERTO ALEJANDRA ALEJANDRO ALFONSO ALFREDO ALICIA ANA ANDREA ANDRES ANGEL ANGELA ANTON ANTONIO ARTURO
BEATRIZ BENJAMIN BRENDA BRAYAN CARLOS CARMEN CATALINA CECILIA CESAR CHRISTIAN CLAUDIA CRISTIAN CRISTINA
DANIEL DANIELA DAVID DAYANA DIANA DIEGO EDGAR EDUARDO ELENA ELVA EMANUEL EMILIO ENRIQUE ERICK ERIKA ESMERALDA ESTEBAN ESTELA
FABIOLA FELIPE FERNANDA FERNANDO FRANCISCA FRANCISCO GABRIEL GABRIELA GERARDO GLORIA GRACIELA GUADALUPE
HECTOR HUGO ISABEL IVAN JESSICA JESUS JORGE JOSE JOSEFINA JUAN JULIANA JULIO KARLA LAURA LEONEL LETICIA LILIANA LORENA LUCIA LUIS LUZ
MANUEL MARCELA MARCO MARCOS MARGARITA MARIA MARINA MARIO MARTA MARTIN MAURICIO MIGUEL MIRIAM MONICA NANCY NATALIA NICOLAS NORMA
OLGA OMAR OSCAR OTONIEL PABLO PAOLA PATRICIA PEDRO RAFAEL RAQUEL RAUL RICARDO ROBERTO ROCIO RODRIGO ROSA RUBEN
SALVADOR SAMUEL SANDRA SERGIO SILVIA SOCORRO SOFIA SUSANA TERESA VERONICA VICTOR VICTORIA YOLANDA YULIANA
`.trim().split(/\s+/));

const clean=(value)=>String(value||'').replace(/\s+/g,' ').trim();
const key=(value)=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-zÑñ]/g,'').toUpperCase();
const isGiven=(token)=>GIVEN_NAMES.has(key(token));

export function splitPatientName(value){
  const formatted=formatPatientName(value);
  const tokens=clean(formatted).split(' ').filter(Boolean);
  if(tokens.length<2)return {given:formatted,surnames:''};

  let givenCount=0;
  while(givenCount<tokens.length-1&&isGiven(tokens[givenCount]))givenCount+=1;

  if(givenCount===0){
    givenCount=tokens.length>=4?2:1;
  }else if(givenCount>=tokens.length){
    givenCount=Math.max(1,tokens.length-2);
  }

  return {
    given:tokens.slice(0,givenCount).join(' '),
    surnames:tokens.slice(givenCount).join(' '),
  };
}

function isOverflowing(node){
  if(!node)return false;
  return node.scrollWidth>node.clientWidth+1;
}

function prepareName(row){
  const node=row.querySelector('.patient-name');
  if(!node)return null;
  const raw=node.dataset.rawPatientName||clean(node.textContent);
  if(!raw||raw==='—')return node;
  if(!node.dataset.rawPatientName)node.dataset.rawPatientName=raw;
  const formatted=formatPatientName(raw);
  if(node.textContent!==formatted)node.textContent=formatted;
  const parts=splitPatientName(raw);
  node.dataset.givenNames=parts.given;
  node.dataset.surnames=parts.surnames;
  return node;
}

let scheduled=false;
function layoutAdaptiveRows(){
  scheduled=false;
  const tables=[...document.querySelectorAll('.imaging-table')];
  for(const table of tables){
    table.classList.remove('study-wide-v26');
    const rows=[...table.querySelectorAll('.imaging-row')];
    rows.forEach((row)=>{
      row.classList.remove('adaptive-two-line-v26');
      row.dataset.studyNeedsSpace='0';
      prepareName(row);
    });
  }

  requestAnimationFrame(()=>{
    for(const table of tables){
      const rows=[...table.querySelectorAll('.imaging-row')];
      let needsStudyWidth=false;
      rows.forEach((row)=>{
        const study=row.querySelector('.study-cell');
        if(isOverflowing(study)){
          row.dataset.studyNeedsSpace='1';
          needsStudyWidth=true;
        }
      });
      if(needsStudyWidth)table.classList.add('study-wide-v26');
    }

    requestAnimationFrame(()=>{
      for(const table of tables){
        const rows=[...table.querySelectorAll('.imaging-row')];
        rows.forEach((row)=>{
          const name=prepareName(row);
          const study=row.querySelector('.study-cell');
          const nameTooLong=isOverflowing(name);
          const studyNeeded=row.dataset.studyNeedsSpace==='1'||isOverflowing(study);
          if(nameTooLong||studyNeeded)row.classList.add('adaptive-two-line-v26');
        });
      }
    });
  });
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(layoutAdaptiveRows);
}

function start(){
  schedule();
  const target=document.getElementById('app')||document.body;
  new MutationObserver(schedule).observe(target,{childList:true,subtree:true,characterData:true});
  if('ResizeObserver' in window)new ResizeObserver(schedule).observe(document.documentElement);
  window.addEventListener('orientationchange',schedule,{passive:true});
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
