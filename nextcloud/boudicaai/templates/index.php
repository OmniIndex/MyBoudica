<?php

declare(strict_types=1);

use OCP\Util;

// Pre-seeds localStorage['boudica_session'] from the credential minted at
// Keycloak login time (PageController::index()) so saml-auth.js's
// checkExistingSession() finds it already there and never falls through to
// its signup() fallback. No-op (prints nothing) for a user with no
// provisioned key yet - e.g. the setup.sh admin account, or anyone who
// hasn't logged in through "Sign in with Boudica" yet. Same pattern already
// used in boudicaagent/boudicacode/boudicadashboard's own PageController+
// template - must print before 'saml-auth' below loads.
//
// Requires the nonce attribute: Nextcloud's own CSP is nonce-based with
// 'strict-dynamic' on script-src-elem (confirmed live via the browser's own
// CSP violation report), which rejects ANY inline <script> lacking a
// matching nonce outright - 'unsafe-inline' alone would not have helped
// either, browsers ignore it once 'strict-dynamic' is present. $_['cspNonce']
// is injected into every template's own $_ array by
// \OC\Template\Base::__construct() (not just the layout wrapper), so it's
// available here directly. The sibling apps' identical pre-seed scripts
// likely have this same gap - their own "verified live" testing was a raw
// curl/cookie-jar round-trip, which never executes JS or enforces CSP, so
// it would not have caught this either.
if (!empty($_['boudica_provisioned_key'])) {
    print_unescaped(
        '<script nonce="' . \OCP\Util::sanitizeHTML($_['cspNonce']) . '">(function(){try{'
        . 'var existing=null;try{existing=JSON.parse(localStorage.getItem("boudica_session")||"null");}catch(e){}'
        . 'var provisionedEmail=' . json_encode($_['boudica_provisioned_email'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';'
        . 'if(!existing||existing.email!==provisionedEmail){localStorage.setItem("boudica_session",'
        . json_encode(json_encode([
            'token' => $_['boudica_provisioned_key'],
            'email' => $_['boudica_provisioned_email'],
        ]), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
        . ');}}catch(e){}})();</script>'
    );
}

// Load simple JS and CSS (no build step needed).
//
// This template used to be a near-empty shell - boudicaai-main.js built the
// entire DOM at runtime via a big innerHTML string. That injection role has
// been retired (2026-09-04, newer-UI port): the markup now lives directly in
// this file, matching the boudicaagent/boudicacode/boudicadashboard
// convention. boudicaai-main.js itself was fully retirable (its only other
// content was a dead, never-invoked signup()/performBoudicalAutosignup()
// pair - saml-auth.js already has its own copy of that same logic) and has
// been deleted; do NOT add its Util::addScript() call back. Its CSS
// counterpart, css/boudicaai-main.css, is unrelated (a real, still-used
// stylesheet) and stays.
//
// 'boudica-autosignup' is dropped too - verified genuinely inert (both of
// its own DOMContentLoaded/immediate call sites are commented out; it only
// ever emits one console.log), superseded by Keycloak-login-time
// provisioning. 'boudicaai-digest' is intentionally NOT loaded here - it is
// the separate Talk-digest page's own script, loaded by templates/digest.php.
// 'chat-audio-integration' and 'audio-upload-ui' are NOT wired in here
// either - grepping the whole app found no reference to either file from
// any template or script, so they were never actually part of this page;
// adding them now would be new, unverified behavior outside this port's scope.
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'admin-settings');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'audio-transcription');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'dark-mode');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'chat-storage');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'document-handler');
// Vendored DOMPurify (sanitizes model-emitted inline <svg> before it's
// rendered - see chat-ui.js's sanitizeInlineSvg()). Nextcloud's CSP doesn't
// allow the CDN <script> tag the standalone product uses, so this is a local
// copy of the same dompurify@3.1.6 UMD build referenced there. Must load
// before chat-ui.
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'vendor/purify.min');
// Vendored marked (markdown-to-HTML rendering - chat-ui.js's formatMessage()
// calls marked.parse() when `typeof marked !== 'undefined'`, else falls back
// to basicMarkdownFormat(), which only handles bold/italic/code, not
// headings, lists, links, or images). This script tag was missing from the
// original port (chat-ui.js/chat-api.js/app.js were copied over, but the
// standalone product's own CDN <script> for marked - same CSP restriction as
// DOMPurify above - was never replaced with a local copy) - confirmed live
// 2026-09-22 that this silently degraded every response to the fallback
// path the whole time: bold/italic rendered, but a FLUX-generated image's
// markdown (`![alt](/generated/<hash>.png)`), and any heading/list/link
// syntax, showed as literal raw text instead of real HTML. Same
// marked@11.1.1 UMD build boudica_slm's own chat_interface/index.html loads
// from the CDN. Must load before chat-ui, same reasoning as DOMPurify.
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'vendor/marked.min');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'chat-ui');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'chat-api');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'voice-input');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'scheduler');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'rag-upload');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'file-manager-window');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'saml-auth');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'torc-private-storage');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'torc-private-ui');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'app');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'services');
Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'agents-ui');

Util::addStyle(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'boudicaai-main');

?>

