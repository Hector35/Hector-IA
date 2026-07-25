import React from 'react';
import ReactDOM from 'react-dom/client';
import {HectorChatApp} from './HectorChatApp';
import {HectorQualityOverlay} from './HectorQualityOverlay';
import './hector-chat.css';
import './hector-chat-mobile-refinement.css';
import './hector-quality-overlay.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HectorChatApp/>
    <HectorQualityOverlay/>
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
