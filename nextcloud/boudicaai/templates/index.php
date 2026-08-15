<?php

declare(strict_types=1);

use OCP\Util;

// Load simple JS and CSS (no build step needed)


Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'admin-settings');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'agents-ui');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'audio-transcription');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'boudicaai-main');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'chat-api');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'chat-storage');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'chat-ui');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'dark-mode');    
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'document-handler');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'rag-upload');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'saml-auth');        
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'scheduler');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'services');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'torc-private-storage');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'torc-private-ui');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'voice-input');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'app');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'boudica-autosignup');



Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'boudicaai-main');
Util::addStyle(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'boudicaai-main');

?>

<div id="boudicaai"></div>