<div id="boudicaai">
<div id="chatApp" class="visible">
    <div class="container">
        <!-- Sidebar with Chat History -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <h2>
                    Your Workspace
                </h2>
                <button id="newChatBtn" class="btn btn-new-chat" title="New Chat">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    New Chat
                </button>
            </div>
            <div class="sidebar-search">
                <input type="text" id="historySearch" placeholder="Search conversations..." />
            </div>

            <!-- Scrollable nav sections -->
            <div class="sidebar-nav">

                <!-- Actions Section -->
                <div class="sidebar-section actions-section">
                    <div class="sidebar-section-header">
                        <h3>Actions</h3>
                        <button id="toggleActionsBtn" class="btn btn-icon-sm" title="Toggle Actions">
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <div class="actions-list" id="actionsList">
                        <!-- Scheduled actions will be dynamically inserted here -->
                    </div>
                </div>

                <!-- Rules Section -->
                <div class="sidebar-section rules-section">
                    <div class="sidebar-section-header">
                        <h3>Rules</h3>
                        <button id="toggleRulesBtn" class="btn btn-icon-sm" title="Toggle Rules">
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <div class="rules-list" id="rulesList">
                        <!-- Rules will be dynamically inserted here -->
                    </div>
                </div>

                <!-- Collaboration Section -->
                <div class="sidebar-section collab-section">
                    <div class="sidebar-section-header">
                        <h3>Collaboration</h3>
                        <button id="toggleCollabBtn" class="btn btn-icon-sm" title="Toggle Collaboration">
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <div class="collab-body" id="collabBody">

                        <!-- Users sub-section -->
                        <div class="collab-sub-section">
                            <div class="collab-sub-header">
                                <span>Users</span>
                                <button id="toggleCollabUsersBtn" class="btn btn-icon-sm" title="Toggle Users">
                                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                                        <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="collab-sub-list" id="collabUsersList">
                                <!-- Populated from boudislm.prompt_audit_log on page load -->
                            </div>
                        </div>

                        <!-- In-Box sub-section -->
                        <div class="collab-sub-section">
                            <div class="collab-sub-header">
                                <span>Inbox <span id="inboxUnreadBadge" class="inbox-badge hidden"></span></span>
                                <button id="toggleCollabInboxBtn" class="btn btn-icon-sm" title="Toggle In-Box">
                                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                                        <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="collab-sub-list" id="collabInboxList">
                                <!-- Inbox messages will appear here -->
                            </div>
                        </div>

                        <!-- Sent sub-section -->
                        <div class="collab-sub-section">
                            <div class="collab-sub-header">
                                <span>Sent</span>
                                <button id="toggleCollabSentBtn" class="btn btn-icon-sm" title="Toggle Sent">
                                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                                        <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="collab-sub-list" id="collabSentList">
                                <!-- Sent messages will appear here -->
                            </div>
                        </div>

                        <!-- Shared Chats sub-section -->
                        <div class="collab-sub-section">
                            <div class="collab-sub-header">
                                <span>Shared <span id="sharedChatsUnreadBadge" class="inbox-badge hidden"></span></span>
                                <div style="display:flex;gap:4px;align-items:center;">
                                    <button id="newSharedChatBtn" class="btn btn-icon-sm" title="New shared chat">
                                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                                            <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                        </svg>
                                    </button>
                                    <button id="toggleCollabSharedBtn" class="btn btn-icon-sm" title="Toggle Shared Chats">
                                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                                            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div class="collab-sub-list" id="collabSharedList">
                                <!-- Shared chat sessions will appear here -->
                            </div>
                        </div>

                    </div>
                </div>

                <!-- Chats Section -->
                <div class="sidebar-section chats-section">
                    <div class="sidebar-section-header">
                        <h3>Chats</h3>
                        <button id="toggleChatsBtn" class="btn btn-icon-sm" title="Toggle Chats">
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <div class="chats-list" id="chatHistoryList">
                        <!-- Chat history items will be dynamically inserted here -->
                    </div>
                </div>
            </div><!-- /.sidebar-nav -->
        </aside>

        <!-- Main Chat Area -->
        <main class="main-content">
            <div class="chat-header">
                <div class="header-left-controls">
                <button id="sidebarToggleBtn" class="btn btn-icon sidebar-toggle-btn" title="Toggle sidebar" >
                    <svg width="25" height="25" viewBox="0 0 25 25" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                <button id="connectedServicesBtn" class="btn btn-icon btn-services-header" title="Connected Services">
                     <svg width="25" height="25" viewBox="0 0 25 25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <!-- plug icon -->
                        <path d="M12 22V12"/>
                        <path d="M5 12H19"/>
                        <path d="M8 12V6a2 2 0 0 1 4 0v6"/>
                        <path d="M12 12V6a2 2 0 0 1 4 0v6"/>
                        <path d="M9 16a3 3 0 0 0 6 0"/>
                    </svg>
                    <span id="servicesConnectedBadge" class="services-header-badge hidden"></span>
                </button>
                <button id="knowledgeBaseBtn" class="btn btn-icon" title="Knowledge Base">
                    <svg width="25" height="25" viewBox="0 0 25 25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                        <line x1="9" y1="7" x2="15" y2="7"/>
                        <line x1="9" y1="11" x2="15" y2="11"/>
                    </svg>
                </button>
                <button id="fileManagerBtn" class="btn btn-icon btn-filemanager-header" title="File Manager">
                    <svg width="25" height="25" viewBox="0 0 25 25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="19" height="15" rx="2"/>
                        <path d="M3 4V3a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1"/>
                    </svg>
                </button>
                <button id="agentsBtn" class="btn btn-icon btn-agents-header" title="Agents">
                    <svg width="25" height="25" viewBox="0 0 25 25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/>
                    </svg>
                </button>
            </div>
                <h1 id="chatTitle">Work smarter, not harder. Your tasks, your rules, your AI.</h1>
                <div class="chat-actions">
                    <button id="faqBtn" class="btn btn-icon" title="Help & FAQ">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </button>
                    <button id="highContrastBtn" class="btn btn-icon" title="Toggle High Contrast Mode (Ctrl+Shift+H)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="9"></circle>
                            <path d="M12 3v18M12 3c4.97 0 9 4.03 9 9s-4.03 9-9 9"></path>
                        </svg>
                    </button>
                    <div class="theme-toggle-container">
                        <svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                        <label class="theme-toggle">
                            <input type="checkbox" id="darkModeToggle" aria-label="Toggle dark mode">
                            <span class="theme-toggle-slider"></span>
                        </label>
                        <svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="5"></circle>
                            <line x1="12" y1="1" x2="12" y2="3"></line>
                            <line x1="12" y1="21" x2="12" y2="23"></line>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                            <line x1="1" y1="12" x2="3" y2="12"></line>
                            <line x1="21" y1="12" x2="23" y2="12"></line>
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                        </svg>
                    </div>
                </div>
            </div>

            <!-- Main content row: chat area + HTML flyout panel side-by-side, below the header -->
            <div class="main-content-row">
            <div class="chat-panel">
            <div class="chat-messages" id="chatMessages">
                <div class="welcome-screen" id="welcomeScreen">
                    <div class="welcome-content">
                        <h2>Welcome to Boudica Chat</h2>
                        <p>Your secure, air-gapped AI assistant</p>
                        <div class="suggestion-chips">
                            <button class="chip" data-prompt="What can Boudica Torc help me with? Output in html. The response is for a non technical audience so keep the language as non tech as possible">What can Boudica Torc help me with?</button>
                            <button class="chip" data-prompt="Explain how Boudica Torc works">Explain how Boudica Torc works</button>
                            <button class="chip" data-prompt="Explain to me how the Boudica Memory is different from other LM inference engines">Explain to me the Boudica Memory</button>
                            <button class="chip" data-prompt="Explain how LoRA and RAG work to minimize hallucinations">Explain how LoRA and RAG work to minimize hallucinations</button>
                        </div>
                    </div>
                </div>
                <!-- Messages will be dynamically inserted here -->
            </div>

            <!-- Chat Input Area -->
            <div class="chat-input-container">
                <!-- Drop overlay (shown while dragging files over the input area) -->
                <div id="dropOverlay" class="drop-overlay">
                    <div class="drop-overlay-inner">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <span>Drop files to attach</span>
                    </div>
                </div>
                <!-- Uploaded Documents Area -->
                <div id="uploadedDocuments" class="uploaded-documents hidden"></div>

                <div class="chat-input-wrapper">
                    <div id="slashMenu" class="slash-menu hidden" role="listbox" aria-label="Slash commands and rules"></div>
                    <textarea
                        id="chatInput"
                        class="chat-input"
                        placeholder="Send a message to Boudica..."
                        rows="1"
                    ></textarea>
                    <div class="input-actions">
                        <label class="private-checkbox-container" title="Keep this conversation private">
                            <input type="checkbox" id="privateCheckbox" />
                            <span class="private-label">Private</span>
                        </label>
                        <label class="private-checkbox-container" title="Answer using only verbatim quotes from retrieved documents. Reduces hallucination for document queries.">
                            <input type="checkbox" id="verbatimCheckbox" />
                            <span class="private-label">Verbatim</span>
                        </label>
                        <input type="file" id="fileInput" accept=".txt,.pdf,.docx,.doc,.xlsx,.xls,.csv,.pptx,.ppt,.odt,.ods,.odp,.rtf,.md,.log,.json,.xml,.html,.jpg,.jpeg,.png,.gif,.webp" style="display:none" multiple />
                        <button id="attachBtn" class="btn btn-icon" title="Attach documents">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M16.5 10.5L10.5 16.5C8.567 18.433 5.433 18.433 3.5 16.5C1.567 14.567 1.567 11.433 3.5 9.5L9.5 3.5C10.881 2.119 13.119 2.119 14.5 3.5C15.881 4.881 15.881 7.119 14.5 8.5L8.5 14.5C7.81 15.19 6.69 15.19 6 14.5C5.31 13.81 5.31 12.69 6 12L11.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                        <button id="voiceBtn" class="btn btn-icon" title="Voice input (speak and it will auto-send)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                <line x1="12" y1="19" x2="12" y2="23"></line>
                                <line x1="8" y1="23" x2="16" y2="23"></line>
                            </svg>
                        </button>
                        <button id="sendBtn" class="btn btn-send" title="Send message" disabled>
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M18 2L9 11M18 2L12 18L9 11M18 2L2 8L9 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="input-footer">
                    <span class="char-count" id="charCount">0 / 4000</span>
                </div>
            </div>
            </div><!-- /.chat-panel -->

            <!-- HTML Preview Flyout Panel (inside main-content, below header) -->
            <aside class="html-preview-panel" id="htmlPreviewPanel">
                <!-- Drag-to-resize handle on the left edge -->
                <div class="html-preview-resize-handle" id="htmlPreviewResizeHandle" title="Drag to resize"></div>

                <div class="html-preview-header">
                    <div class="html-preview-title-row">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                        <span class="html-preview-title">HTML Preview</span>
                    </div>
                    <button id="closeHtmlPreviewBtn" class="btn btn-icon" title="Close preview" type="button">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div class="html-preview-body">
                    <iframe id="htmlPreviewFrame" sandbox="allow-scripts allow-forms" title="HTML Preview"></iframe>
                </div>

                <div class="html-preview-footer">
                    <button id="htmlPreviewPrintBtn" class="btn btn-secondary btn-sm" title="Print HTML response">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 6 2 18 2 18 9"></polyline>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                            <rect x="6" y="14" width="12" height="8"></rect>
                        </svg>
                        Print
                    </button>
                    <button id="htmlPreviewSaveBtn" class="btn btn-secondary btn-sm" title="Save HTML file to disk">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Save
                    </button>
                </div>
            </aside>

            <!-- Shared Chat Panel (flex sibling, slides in from right) -->
            <div id="sharedChatPanel" class="sc-panel hidden" aria-label="Shared Chat">
                <div class="sc-modal">
                    <!-- Header -->
                    <div class="sc-header">
                        <div class="sc-header-left">
                            <button class="sc-back-btn btn btn-icon" id="scBackBtn" title="Back to chat list" aria-label="Close shared chat">
                                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                                    <path d="M12 4L6 10L12 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </button>
                            <div class="sc-title-block">
                                <span id="scPanelTitle" class="sc-title">Shared Chat</span>
                                <span id="scPanelParticipants" class="sc-participants"></span>
                            </div>
                        </div>
                        <div class="sc-header-right">
                            <button id="scInviteBtn" class="btn btn-sm" title="Invite a user">+ Invite</button>
                        </div>
                    </div>

                    <!-- Message thread -->
                    <div class="sc-messages" id="scMessages" aria-live="polite">
                        <!-- Messages rendered by JS -->
                    </div>

                    <!-- Typing indicator -->
                    <div class="sc-typing hidden" id="scTyping">
                        <span class="sc-typing-dot"></span>
                        <span class="sc-typing-dot"></span>
                        <span class="sc-typing-dot"></span>
                        <span class="sc-typing-label">Boudica is thinking…</span>
                    </div>

                    <!-- Input bar -->
                    <div class="sc-input-bar">
                        <textarea id="scInput" class="sc-input" placeholder="Message Boudica… or @message to post a group note" rows="1" aria-label="Message input"></textarea>
                        <button id="scSendBtn" class="btn btn-primary sc-send-btn" title="Send message">
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                                <path d="M3 10L17 3L10 17L9 11L3 10Z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div><!-- /#sharedChatPanel (inline) -->

        </div><!-- /.main-content-row -->
        </main>
    </div>
