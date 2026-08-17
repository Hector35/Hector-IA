import React from 'react';
import ReactDOM from 'react-dom/client';
import {PatientShiftApp} from './PatientShiftApp';
import './patient-shift.css';
import './patient-shift-accessibility.css';

// Active PWA surface: patient shift control.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PatientShiftApp/>
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
