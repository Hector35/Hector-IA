import React from 'react';
import ReactDOM from 'react-dom/client';
import {CodexApp} from './CodexApp';
import {installWorkEvidenceEnhancer} from './work-evidence-ui';
import './codex-ui.css';
import './codex-mobile.css';
import './chat-content.css';
import './project-ui.css';
import './work-evidence-ui.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><CodexApp/></React.StrictMode>
);

installWorkEvidenceEnhancer();

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{await navigator.serviceWorker.register('/sw.js')}catch{}
  });
}