</div>

<!-- New / Edit Action Overlay -->
<div id="newActionOverlay" class="rule-overlay hidden">
    <div class="rule-overlay-box">
        <h3 class="rule-overlay-title" id="actionOverlayTitle">New Action</h3>
        <input type="hidden" id="actionEditId" value="" />
        <div class="rule-form-group">
            <label for="actionTitleInput">Title</label>
            <input type="text" id="actionTitleInput" class="rule-form-control" placeholder="Short name for this action..." />
        </div>
        <div class="rule-form-group">
            <label for="actionPromptInput">Prompt</label>
            <textarea id="actionPromptInput" class="rule-form-control action-prompt-textarea" rows="4" placeholder="Enter the prompt to run on schedule..."></textarea>
        </div>
        <div class="rule-form-group">
            <label>Days</label>
            <div class="action-day-picker">
                <label class="action-day-option"><input type="checkbox" name="actionDay" value="mon" /><span>Mon</span></label>
                <label class="action-day-option"><input type="checkbox" name="actionDay" value="tue" /><span>Tue</span></label>
                <label class="action-day-option"><input type="checkbox" name="actionDay" value="wed" /><span>Wed</span></label>
                <label class="action-day-option"><input type="checkbox" name="actionDay" value="thu" /><span>Thu</span></label>
                <label class="action-day-option"><input type="checkbox" name="actionDay" value="fri" /><span>Fri</span></label>
                <label class="action-day-option"><input type="checkbox" name="actionDay" value="sat" /><span>Sat</span></label>
                <label class="action-day-option"><input type="checkbox" name="actionDay" value="sun" /><span>Sun</span></label>
            </div>
            <div class="action-day-shortcuts">
                <button type="button" class="btn btn-day-shortcut" id="actionDayWeekdays">Weekdays</button>
                <button type="button" class="btn btn-day-shortcut" id="actionDayWeekend">Weekend</button>
                <button type="button" class="btn btn-day-shortcut" id="actionDayEvery">Every day</button>
            </div>
        </div>
        <div class="rule-form-group">
            <label for="actionTimeInput">Time</label>
            <input type="time" id="actionTimeInput" class="rule-form-control action-time-input" />
        </div>
        <div class="rule-overlay-actions">
            <button id="saveActionBtn" class="btn btn-primary">Save</button>
            <button id="cancelActionBtn" class="btn btn-secondary">Cancel</button>
        </div>
    </div>
</div>

