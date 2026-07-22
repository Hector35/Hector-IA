// Deliberate Hector ASI evolution and visible-growth redesign, guarded by visual-change-approved.
import React from 'react';
import ReactDOM from 'react-dom/client';
import {HectorASIEvolutionApp} from './HectorASIEvolutionApp';
import './hector-asi.css';
import './hector-asi-markdown.css';
import './hector-asi-operations.css';
import './hector-asi-evolution.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HectorASIEvolutionApp/></React.StrictMode>
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
