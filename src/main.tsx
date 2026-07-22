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
    try{await navigator.serviceWorker.register('/sw.js')}catch{}
  });
}