<!-- New Rule Overlay -->
<div id="newRuleOverlay" class="rule-overlay hidden">
    <div class="rule-overlay-box">
        <h3 class="rule-overlay-title" id="ruleOverlayTitle">New Rule</h3>
        <input type="hidden" id="ruleEditId" value="" />
        <div class="rule-form-group">
            <label for="ruleNameInput">Rule Name</label>
            <input type="text" id="ruleNameInput" class="rule-form-control" placeholder="e.g. Formal, Concise, Technical..." />
        </div>
        <div class="rule-form-group">
            <label>Rule Text</label>
            <div id="ruleTextInput" contenteditable="true" class="rule-text-editor" data-placeholder="Enter the instruction that will be added to your prompt..."></div>
        </div>
        <div class="rule-overlay-actions">
            <button id="saveRuleBtn" class="btn btn-primary">Save</button>
            <button id="cancelRuleBtn" class="btn btn-secondary">Cancel</button>
        </div>
    </div>
</div>

<!-- Compose Message Overlay -->
<div id="composeOverlay" class="compose-overlay hidden">
    <div class="compose-box">
        <h3 class="compose-title">New Message</h3>

        <div class="compose-field">
            <label class="compose-label">To</label>
            <div class="compose-to-wrapper">
                <div id="composeToTags" class="compose-to-tags"></div>
            </div>
        </div>

        <div class="compose-field">
            <label class="compose-label">From</label>
            <div id="composeFrom" class="compose-from"></div>
        </div>

        <div class="compose-field">
            <label class="compose-label" for="composeSubject">Subject</label>
            <input type="text" id="composeSubject" class="compose-input" placeholder="Subject..." />
        </div>

        <div class="compose-field compose-field-body">
            <label class="compose-label">Message</label>
            <div id="composeBody" contenteditable="true" class="compose-body" data-placeholder="Write your message..."></div>
        </div>

        <div class="compose-actions">
            <button id="composeAddChatBtn" class="btn btn-secondary">Add Chat</button>
            <button id="composeSendBtn" class="btn btn-primary">Send</button>
            <button id="composeCancelBtn" class="btn btn-ghost">Cancel</button>
        </div>
    </div>
</div>

<!-- Message View Overlay -->
<div id="msgViewOverlay" class="compose-overlay hidden">
    <div class="compose-box msg-view-box">
        <h3 class="compose-title" id="msgViewSubject"></h3>
        <div class="msg-view-meta">
            <span><span id="msgViewFromLabel">From:</span> <strong id="msgViewFrom"></strong></span>
            <span id="msgViewDate"></span>
        </div>
        <div class="msg-view-body" id="msgViewBody"></div>
        <div class="compose-actions">
            <button id="msgViewDeleteBtn" class="btn btn-danger">Delete</button>
            <button id="msgViewCloseBtn" class="btn btn-secondary">Close</button>
        </div>
    </div>
</div>

