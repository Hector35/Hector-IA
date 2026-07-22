import React from 'react';
import ReactDOM from 'react-dom/client';
import {CodexApp} from './CodexApp';
import {installWorkModeEnhancer} from './work-mode-ui';
import {installWorkEvidenceEnhancer} from './work-evidence-ui';
import {installScheduledTasksEnhancer} from './scheduled-tasks-ui';
import {installProgrammedResultsEnhancer} from './programmed-results-ui';
import {installOneCommandEnhancer} from './one-command-ui';
import {installComposerFileUpload} from './composer-file-upload';
import {installFileSearchEnhancer} from './file-search-ui';
import {installChatCopyEnhancer} from './chat-copy-ui';
import {installMemoryControlEnhancer} from './memory-control-ui';
import {installResponseAuditEnhancer} from './response-audit-ui';
import {installIntelligenceStatusEnhancer} from './intelligence-status-ui';
import {installStrategyGovernanceEnhancer} from './strategy-governance-ui';
import {installSelfModelEnhancer} from './self-model-ui';
import {installCognitiveBudgetEnhancer} from './cognitive-budget-ui';
import {installBudgetQualityAlertsEnhancer} from './budget-quality-alerts-ui';
import {installChatBudgetForecastEnhancer} from './chat-budget-forecast-ui';
import {installChatQualityAlertStrip} from './chat-quality-alert-strip';
import {installGlobalQualityAlertIndicator} from './global-quality-alert-indicator';
import {installOperationalNotificationCenter} from './operational-notification-center';
import {installPlanDriftIncidentAlert} from './plan-drift-incident-ui';
import {installHectorShellEnhancer} from './hector-shell-ui';
import {installHectorShellAccessibility} from './hector-shell-accessibility';
import {installTestAccountEnhancer} from './test-account-ui';
import './codex-ui.css';
import './codex-mobile.css';
import './chat-content.css';
import './project-ui.css';
import './work-mode-ui.css';
import './work-evidence-ui.css';
import './scheduled-tasks-ui.css';
import './programmed-results-ui.css';
import './one-command-ui.css';
import './composer-file-upload.css';
import './file-search-ui.css';
import './chat-copy-ui.css';
import './memory-control-ui.css';
import './response-audit-ui.css';
import './intelligence-status-ui.css';
import './strategy-governance-ui.css';
import './self-model-ui.css';
import './cognitive-budget-ui.css';
import './budget-quality-alerts-ui.css';
import './chat-budget-forecast-ui.css';
import './chat-quality-alert-strip.css';
import './global-quality-alert-indicator.css';
import './operational-notification-center.css';
import './plan-drift-incident-ui.css';
import './hector-shell-ui.css';
import './hector-shell-accessibility.css';
import './test-account-ui.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><CodexApp/></React.StrictMode>
);

installWorkModeEnhancer();
installScheduledTasksEnhancer();
installProgrammedResultsEnhancer();
installOneCommandEnhancer();
installComposerFileUpload();
installFileSearchEnhancer();
installChatCopyEnhancer();
installWorkEvidenceEnhancer();
installMemoryControlEnhancer();
installResponseAuditEnhancer();
installIntelligenceStatusEnhancer();
installStrategyGovernanceEnhancer();
installSelfModelEnhancer();
installCognitiveBudgetEnhancer();
installBudgetQualityAlertsEnhancer();
installChatBudgetForecastEnhancer();
installChatQualityAlertStrip();
installGlobalQualityAlertIndicator();
installOperationalNotificationCenter();
installPlanDriftIncidentAlert();
installHectorShellEnhancer();
installHectorShellAccessibility();
installTestAccountEnhancer();

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{await navigator.serviceWorker.register('/sw.js')}catch{}
  });
}
