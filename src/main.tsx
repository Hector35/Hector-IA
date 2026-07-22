import React from 'react';
import ReactDOM from 'react-dom/client';
import {HectorASIApp} from './HectorASIApp';
import './hector-asi.css';
import './hector-asi-markdown.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HectorASIApp/></React.StrictMode>
);

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{await navigator.serviceWorker.register('/sw.js')}catch{}
  });
}