<!-- FAQ Overlay -->
<div id="faqOverlay" class="faq-overlay hidden" role="dialog" aria-modal="true" aria-label="Help and FAQ">
    <div class="faq-modal">
        <div class="faq-modal-header">
            <div class="faq-title">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <h2>Boudica Chat — Help &amp; FAQ</h2>
            </div>
            <div class="faq-header-controls">
                <div class="faq-search-wrap">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" id="faqSearch" class="faq-search-input" placeholder="Search questions…" autocomplete="off" />
                </div>
                <button id="faqCloseBtn" class="btn btn-icon faq-close-btn" title="Close Help">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>

        <div class="faq-body" id="faqBody">

            <!-- ── Getting Started ── -->
            <div class="faq-category" data-category="getting-started">
                <button class="faq-category-header" aria-expanded="true">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                        Getting Started
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body">
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I log in?</button>
                        <div class="faq-answer">
                            <p>This app uses your Nextcloud login (via Keycloak single sign-on where configured). If you can see this page, you're already authenticated - there is no separate sign-in step inside Boudica Chat itself.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I log out?</button>
                        <div class="faq-answer">
                            <p>Use Nextcloud's own account menu (top-right avatar) and choose <strong>Log out</strong> - this also ends your Boudica session via single logout.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What browsers are supported?</button>
                        <div class="faq-answer">
                            <p>All modern evergreen browsers are supported: <strong>Chrome, Edge, Firefox, Safari</strong> (v15+). Voice input requires a browser that supports the <em>Web Speech API</em> — currently Chrome and Edge have the best support. For the best experience use a Chromium-based browser.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Chatting with Boudica ── -->
            <div class="faq-category" data-category="chatting">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        Chatting with Boudica
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I send a message?</button>
                        <div class="faq-answer">
                            <p>Type your message into the text box at the bottom of the screen, then either press <kbd>Enter</kbd> or click the <strong>send arrow</strong> button. The send button is enabled only when there is text in the input. You can type up to <strong>4,000 characters</strong> per message — a live counter is shown at the bottom-right of the input area.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I add a new line without sending?</button>
                        <div class="faq-answer">
                            <p>Press <kbd>Shift + Enter</kbd> to insert a line break without submitting the message.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What are the suggestion chips on the welcome screen?</button>
                        <div class="faq-answer">
                            <p>The four buttons on the welcome screen are <strong>quick-start prompts</strong>. Clicking one fills the input with a pre-written question and immediately sends it, so you can explore Boudica's capabilities without typing anything. They disappear once your first message is sent.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I start a new conversation?</button>
                        <div class="faq-answer">
                            <p>Click the <strong>+ New Chat</strong> button at the top of the left sidebar. This clears the current conversation and creates a fresh session. Your previous conversations remain in the chat history list below.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Why does Boudica sometimes take a while to respond?</button>
                        <div class="faq-answer">
                            <p>Boudica runs on a local, air-gapped inference server — there is no cloud processing. Response time depends on the complexity of your question and the server's current load. Longer or more detailed prompts naturally take more time. During generation you will see a typing indicator.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can I copy or export a response?</button>
                        <div class="faq-answer">
                            <p>Yes. Each response has action buttons (copy, thumbs up/down, etc.) that appear when you hover over the message. Use the <strong>copy</strong> button to copy the raw text. If Boudica returns an HTML response, the <strong>HTML Preview</strong> panel opens automatically and you can <strong>Print</strong> or <strong>Save</strong> it from that panel.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Chat History & Organisation ── -->
            <div class="faq-category" data-category="history">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="12 8 12 12 14 14"></polyline><path d="M3.05 11a9 9 0 1 0 .5-4.5"></path></svg>
                        Chat History &amp; Organisation
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Where are my conversations stored?</button>
                        <div class="faq-answer">
                            <p>Conversations are stored in your browser's <code>localStorage</code> and also synced to the Boudica server (PostgreSQL database) so they persist across devices and browser sessions. Settings and chat history are restored automatically when you log in.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I search my chat history?</button>
                        <div class="faq-answer">
                            <p>Use the <strong>Search conversations…</strong> box at the top of the sidebar. As you type, the chat list filters in real time to show only conversations whose titles match your query.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can I rename a conversation?</button>
                        <div class="faq-answer">
                            <p>Yes. Click the conversation title in the sidebar or double-click on the title in the chat header. An editable field appears — type the new name and press <kbd>Enter</kbd> or click away to save.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can I organise chats into folders?</button>
                        <div class="faq-answer">
                            <p>Yes. Right-click (or use the context menu) on any conversation in the <strong>Chats</strong> section to create a folder or move the chat into an existing folder. Folders can also be nested for deeper organisation.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What does the Private checkbox do?</button>
                        <div class="faq-answer">
                            <p>Ticking <strong>Private</strong> before sending a message marks that message so it is not included in any shared or audited logs. Private messages are still stored locally for your own reference but are excluded from usage analytics and collaborative contexts.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can I delete a conversation?</button>
                        <div class="faq-answer">
                            <p>Yes. Right-click the conversation in the sidebar and choose <strong>Delete</strong>. This removes it from both local storage and the server. This action cannot be undone.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Documents & Attachments ── -->
            <div class="faq-category" data-category="attachments">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        Documents &amp; Attachments
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What file types can I attach?</button>
                        <div class="faq-answer">
                            <p>The following file types are supported:</p>
                            <ul>
                                <li><strong>Documents:</strong> .txt, .pdf, .docx, .doc, .odt, .rtf, .md</li>
                                <li><strong>Spreadsheets:</strong> .xlsx, .xls, .csv, .ods</li>
                                <li><strong>Presentations:</strong> .pptx, .ppt, .odp</li>
                                <li><strong>Code &amp; Data:</strong> .json, .xml, .html, .log</li>
                                <li><strong>Images:</strong> .jpg, .jpeg, .png, .gif, .webp</li>
                            </ul>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I attach a document?</button>
                        <div class="faq-answer">
                            <p>Click the <strong>paperclip icon</strong> in the input toolbar. A file picker will open. You can also drag-and-drop files directly into the chat input area. Attached files appear as chips above the input field before you send.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can I attach multiple files at once?</button>
                        <div class="faq-answer">
                            <p>Yes. Hold <kbd>Ctrl</kbd> (or <kbd>Cmd</kbd> on Mac) while selecting files in the picker to choose multiple files simultaneously. Each file appears as a removable chip in the upload area.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What happens when I attach a file?</button>
                        <div class="faq-answer">
                            <p>The file content is extracted and sent alongside your message as context for Boudica. For images, the visual content is included directly. For documents, the text is extracted and prepended to your message. Boudica can then answer questions about the document or perform analysis on it.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Voice Input ── -->
            <div class="faq-category" data-category="voice">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        Voice Input
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I use voice input?</button>
                        <div class="faq-answer">
                            <p>Click the <strong>microphone icon</strong> in the input toolbar. Your browser will request microphone permission if not already granted. Start speaking — your words are transcribed in real time into the message box.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Does voice input send automatically?</button>
                        <div class="faq-answer">
                            <p>Yes. When you stop speaking and a brief silence is detected, the transcribed message is automatically sent to Boudica — you do not need to click Send. You can click the microphone icon again to stop recording without sending.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Which browsers support voice input?</button>
                        <div class="faq-answer">
                            <p>Voice input uses the browser's built-in <strong>Web Speech API</strong>. It is fully supported in <strong>Google Chrome</strong> and <strong>Microsoft Edge</strong>. Firefox and Safari have partial or no support. If the microphone button is unresponsive, try Chrome or Edge.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Rules ── -->
            <div class="faq-category" data-category="rules">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        Rules
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What are Rules?</button>
                        <div class="faq-answer">
                            <p><strong>Rules</strong> are reusable prompt instructions you define once and apply to any message. For example, you might create a rule called <em>Formal</em> that contains "Please respond in a formal, professional tone." You can then apply that rule to any message without retyping the instruction each time.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I create a Rule?</button>
                        <div class="faq-answer">
                            <p>In the <strong>Rules</strong> section of the sidebar, click the <strong>+ New Rule</strong> button. A dialog appears where you enter a short <em>Rule Name</em> (e.g. "Concise") and the <em>Rule Text</em> — the instruction that will be injected into your prompt. Press <strong>Save</strong> or hit <kbd>Ctrl + Enter</kbd> to save.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I apply a Rule to a message?</button>
                        <div class="faq-answer">
                            <p>There are two ways:</p>
                            <ol>
                                <li><strong>Click the rule name</strong> in the sidebar — the rule text is immediately prepended to whatever is already in the input box.</li>
                                <li><strong>Inline expansion</strong> — type <code>use &lt;RuleName&gt;</code>, <code>add &lt;RuleName&gt;</code>, or <code>include &lt;RuleName&gt;</code> anywhere in your message. When you send, those phrases are automatically replaced with the full rule text before the message reaches Boudica.</li>
                            </ol>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can I delete a Rule?</button>
                        <div class="faq-answer">
                            <p>Yes. Each rule in the sidebar has a delete (×) button that appears on hover. Click it to permanently remove the rule. This cannot be undone.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Are Rules synced across devices?</button>
                        <div class="faq-answer">
                            <p>Yes. Rules are saved as part of your user settings and synced to the server, so they are available on any device where you log in with the same account.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── HTML Preview ── -->
            <div class="faq-category" data-category="html-preview">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                        HTML Preview
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What is the HTML Preview panel?</button>
                        <div class="faq-answer">
                            <p>When Boudica returns a response containing HTML markup, a <strong>live preview panel</strong> slides in from the right side of the screen. It renders the HTML in a sandboxed frame so you can see exactly how the output looks — useful for reports, tables, dashboards, and formatted documents.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I print an HTML response?</button>
                        <div class="faq-answer">
                            <p>Click the <strong>Print</strong> button in the footer of the HTML Preview panel. Your browser's print dialog will open, showing only the rendered HTML content — not the rest of the chat interface.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I save an HTML response as a file?</button>
                        <div class="faq-answer">
                            <p>Click the <strong>Save</strong> button in the HTML Preview panel footer. The HTML source is downloaded as a <code>.html</code> file to your browser's default downloads folder.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can I resize the HTML Preview panel?</button>
                        <div class="faq-answer">
                            <p>Yes. Drag the <strong>resize handle</strong> on the left edge of the panel to make it wider or narrower. The chat messages panel adjusts accordingly.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I close the HTML Preview?</button>
                        <div class="faq-answer">
                            <p>Click the <strong>× close button</strong> in the preview panel header, or press <kbd>Escape</kbd> while the panel is open.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Collaboration ── -->
            <div class="faq-category" data-category="collaboration">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        Collaboration
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I send a message to a colleague?</button>
                        <div class="faq-answer">
                            <p>Expand the <strong>Collaboration</strong> section in the sidebar and open the <strong>Users</strong> sub-section. Click any user's name or avatar — a <strong>Compose</strong> window opens with them pre-filled as the recipient. Add a subject, write your message, and click <strong>Send</strong>.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I send to multiple recipients?</button>
                        <div class="faq-answer">
                            <p>Click the first user to open the Compose window, then click additional users in the sidebar — each one is appended as a tag in the <strong>To</strong> field without losing existing recipients. You can also remove a recipient by clicking the × on their tag.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can I include a chat excerpt in a message?</button>
                        <div class="faq-answer">
                            <p>Yes. Click the <strong>Add Chat</strong> button inside the Compose window. The current conversation's messages are embedded in the message body so the recipient can see the context without needing access to your chat history.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I check my inbox?</button>
                        <div class="faq-answer">
                            <p>Expand the <strong>Collaboration → Inbox</strong> sub-section. Messages are listed newest first. Unread messages are highlighted in purple. The <strong>badge number</strong> next to "Inbox" shows how many unread messages you have. Click any message to read it in a pop-up overlay.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Are new messages pushed to me automatically?</button>
                        <div class="faq-answer">
                            <p>Yes. The inbox is polled silently every <strong>30 seconds</strong> in the background. When a new message arrives, it appears at the top of your Inbox list with a brief purple flash and the unread badge is updated — no page refresh is needed.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I delete a message?</button>
                        <div class="faq-answer">
                            <p>Open the message by clicking it in the Inbox, then click the <strong>Delete</strong> button in the message overlay. The message is removed from your view only — other recipients are not affected. Sent messages cannot be deleted from your Sent list, only from the recipient's Inbox.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">When is a message marked as read?</button>
                        <div class="faq-answer">
                            <p>A message is marked as read when you <strong>close its overlay</strong> after opening it. Simply viewing it updates the read state on the server so the unread highlight and badge count are refreshed.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Shared Chats ── -->
            <div class="faq-category" data-category="shared-chats">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><line x1="9" y1="10" x2="15" y2="10"></line><line x1="12" y1="7" x2="12" y2="13"></line></svg>
                        Shared Chats
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What is a Shared Chat?</button>
                        <div class="faq-answer">
                            <p>A <strong>Shared Chat</strong> is a multi-participant conversation room where you and your invited colleagues can all send messages to <strong>Boudica</strong> together and see each other's exchanges in real time. Unlike direct messages, everyone in the room sees the full conversation including Boudica's responses.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I create a Shared Chat?</button>
                        <div class="faq-answer">
                            <p>Expand the <strong>Collaboration → Shared</strong> sub-section in the sidebar and click the <strong>+</strong> button. A dialog opens where you enter a <em>Chat Title</em> and optionally add participants. Click <strong>Create Chat</strong>. The new chat immediately appears in the Shared list and you can open it straight away.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I invite someone to an existing Shared Chat?</button>
                        <div class="faq-answer">
                            <p>Open the Shared Chat panel and click the <strong>+ Invite</strong> button in the panel header. Enter the user's ID in the dialog and click <strong>Invite</strong>. They will immediately be able to see and join the chat — you do not need to recreate it.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I send a message in a Shared Chat?</button>
                        <div class="faq-answer">
                            <p>Type your message in the input bar at the bottom of the Shared Chat panel and press <kbd>Enter</kbd> or click the send button. Your message is sent to Boudica, which responds in the same thread. All participants see both your message and Boudica's reply as soon as they arrive.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What is a group note (@message)?</button>
                        <div class="faq-answer">
                            <p>If you start your message with <code>@</code> — for example <code>@Meeting at 3pm everyone</code> — it is sent as a <strong>group note</strong> rather than a prompt to Boudica. The note is saved to the chat and displayed as a centred announcement visible to all participants. Boudica is <em>not</em> invoked and no AI response is generated. Use group notes to coordinate with your team without polluting the AI conversation.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Do I see messages from other participants in real time?</button>
                        <div class="faq-answer">
                            <p>Yes. The Shared Chat panel polls for new messages every <strong>10 seconds</strong> while it is open. New messages from other participants slide in automatically with a brief highlight flash — no manual refresh is needed.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I delete a Shared Chat?</button>
                        <div class="faq-answer">
                            <p>Only the <strong>owner</strong> (the person who created the chat) can delete it. Hover over the chat entry in the sidebar — a red <strong>×</strong> delete button appears on the right. Click it and confirm the deletion. This removes the chat and all its messages permanently for all participants and cannot be undone.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Who can see a Shared Chat?</button>
                        <div class="faq-answer">
                            <p>Only the owner and the participants explicitly invited to the chat can see it. It does not appear in the sidebar for users who have not been added. The owner's account is automatically included as a participant.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Appearance & Accessibility ── -->
            <div class="faq-category" data-category="appearance">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        Appearance &amp; Accessibility
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">How do I switch between light and dark mode?</button>
                        <div class="faq-answer">
                            <p>Use the <strong>moon/sun toggle switch</strong> in the top-right of the chat header, or press <kbd>Ctrl + Shift + D</kbd> (Windows/Linux) / <kbd>⌘ + Shift + D</kbd> (Mac). Your preference is saved and applied on your next visit.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What is High Contrast mode?</button>
                        <div class="faq-answer">
                            <p><strong>High Contrast</strong> mode increases foreground/background contrast ratios throughout the interface to improve readability for users with visual impairments. Toggle it with the contrast icon in the header or press <kbd>Ctrl + Shift + H</kbd>.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can I hide the sidebar?</button>
                        <div class="faq-answer">
                            <p>Yes. Click the <strong>hamburger menu icon</strong> (three lines) at the top-left of the chat header to toggle the sidebar. This gives more screen space to the conversation area.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What keyboard shortcuts are available?</button>
                        <div class="faq-answer">
                            <table class="faq-shortcuts-table">
                                <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
                                <tbody>
                                    <tr><td><kbd>Enter</kbd></td><td>Send message</td></tr>
                                    <tr><td><kbd>Shift + Enter</kbd></td><td>New line in message</td></tr>
                                    <tr><td><kbd>Ctrl + Shift + D</kbd></td><td>Toggle dark mode</td></tr>
                                    <tr><td><kbd>Ctrl + Shift + H</kbd></td><td>Toggle high contrast</td></tr>
                                    <tr><td><kbd>Ctrl + Enter</kbd></td><td>Save Rule (when in the Rule editor)</td></tr>
                                    <tr><td><kbd>Escape</kbd></td><td>Close any open overlay or panel</td></tr>
                                </tbody>
                            </table>
                            <p class="faq-note">On Mac, substitute <kbd>⌘</kbd> for <kbd>Ctrl</kbd>.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Privacy & Security ── -->
            <div class="faq-category" data-category="privacy">
                <button class="faq-category-header" aria-expanded="false">
                    <span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                        Privacy &amp; Security
                    </span>
                    <svg class="faq-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="faq-category-body" hidden>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Is Boudica air-gapped?</button>
                        <div class="faq-answer">
                            <p>Yes. The Boudica Torc inference engine runs entirely on your organisation's own infrastructure. <strong>No data is sent to external cloud services</strong> — not to OpenAI, Google, Microsoft, or any other third party. All processing happens on-premises, making it suitable for sensitive and classified information.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Who can see my conversations?</button>
                        <div class="faq-answer">
                            <p>Conversations are associated with your authenticated user account and are stored in the server database. Access to the database is restricted to authorised administrators. Normal users cannot read each other's conversations. Use the <strong>Private</strong> checkbox to flag messages that should be excluded from usage audit logs.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">What is content safety?</button>
                        <div class="faq-answer">
                            <p>Boudica includes a <strong>content safety layer</strong> that screens prompts and responses for harmful, policy-violating, or injection-attack content. If a message is flagged you will see a content safety alert. The safety rules are configured by your system administrator.</p>
                        </div>
                    </div>
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">Can Boudica be compromised by malicious content in documents?</button>
                        <div class="faq-answer">
                            <p>Boudica includes <strong>prompt injection detection</strong> to identify attempts by malicious content inside attached documents to override your instructions or the system's behaviour. Suspicious patterns are flagged and blocked before reaching the model. Always exercise caution when attaching documents from untrusted sources.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="faq-no-results hidden" id="faqNoResults">No questions match your search.</div>

        </div><!-- /.faq-body -->
    </div><!-- /.faq-modal -->
