import React from 'react';
import ReactDOM from 'react-dom/client';
import {CodexApp} from './CodexApp';
import './codex-ui.css';
import './codex-mobile.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CodexApp/>
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
