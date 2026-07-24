// Hector ASI Stage 6: hybrid maximum-intelligence operation with visible, verifiable status.
import React from 'react';
import ReactDOM from 'react-dom/client';
import {HectorASIEvolutionApp} from './HectorASIEvolutionApp';
import {StageSixShell} from './StageSixShell';
import './hector-asi.css';
import './hector-asi-markdown.css';
import './hector-asi-operations.css';
import './hector-asi-evolution.css';
import './hector-asi-evolution-compact.css';
import './stage-six.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StageSixShell><HectorASIEvolutionApp/></StageSixShell>
  </React.StrictMode>
);

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    const hadController=Boolean(navigator.serviceWorker.controller);
    let reloaded=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(hadController&&!reloaded){
        reloaded=true;
        window.location.reload();
      }
    });
    try{
      const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
      registration.waiting?.postMessage({type:'SKIP_WAITING'});
      await registration.update();
    }catch{}
  });
}