</div><!-- /#faqOverlay -->

<!-- ── Connected Services Overlay ───────────────────────────────────────── -->
<div id="servicesOverlay" class="services-overlay hidden" role="dialog" aria-modal="true" aria-label="Connected Services">
    <div class="services-overlay-backdrop"></div>
    <div class="services-overlay-panel">
        <div class="services-overlay-header">
            <div class="services-overlay-title-row">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22V12"/><path d="M5 12H19"/>
                    <path d="M8 12V6a2 2 0 0 1 4 0v6"/><path d="M12 12V6a2 2 0 0 1 4 0v6"/>
                    <path d="M9 16a3 3 0 0 0 6 0"/>
                </svg>
                <h2>Connected Services</h2>
                <span id="servicesCountLabel" class="services-count-label"></span>
            </div>
            <div class="services-overlay-header-actions">
                <button id="servicesRefreshBtn" class="btn btn-icon" title="Refresh">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                </button>
                <button id="servicesCloseBtn" class="btn btn-icon" title="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="services-overlay-body">
            <div class="services-list" id="servicesList">
                <!-- Populated by services.js -->
            </div>
        </div>
    </div>
</div>

<!-- ── Knowledge Base Overlay ──────────────────────────────────────────── -->
<div id="knowledgeBaseOverlay" class="services-overlay hidden" role="dialog" aria-modal="true" aria-label="Knowledge Base">
    <div class="services-overlay-backdrop"></div>
    <div class="services-overlay-panel kb-overlay-panel">
        <div class="services-overlay-header">
            <div class="services-overlay-title-row">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    <line x1="9" y1="7" x2="15" y2="7"/>
                    <line x1="9" y1="11" x2="15" y2="11"/>
                </svg>
                <h2>Knowledge Base</h2>
            </div>
            <div class="services-overlay-header-actions">
                <button id="kbCloseBtn" class="btn btn-icon" title="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="services-overlay-body">
            <div class="rag-body open" id="ragUploadPanel">

                <!-- Drop zone -->
                <div class="rag-drop-zone" id="ragDropZone">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;opacity:0.55"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Drop files here, or use buttons below
                </div>

                <!-- Files upload here, into whichever folder is currently open (see
                     breadcrumb below) - not a separately-typed path. -->
                <div class="rag-upload-hint" id="ragUploadHint">
                    Uploads go into the folder you're currently viewing. Folder names
                    <code>public</code>, <code>confidential</code>, <code>restricted</code>,
                    <code>internal</code>, <code>departments/&lt;name&gt;</code> and
                    <code>roles/&lt;name&gt;</code> control who can see their contents;
                    anything else is private until explicitly shared.
                </div>

                <!-- Action buttons -->
                <div class="rag-actions">
                    <button id="ragUploadBtn" class="btn btn-sm btn-secondary" title="Upload files into the current folder">
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" style="margin-right:4px"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        Files
                    </button>
                    <button id="ragUploadFolderBtn" class="btn btn-sm btn-secondary" title="Upload a folder (preserves structure) into the current folder">
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" style="margin-right:4px"><path d="M2 6.5C2 5.67 2.67 5 3.5 5h5l2 2h6a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16.5 17h-13A1.5 1.5 0 0 1 2 15.5v-9z" stroke="currentColor" stroke-width="1.5"/></svg>
                        Folder
                    </button>
                    <button id="ragNewFolderBtn" class="btn btn-sm btn-secondary" title="Create a new folder in the current location">
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" style="margin-right:4px"><path d="M2 6.5C2 5.67 2.67 5 3.5 5h5l2 2h6a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16.5 17h-13A1.5 1.5 0 0 1 2 15.5v-9z" stroke="currentColor" stroke-width="1.5"/><path d="M10 9.5v4M8 11.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                        New Folder
                    </button>
                </div>

                <!-- Hidden file inputs -->
                <input type="file" id="ragFilePicker" multiple style="display:none" accept="*/*">
                <input type="file" id="ragFolderPicker" multiple webkitdirectory style="display:none">

                <!-- Spinner -->
                <div class="rag-spinner hidden" id="ragSpinner"></div>

                <!-- Status message -->
                <div class="rag-status hidden" id="ragStatusMsg"></div>

                <!-- Toolbar: breadcrumb + refresh -->
                <div class="rag-toolbar">
                    <div class="rag-breadcrumb" id="ragBreadcrumb"></div>
                    <button class="rag-refresh-btn" id="ragRefreshBtn" title="Refresh">
                        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M17 10A7 7 0 1 1 10 3a7 7 0 0 1 5 2.1M17 3v4h-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>

                <!-- File tree -->
                <div class="rag-file-tree" id="ragFileTree"></div>

            </div>

            <!-- Drop-to-chat zone: appears during a file drag inside the KB overlay -->
            <div id="ragChatDropZone" class="rag-chat-drop-zone">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 10h14M10 3l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Drop to insert into chat
            </div>

        </div>
    </div>
