import React from 'react';
import ReactDOM from 'react-dom/client';
import {CodexApp} from './CodexApp';
import {installWorkEvidenceEnhancer} from './work-evidence-ui';
import {installScheduledTasksEnhancer} from './scheduled-tasks-ui';
import {installMemoryControlEnhancer} from './memory-control-ui';
import {installResponseAuditEnhancer} from './response-audit-ui';
import {installIntelligenceStatusEnhancer} from './intelligence-status-ui';
import {installSelfModelEnhancer} from './self-model-ui';
import './codex-ui.css';
import './codex-mobile.css';
import './chat-content.css';
import './project-ui.css';
import './work-evidence-ui.css';
import './scheduled-tasks-ui.css';
import './memory-control-ui.css';
import './response-audit-ui.css';
import './intelligence-status-ui.css';
import './self-model-ui.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><CodexApp/></React.StrictMode>
);

installWorkEvidenceEnhancer();
installScheduledTasksEnhancer();
installMemoryControlEnhancer();
installResponseAuditEnhancer();
installIntelligenceStatusEnhancer();
installSelfModelEnhancer();

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{await navigator.serviceWorker.register('/sw.js')}catch{}
  });
}