</div>

<!-- ── File Manager (non-modal floating window, not an overlay) ────────── -->
<div id="fileManagerWindow" class="fm-floating-window hidden">
    <div class="fm-floating-titlebar" id="fmFloatingTitlebar">
        <span class="fm-floating-title">File Manager</span>
        <button id="fmFloatingCloseBtn" class="fm-floating-close" title="Close" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    </div>
    <iframe id="fmFloatingFrame" class="fm-floating-iframe" title="File Manager" src="about:blank"></iframe>
    <div class="fm-floating-resize-handle" id="fmFloatingResizeHandle"></div>
</div>

<!-- ── Agents Overlay ─────────────────────────────────────────────────── -->
<div id="agentsOverlay" class="services-overlay hidden" role="dialog" aria-modal="true" aria-label="Agents">
    <div class="services-overlay-backdrop" id="agentsOverlayBackdrop"></div>
    <div class="services-overlay-panel agents-overlay-panel">
        <div class="services-overlay-header">
            <div class="services-overlay-title-row">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/>
                </svg>
                <h2>Agents</h2>
                <span id="agentsCountLabel" class="services-count-label hidden"></span>
            </div>
            <div class="services-overlay-header-actions">
                <button id="agentsCloseBtn" class="btn btn-icon" title="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="services-overlay-body">
            <!-- ── Tile view (default) ───────────────────────────────── -->
            <div id="agentTileView">
                <p class="agents-overlay-hint">Click an agent to activate it in the chat.</p>

                <!-- Shared agents section -->
                <div class="agent-section">
                    <div class="agent-section-header">
                        <span class="agent-section-title">Organizational Agents</span>
                    </div>
                    <div id="agentSharedGrid" class="agent-tiles-grid">
                        <span class="agents-loading">Loading agents…</span>
                    </div>
                </div>

                <!-- My agents section -->
                <div class="agent-section">
                    <div class="agent-section-header">
                        <span class="agent-section-title">My Agents</span>
                        <button id="agentCreateBtn" class="btn btn-sm btn-primary agent-create-btn" title="Create a new private agent">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Create Agent
                        </button>
                    </div>
                    <div id="agentPrivateGrid" class="agent-tiles-grid">
                        <span class="agents-empty-private">You have no private agents yet.</span>
                    </div>
                </div>
            </div>

            <!-- ── Builder form (shown when creating/editing a private agent) ── -->
            <div id="agentBuilderPanel" class="agent-builder-panel hidden">
                <div class="agent-builder-header">
                    <button id="agentBuilderBackBtn" class="btn btn-icon agent-builder-back-btn" title="Back to agents">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15,18 9,12 15,6"/>
                        </svg>
                    </button>
                    <span id="agentBuilderTitle" class="agent-builder-title">Create Agent</span>
                </div>

                <input type="hidden" id="agentBuilderId" value="0"/>

                <div class="agent-builder-field">
                    <label for="agentBuilderName" class="agent-builder-label">Agent name <span class="agent-builder-hint">(used as @name, no spaces)</span></label>
                    <input id="agentBuilderName" type="text" class="agent-builder-input" placeholder="e.g. my_agent" maxlength="64"/>
                </div>
                <div class="agent-builder-field">
                    <label for="agentBuilderDisplayName" class="agent-builder-label">Display name</label>
                    <input id="agentBuilderDisplayName" type="text" class="agent-builder-input" placeholder="e.g. My Agent" maxlength="120"/>
                </div>
                <div class="agent-builder-field">
                    <label for="agentBuilderDescription" class="agent-builder-label">Description</label>
                    <input id="agentBuilderDescription" type="text" class="agent-builder-input" placeholder="What does this agent do?" maxlength="300"/>
                </div>

                <div class="agent-builder-steps-header">
                    <span class="agent-builder-label">Steps</span>
                    <button id="agentBuilderAddStep" class="btn btn-sm btn-secondary agent-builder-add-step-btn">+ Add Step</button>
                </div>
                <div id="agentBuilderStepsList" class="agent-builder-steps-list">
                    <!-- Step rows rendered by JS (addBuilderStepRow) -->
                </div>

                <div id="agentBuilderError" class="agent-builder-error hidden"></div>

                <div class="agent-builder-actions">
                    <button id="agentBuilderCancelBtn" class="btn btn-sm btn-secondary">Cancel</button>
                    <button id="agentBuilderSaveBtn" class="btn btn-sm btn-primary">Save Agent</button>
                </div>
            </div>

            <!-- Input dialog — shown over the tile grid when an agent needs user input -->
            <div id="agentInputDialog" class="agent-input-dialog hidden" role="dialog" aria-modal="true" aria-label="Agent input">
                <div class="agent-input-dialog-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/>
                    </svg>
                    <span id="agentInputDialogName" class="agent-input-dialog-name"></span>
                </div>
                <p id="agentInputDialogHint" class="agent-input-dialog-hint"></p>
                <textarea id="agentInputDialogText"
                          class="agent-input-dialog-textarea"
                          rows="3"
                          placeholder="Type your input for this agent…"
                          aria-label="Agent input"></textarea>
                <div class="agent-input-dialog-actions">
                    <button id="agentInputCancelBtn" class="btn btn-sm btn-secondary">Cancel</button>
                    <button id="agentInputRunBtn" class="btn btn-sm btn-primary">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polygon points="5,3 19,12 5,21"/>
                        </svg>
                        Run Agent
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- ── New Shared Chat Modal ──────────────────────────────────────────── -->
<div id="newSharedChatOverlay" class="sc-new-overlay hidden" role="dialog" aria-modal="true" aria-label="New Shared Chat">
    <div class="sc-new-modal">
        <div class="sc-new-header">
            <span>New Shared Chat</span>
            <button class="btn btn-icon sc-new-close" id="scNewCloseBtn" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
        <div class="sc-new-body">
            <label for="scNewTitle">Title</label>
            <input type="text" id="scNewTitle" class="sc-new-input" placeholder="e.g. Presentation planning" maxlength="200" />

            <label for="scNewParticipantInput">Add participants</label>
            <div class="sc-new-participants-row">
                <input type="text" id="scNewParticipantInput" class="sc-new-input" placeholder="Username or user ID" autocomplete="off" />
                <button id="scNewAddParticipantBtn" class="btn btn-sm">Add</button>
            </div>
            <div id="scNewParticipantTags" class="sc-tag-list"></div>
        </div>
        <div class="sc-new-footer">
            <button id="scNewCancelBtn" class="btn btn-outline">Cancel</button>
            <button id="scNewCreateBtn" class="btn btn-primary">Create Chat</button>
        </div>
    </div>
</div><!-- /#newSharedChatOverlay -->

<!-- ── Invite User Modal ──────────────────────────────────────────────── -->
<div id="scInviteOverlay" class="sc-new-overlay hidden" role="dialog" aria-modal="true" aria-label="Invite User">
    <div class="sc-new-modal">
        <div class="sc-new-header">
            <span>Invite to Shared Chat</span>
            <button class="btn btn-icon sc-new-close" id="scInviteCloseBtn" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
        <div class="sc-new-body">
            <label for="scInviteInput">User to invite</label>
            <input type="text" id="scInviteInput" class="sc-new-input" placeholder="Username or user ID" autocomplete="off" />
        </div>
        <div class="sc-new-footer">
            <button id="scInviteCancelBtn" class="btn btn-outline">Cancel</button>
            <button id="scInviteConfirmBtn" class="btn btn-primary">Invite</button>
        </div>
    </div>
</div><!-- /#scInviteOverlay -->

<!-- Idle overlay -->
<div id="idleOverlay" class="idle-overlay hidden" role="status" aria-live="polite">
    <div class="idle-overlay-box">
        <!-- Absolute path, not "img/...": this app lives under custom_apps,
             which config.php's apps_paths maps to URL prefix /custom_apps,
             not /apps - a bare relative path resolves against the current
             page's /apps/boudicaai/... URL and 404s (confirmed 2026-09-05). -->
        <img src="/custom_apps/boudicaai/img/boudi_bot.png" alt="Boudica" class="idle-bot-image">
        <div class="idle-overlay-text">
            <p class="idle-greeting">Hey <span id="idleUserName">there</span>,</p>
            <p class="idle-message">I am here waiting for your call to action</p>
        </div>
    </div>
</div>

</div><!-- /#boudicaai -->
