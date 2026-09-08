/**
 * Main Application Module
 * Initializes and coordinates all components
 */

// Global application state
let app = {
    auth: null,
    storage: null,
    ui: null,
    api: null,
    scheduler: null,
    documentHandler: null,
    audioTranscription: null,  // Audio transcription service
    settingsSyncEnabled: false,
    settingsSyncTimer: null
};

function applyRemoteUserSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        return;
    }

    if (Array.isArray(settings.actions)) {
        localStorage.setItem(app.storage.scheduledActionsKey, JSON.stringify(settings.actions));
    }

    if (Array.isArray(settings.folders)) {
        localStorage.setItem(app.storage.foldersKey, JSON.stringify(settings.folders));
    }

    if (Array.isArray(settings.chats)) {
        localStorage.setItem(app.storage.storageKey, JSON.stringify(settings.chats));
    }

    if (Array.isArray(settings.rules)) {
        localStorage.setItem(app.storage.rulesKey, JSON.stringify(settings.rules));
    }

    if (typeof settings.current_chat_id === 'string' && settings.current_chat_id.trim().length > 0) {
        localStorage.setItem(app.storage.currentChatKey, settings.current_chat_id);
    }
}

function queueUserSettingsSync(reason = 'unknown') {
    if (!app.settingsSyncEnabled || !app.storage || !app.api) {
        return;
    }

    if (app.settingsSyncTimer) {
        clearTimeout(app.settingsSyncTimer);
    }

    app.settingsSyncTimer = setTimeout(async () => {
        try {
            const snapshot = app.storage.getUserSettingsSnapshot();
            await app.api.saveUserSettings(snapshot);
            console.log(`User settings synced (${reason})`);
        } catch (error) {
            console.warn('Failed to sync user settings:', error);
        }
    }, 250);
}

/**
 * Initialize the application
 */
async function initializeApp() {
    try {
        console.log('Initializing Boudica Chat Interface...');
        
        // Initialize storage
        app.storage = new ChatStorage();
        if (!app.storage.id) {
            app.storage.createNewChat();
            console.log('Creating a new chat session with ID:', app.storage.id);
        }
        
        // Initialize authentication
        app.auth = new SAMLAuthenticator();
        
        // // Set up auth callbacks
        app.auth.onSuccess = handleAuthSuccess;
        app.auth.onError = handleAuthError;
        app.auth.onLogout = handleLogout;
        
        // Initialize API
        app.api = new ChatAPI(app.auth);

        // Watch local settings changes and persist them server-side.
        app.storage.setSettingsChangeListener((_snapshot, reason) => {
            queueUserSettingsSync(reason);
        });
        
        // Initialize UI (pass api for rating functionality)
        app.ui = new ChatUI(app.storage, app.api);
        
        // Initialize scheduler (if available)
        if (typeof Scheduler !== 'undefined') {
            app.scheduler = new Scheduler(app.storage, app.api);
            console.log('Scheduler initialized');
        } else {
            console.warn('Scheduler not available');
        }
        
        // Initialize document handler
        app.documentHandler = new DocumentHandler();
        console.log('Document handler initialized');
        
        // Initialize audio transcription service
        if (typeof AudioTranscription !== 'undefined') {
            app.audioTranscription = new AudioTranscription('https://myboudica.com/whisper');
            console.log('Audio transcription service initialized');
        } else {
            console.warn('AudioTranscription module not available');
        }
        
        // Set up attach button
        setupAttachButton();

        // Set up slash command / rule picker
        setupSlashMenu();
        
        // Set up UI callback for sending messages
        app.ui.onSendMessage = handleSendMessage;
        
        // Set up logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                app.auth.logout();
            });
        }
        
        // Set up UI scaffolding (pure DOM wiring — safe before auth completes)
        setupActionsToggle();
        setupCollaborationToggles();
        setupComposeOverlay();
        setupMessageViewOverlay();
        setupFaq();
        setupSharedChats();
        setupRuleOverlay();

        // Start authentication.
        // All data-loading (loadCollaborationUsers, loadInboxItems, loadSentItems,
        // loadRules, startInboxPolling, startSharedInvitePolling) is triggered by
        // handleAuthSuccess once the user identity is confirmed — do NOT call them
        // here to avoid double-firing and "user_id missing" errors on fresh logins.
        await app.auth.init();
        if ( app.auth.authenticated ) {
            console.log('User is authenticated, proceeding with app initialization...');
            handleAuthSuccess(app.auth.user);
        } else {
            console.warn('User is not authenticated, waiting for login...');
        }
        
    } catch (error) {
        console.error('Application initialization failed:', error);
        showCriticalError(error);
    }
}

/**
 * Handle successful authentication
 */
async function handleAuthSuccess(user) {
     const sessionData = localStorage.getItem('boudica_session');

     if ( sessionData) {
        const session = JSON.parse(sessionData);
        // Check to see if we have an API key
        if ( !session.token && !session.user) {
            console.warn('No API key or user data found in session, cannot proceed.');
            return;
        }

        // Namespace all localStorage keys under this user's ID so that two
        // accounts sharing the same browser never see each other's data.
        const userId = session.user.email || '';
        app.storage.setUserId(session.user.email);

        // Show chat interface immediately using local state so the send button is
        // live without waiting for the network round-trip.
        app.ui.showChatInterface(user);

        // Perform health check (non-blocking)
        app.api.healthCheck().then(healthy => {
            if (!healthy) {
                console.warn('Backend API health check failed');
                showWarning('The chat service may be unavailable. Please contact your administrator.');
            }
        });

        // Check for a scheduled maintenance restart (non-blocking) - see
        // showMaintenanceBanner()'s comment below and chat-api.js's
        // getMaintenanceStatus(). Checked once per login, matching "banner push
        // to all users when they logged in" rather than continuous polling.
        app.api.getMaintenanceStatus().then(data => {
            if (data) {
                showMaintenanceBanner(data);
            }
        });

        // Load remote settings in the background.  Apply them and refresh the UI
        // only if there is actually something to restore, then enable ongoing sync.
        try {
            const remoteSettings = await app.api.loadUserSettings();
            if (remoteSettings) {
                applyRemoteUserSettings(remoteSettings);
                // Re-render chat history and reload the now-correct current chat.
                app.ui.loadChatHistory();
                const restoredChatId = app.storage.getCurrentChatId();
                if (restoredChatId) {
                    app.ui.loadChat(restoredChatId);
                }
            }
        } catch (error) {
            console.warn('Failed to load remote user settings:', error);
        }

        // Load all user-scoped data now that identity is confirmed.
        // These are called here (and only here) — initializeApp() must NOT call
        // them directly to avoid double-firing with a missing user_id.
        loadRules();
        loadCollaborationUsers();
        loadInboxItems().then(startInboxPolling);
        loadSentItems();
        startSharedInvitePolling();
        // loadSharedChatsList() was the one exception to the rule above -
        // setupSharedChats() (called from initializeApp(), before auth
        // resolves) used to call it directly and unconditionally, firing
        // "GET /shared_chats?user_id=anonymous" (403) on every page load
        // before checkExistingSession() had a chance to populate identity.
        // Belongs here with the rest of the auth-gated loads instead.
        loadSharedChatsList();

        // Enable save-on-change only after the initial remote load has completed
        // so the first write back to the DB is not premature.
        app.settingsSyncEnabled = true;
    }
}

/**
 * Handle authentication error
 */
function handleAuthError(error) {
    console.error('Authentication error:', error);
    
    const authStatus = document.getElementById('authStatus');
    const authError = document.getElementById('authError');
    
    if (authStatus) {
        authStatus.classList.add('hidden');
    }
    
    if (authError) {
        authError.classList.remove('hidden');
        const errorMessage = authError.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.textContent = error.message || 'Authentication failed. Please try again.';
        }
        
        // Set up retry button — use retryAuthentication() rather than
        // window.location.reload() so that:
        //  1. All stale PKCE / session state is cleared before the new attempt
        //  2. Keycloak is asked for a fresh login (prompt=login) so the user
        //     can enter different credentials instead of being silently
        //     re-authenticated as the same denied account.
        const retryBtn = document.getElementById('retryAuth');
        if (retryBtn) {
            retryBtn.onclick = () => {
                app.auth.retryAuthentication();
            };
        }
    }
}

/**
 * Handle logout
 */
function handleLogout() {
    console.log('User logged out');
    stopInboxPolling();
    stopSharedChatPolling();
    stopSharedInvitePolling();
    // Page will reload automatically from auth.logout()
}

/**
 * Translate a raw API/server error message into a user-friendly chat response.
 * Strips ODBC error codes and SQL internals, and appends actionable suggestions.
 */
function friendlyApiError(msg) {
    if (!msg) return 'An unexpected error occurred. Please try again.';

    // Unwrap nested wrappers first (recurse)
    let m;

    m = msg.match(/^Streaming error:\s*Error:\s*([\s\S]+)/i);
    if (m) return friendlyApiError(m[1].trim());

    m = msg.match(/External SQL (?:execution|validation) failed:\s*([\s\S]+)/i);
    if (m) return friendlyApiError(m[1].trim());

    // ODBC prefix — extract just the PostgreSQL ERROR text
    m = msg.match(/ODBC query failed:\s*\[[^\]]+\]\s*ERROR:\s*([\s\S]+)/i);
    if (m) return friendlyApiError(m[1].trim());

    // Column does not exist
    m = msg.match(/column ["']?([^"',\s]+)["']? does not exist/i);
    if (m) return (
        `I couldn't find a column called **${m[1]}** in your data.\n\n` +
        `Check the column names in your file and rephrase your request ` +
        `using an exact column name from the data.`
    );

    // Relation / table does not exist
    m = msg.match(/relation "([^"]+)" does not exist/i);
    if (m) return (
        `The data table **${m[1]}** could not be found. ` +
        `Your uploaded file may not have been processed yet — please try uploading it again.`
    );

    // Numeric cast failure
    m = msg.match(/invalid input syntax for type numeric[:\s]+"([^"]+)"/i);
    if (m) {
        const badVal = m[1];
        let detail = `The value **"${badVal}"** could not be converted to a number.`;
        if (badVal.includes('|'))
            detail += ' This column appears to contain multiple pipe-separated values in one cell.';
        else if (badVal.includes(';'))
            detail += ' This column appears to contain semicolon-separated values in one cell.';
        else if (/[£$€₹¥]/.test(badVal))
            detail += ' The column contains a currency symbol that prevented the conversion.';
        else if (badVal.includes(','))
            detail += ' The number uses comma formatting (e.g. 13,999).';
        return (
            detail + '\n\n' +
            `Try rephrasing your request — for example, ask to **list** ` +
            `the values rather than **sum** or **total** them.`
        );
    }

    // Ambiguous column (GROUP BY issue etc.)
    m = msg.match(/column reference "([^"]+)" is ambiguous/i);
    if (m) return (
        `The column **${m[1]}** is ambiguous in this query. ` +
        `Try being more specific about which table or field you mean.`
    );

    // Divide by zero
    if (/division by zero/i.test(msg))
        return 'The query resulted in a division by zero. Your data may contain zero values in a field used as a denominator.';

    // No rows / empty result — not really an error but sometimes surfaces as one
    if (/no rows|0 rows/i.test(msg))
        return 'The query returned no results. The data may not contain what you are looking for — try adjusting your request.';

    // Fallback — show the cleaned message as-is with a soft suggestion
    return `${msg}\n\nIf the problem persists, try rephrasing your request or check that your data contains the fields you are asking about.`;
}

/**
 * Audio file detection and transcription helpers
 */

/**
 * Check if a file is an audio file
 * @param {Object} fileItem - File object with {file, name} properties
 * @returns {boolean}
 */
function isAudioFile(fileItem) {
    const audioExtensions = ['wav', 'mp3', 'm4a', 'ogg', 'flac', 'aac', 'webm', 'opus'];
    const fileName = fileItem.name.toLowerCase();
    const ext = fileName.split('.').pop();
    return audioExtensions.includes(ext);
}

/**
 * Transcribe audio file and create a text file with the transcript
 * @param {Object} fileItem - File object with {file, name} properties
 * @returns {Promise<Object>} - New file item with transcript text
 */
async function transcribeAudioFile(fileItem) {
    if (!app.audioTranscription) {
        console.warn('Audio transcription service not available, skipping audio file');
        return fileItem;
    }

    try {
        console.log(`Transcribing audio file: ${fileItem.name}`);
        
        // Show transcription status in UI
        const statusEl = document.getElementById('chatMessages');
        if (statusEl) {
            const statusMsg = document.createElement('div');
            statusMsg.className = 'transcription-status';
            statusMsg.textContent = `🎤 Transcribing: ${fileItem.name}...`;
            statusMsg.style.cssText = 'padding: 10px; background: #e3f2fd; color: #1565c0; border-radius: 4px; margin: 10px; font-size: 12px;';
            statusEl.appendChild(statusMsg);
        }

        // Transcribe the file
        const result = await app.audioTranscription.transcribeFile(fileItem.file);

        // Remove status message
        const statusMsgs = document.querySelectorAll('.transcription-status');
        statusMsgs.forEach(msg => msg.remove());

        // Create a text file with the transcript
        const transcriptFileName = fileItem.name.replace(/\.[^.]+$/, '_transcript.txt');
        const transcriptContent = `Audio Transcript: ${fileItem.name}
Language: ${result.language}
Detected from: ${new Date().toLocaleString()}

---

${result.transcript}`;

        // Create a new Blob from the transcript
        const transcriptBlob = new Blob([transcriptContent], { type: 'text/plain' });
        const transcriptFile = new File([transcriptBlob], transcriptFileName, { type: 'text/plain' });

        // Return the transcript as a text file instead of the audio file
        return {
            file: transcriptFile,
            name: transcriptFileName,
            wasAudio: true,
            originalAudioFile: fileItem.name
        };

    } catch (error) {
        console.error(`Failed to transcribe ${fileItem.name}:`, error);
        
        // Remove status message
        const statusMsgs = document.querySelectorAll('.transcription-status');
        statusMsgs.forEach(msg => msg.remove());
        
        // Show error
        const errorEl = document.getElementById('chatMessages');
        if (errorEl) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'transcription-error';
            errorMsg.textContent = `❌ Failed to transcribe ${fileItem.name}: ${error.message}`;
            errorMsg.style.cssText = 'padding: 10px; background: #ffebee; color: #c62828; border-radius: 4px; margin: 10px; font-size: 12px;';
            errorEl.appendChild(errorMsg);
            setTimeout(() => errorMsg.remove(), 5000);
        }
        
        // Return original file if transcription fails
        return fileItem;
    }
}

/**
 * Process files and transcribe any audio files
 * @param {Array} queuedFiles - Array of file objects
 * @returns {Promise<Array>} - Array of processed files (audio files replaced with transcripts)
 */
async function processAudioFiles(queuedFiles) {
    if (!queuedFiles || queuedFiles.length === 0) {
        return queuedFiles;
    }

    // Check if any files are audio
    const hasAudio = queuedFiles.some(f => isAudioFile(f));
    if (!hasAudio) {
        return queuedFiles;
    }

    console.log('Processing files - transcribing audio files...');

    // Process each file
    const processedFiles = await Promise.all(
        queuedFiles.map(fileItem => {
            if (isAudioFile(fileItem)) {
                return transcribeAudioFile(fileItem);
            }
            return Promise.resolve(fileItem);
        })
    );

    return processedFiles;
}

/**
 * Handle sending a message
 */
async function handleSendMessage(chatId, message) {
    try {
        // Check for built-in slash commands before anything else
        if (await handleSlashCommand(chatId, message)) return;

        // Check if scheduler is initialized and if this is a scheduled action
        if (app.scheduler) {
            try {
                const scheduledPrompt = app.scheduler.parseScheduledPrompt(message);
                if (scheduledPrompt) {
                    // This is a scheduled action - save it but DON'T send to server or add to chat
                    app.scheduler.addAction(scheduledPrompt.prompt, scheduledPrompt.scheduleText);
                    
                    // Show brief success notification
                    showSuccess(`Action scheduled: "${scheduledPrompt.prompt}" ${scheduledPrompt.scheduleText}`);
                    
                    return; // Don't execute or add to chat
                }
            } catch (schedError) {
                console.error('Error processing scheduled action:', schedError);
                // Continue with normal message sending if scheduling fails
            }
        }
        
        // This is a normal message - create user message and add to chat
        const userMessage = {
            role: 'user',
            content: message
        };
        
        // Add to storage
        app.storage.addMessage(chatId, userMessage);
        
        // Display message
        app.ui.displayMessage(userMessage);
        
        // Update chat history
        app.ui.loadChatHistory();
        
        // Prepare files: JSON files are converted to text and appended
        // directly to the prompt; all other files go via multipart upload.
        let queuedFiles = [];
        let effectiveMessage = expandRulesInMessage(message);
        effectiveMessage = appendChartFormatHint(effectiveMessage);
        if (app.documentHandler) {
            const { files, inlineText } = await app.documentHandler.prepareUpload();
            queuedFiles = files;
            if (inlineText) {
                effectiveMessage = `${effectiveMessage}\n\n${inlineText}`;
            }
        }
        
        // Process audio files: transcribe any audio files to text
        // This intercepts audio uploads and converts them to transcripts
        if (queuedFiles.length > 0) {
            queuedFiles = await processAudioFiles(queuedFiles);
        }
        
        // Show typing indicator
        const typingIndicator = app.ui.showTypingIndicator();
        
        // Send message to API with streaming (and files if any)
        let assistantMessage = null;
        let messageId = null;
        
        const response = await app.api.sendMessage(
            chatId,
            effectiveMessage,
            (content, isDone, auditId, thinking, liveThinking, statusMessage) => {
                // Stream callback
                if (!messageId) {
                    // First chunk - server has received the prompt; stop the race line.
                    // A status/thinking_start event fires this too (before any answer
                    // text exists yet), so the bubble - and a visible status line or
                    // "Thinking..." panel - appears the moment the workflow starts,
                    // not only once the full answer is ready. Without this, long
                    // agentic/multi-task prompts show no activity at all until
                    // everything is done, which reads as hung.
                    app.ui.stopRaceLine();
                    app.ui.removeTypingIndicator();
                    assistantMessage = {
                        role: 'assistant',
                        content: content
                    };
                    const savedMessage = app.storage.addMessage(chatId, assistantMessage);
                    messageId = savedMessage.id;
                    app.ui.displayMessage(savedMessage);
                    // Activate the loading indicator on the new message
                    app.ui.showWorkingIndicator();
                    if (statusMessage) {
                        app.ui.updateAgenticStatus(messageId, statusMessage);
                    }
                    if (liveThinking) {
                        app.ui.updateLiveThinking(messageId, liveThinking.active, liveThinking.text);
                    }
                } else {
                    // Update UI immediately on every token, but only persist to
                    // localStorage when the stream is done (avoids serialising the
                    // full chat history on every single token \u2014 a major source of
                    // GC pressure on long responses).
                    if (isDone) {
                        app.storage.updateMessage(chatId, messageId, { content: content, thinking: thinking || null });
                    }
                    if (statusMessage) {
                        app.ui.updateAgenticStatus(messageId, statusMessage);
                    }
                    if (liveThinking) {
                        app.ui.updateLiveThinking(messageId, liveThinking.active, liveThinking.text);
                    }
                    app.ui.updateAssistantMessage(messageId, content, isDone, thinking);
                }
                
                if (isDone) {
                    // Update with audit_id if available
                    if (auditId) {
                        app.storage.updateMessage(chatId, messageId, { audit_id: auditId });
                        // Update UI element with audit_id
                        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
                        if (messageEl) {
                            messageEl.setAttribute('data-audit-id', auditId);
                        }
                    }
                    
                    // Streaming complete - hide working indicator
                    app.ui.hideWorkingIndicator();
                    // Update chat history
                    app.ui.loadChatHistory();
                    
                    // Clear uploaded documents after successful send
                    if (queuedFiles.length > 0) {
                        app.documentHandler.clearAfterSend();
                        displayUploadedDocuments();
                    }
                }
            },
            queuedFiles.length > 0 ? queuedFiles : null
        );
        
        // If not streaming (fallback)
        if (!messageId && response) {
            app.ui.removeTypingIndicatorComplete();
            const savedMessage = app.storage.addMessage(chatId, response);
            app.ui.displayMessage(savedMessage);
            app.ui.loadChatHistory();
            
            // Clear uploaded documents after successful send
            if (queuedFiles.length > 0) {
                app.documentHandler.clearAfterSend();
                displayUploadedDocuments();
            }
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        
        // Remove typing indicator and working indicator (including race line on error)
        app.ui.stopRaceLine();
        app.ui.removeTypingIndicatorComplete();
        
        // Check if this is a content safety violation
        if (error.message && error.message.includes('Content violates safety policies')) {
            showContentSafetyAlert();
            return; // Don't show generic error message
        }
        
        // Check if this is a domain-specific content rejection
        if (error.message && error.message.includes('Only Domain Specific External Content can be Analyzed')) {
            const errorMessage = {
                role: 'assistant',
                content: 'Your file does not contain domain specific data, and cannot be used.',
                timestamp: new Date().toISOString()
            };
            const savedMessage = app.storage.addMessage(chatId, errorMessage);
            app.ui.displayMessage(savedMessage);
            return;
        }
        
        // Show the actual error in the chat window so the user can act on it
        const errorMessage = {
            role: 'assistant',
            content: friendlyApiError(error.message),
            timestamp: new Date().toISOString()
        };
        
        const savedMessage = app.storage.addMessage(chatId, errorMessage);
        app.ui.displayMessage(savedMessage);
    }
}

/**
 * Set up attach button for document upload
 */
function setupAttachButton() {
    const attachBtn = document.getElementById('attachBtn');
    const fileInput = document.getElementById('fileInput');
    const uploadedDocuments = document.getElementById('uploadedDocuments');
    
    if (!attachBtn || !fileInput || !uploadedDocuments) {
        console.warn('Document upload elements not found');
        return;
    }
    
    // Click attach button to trigger file input
    attachBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Handle file selection
    fileInput.addEventListener('change', async () => {
        const files = fileInput.files;
        if (!files || files.length === 0) return;
        
        let successCount = 0;
        let errorCount = 0;
        
        // Add all selected files to queue
        for (const file of files) {
            try {
                // Add file to queue (does NOT upload yet)
                app.documentHandler.addFile(file);
                successCount++;
            } catch (error) {
                console.error(`Error adding document ${file.name}:`, error);
                showError(`${file.name}: ${error.message}`);
                errorCount++;
            }
        }
        
        // Display queued documents
        displayUploadedDocuments();
        
        if (successCount > 0) {
            const plural = successCount > 1 ? 's' : '';
            showSuccess(`${successCount} document${plural} added (will upload when you send)`);
        }
        
        // Reset file input
        fileInput.value = '';
    });

    // ── Drag-and-drop onto the input container ──────────────────────────
    const dropZone = document.querySelector('.chat-input-container');
    const dropOverlay = document.getElementById('dropOverlay');
    if (!dropZone) return;

    // Track nested dragenter/dragleave correctly
    let dragDepth = 0;

    // Only respond to drags that carry files
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

    dropZone.addEventListener('dragenter', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth++;
        if (dropOverlay) dropOverlay.classList.add('active');
        dropZone.classList.add('drop-hover');
    });

    dropZone.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    dropZone.addEventListener('dragleave', (e) => {
        if (!hasFiles(e)) return;
        dragDepth--;
        if (dragDepth <= 0) {
            dragDepth = 0;
            if (dropOverlay) dropOverlay.classList.remove('active');
            dropZone.classList.remove('drop-hover');
        }
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragDepth = 0;
        if (dropOverlay) dropOverlay.classList.remove('active');
        dropZone.classList.remove('drop-hover');

        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length === 0) return;

        let successCount = 0;
        for (const file of droppedFiles) {
            try {
                app.documentHandler.addFile(file);
                successCount++;
            } catch (error) {
                showError(`${file.name}: ${error.message}`);
            }
        }

        displayUploadedDocuments();

        if (successCount > 0) {
            const plural = successCount > 1 ? 's' : '';
            showSuccess(`${successCount} file${plural} added (will upload when you send)`);
        }
    });
}

/**
 * Display queued documents
 */
function displayUploadedDocuments() {
    const uploadedDocuments = document.getElementById('uploadedDocuments');
    if (!uploadedDocuments) return;
    
    const files = app.documentHandler.getQueuedFiles();
    
    if (files.length === 0) {
        uploadedDocuments.classList.add('hidden');
        uploadedDocuments.innerHTML = '';
        return;
    }
    
    uploadedDocuments.classList.remove('hidden');
    uploadedDocuments.innerHTML = files.map((fileItem) => `
        <div class="uploaded-doc-item" data-id="${fileItem.id}">
            <div class="uploaded-doc-icon">📄</div>
            <div class="uploaded-doc-details">
                <div class="uploaded-doc-name">${escapeHtml(fileItem.name)}</div>
                <div class="uploaded-doc-meta">${formatFileSize(fileItem.size)} • queued</div>
            </div>
            <button class="uploaded-doc-remove" onclick="removeDocument(${fileItem.id})" title="Remove document">×</button>
        </div>
    `).join('');
}

/**
 * Remove queued document
 */
function removeDocument(fileId) {
    app.documentHandler.removeFile(fileId);
    displayUploadedDocuments();
    showSuccess('Document removed');
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Set up actions section toggle
 */
function setupActionsToggle() {
    const toggleBtn = document.getElementById('toggleActionsBtn');
    const actionsList = document.getElementById('actionsList');

    if (toggleBtn && actionsList) {
        const isCollapsed = localStorage.getItem('boudica_actions_collapsed') === 'true';
        if (isCollapsed) {
            actionsList.style.display = 'none';
            toggleBtn.style.transform = 'rotate(-90deg)';
        }

        toggleBtn.addEventListener('click', () => {
            const isHidden = actionsList.style.display === 'none';
            actionsList.style.display = isHidden ? 'block' : 'none';
            toggleBtn.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
            localStorage.setItem('boudica_actions_collapsed', isHidden ? 'false' : 'true');
        });
    }

    const toggleChatsBtn = document.getElementById('toggleChatsBtn');
    const chatsList = document.getElementById('chatHistoryList');

    if (toggleChatsBtn && chatsList) {
        const isChatsCollapsed = localStorage.getItem('boudica_chats_collapsed') === 'true';
        if (isChatsCollapsed) {
            chatsList.style.display = 'none';
            toggleChatsBtn.style.transform = 'rotate(-90deg)';
        }

        toggleChatsBtn.addEventListener('click', () => {
            const isHidden = chatsList.style.display === 'none';
            chatsList.style.display = isHidden ? '' : 'none';
            toggleChatsBtn.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
            localStorage.setItem('boudica_chats_collapsed', isHidden ? 'false' : 'true');
        });
    }

    const toggleRulesBtn = document.getElementById('toggleRulesBtn');
    const rulesListEl = document.getElementById('rulesList');

    if (toggleRulesBtn && rulesListEl) {
        const isRulesCollapsed = localStorage.getItem('boudica_rules_collapsed') === 'true';
        if (isRulesCollapsed) {
            rulesListEl.style.display = 'none';
            toggleRulesBtn.style.transform = 'rotate(-90deg)';
        }

        toggleRulesBtn.addEventListener('click', () => {
            const isHidden = rulesListEl.style.display === 'none';
            rulesListEl.style.display = isHidden ? '' : 'none';
            toggleRulesBtn.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
            localStorage.setItem('boudica_rules_collapsed', isHidden ? 'false' : 'true');
        });
    }
}

// ========== RULES ==========

/**
 * Render all rules into #rulesList
 */
function loadRules() {
    const listEl = document.getElementById('rulesList');
    if (!listEl || !app.storage) return;

    listEl.innerHTML = '';

    // New Rule button
    const newBtn = document.createElement('button');
    newBtn.className = 'btn btn-new-rule';
    newBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="margin-right:6px"><path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>New Rule';
    newBtn.addEventListener('click', () => openNewRuleOverlay());
    listEl.appendChild(newBtn);

    // Rule items
    const rules = app.storage.getRules();
    rules.forEach(rule => {
        const item = document.createElement('div');
        item.className = 'rule-item';
        item.title = rule.text;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'rule-item-name';
        nameSpan.textContent = rule.name;
        nameSpan.addEventListener('click', () => applyRuleToPrompt(rule));

        const editBtn = document.createElement('button');
        editBtn.className = 'btn rule-item-edit';
        editBtn.title = 'Edit rule';
        editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L4.667 14H2v-2.667L11.333 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openNewRuleOverlay(rule);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'btn rule-item-delete';
        delBtn.title = 'Delete rule';
        delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete rule "${rule.name}"?`)) {
                app.storage.deleteRule(rule.id);
                loadRules();
            }
        });

        item.appendChild(nameSpan);
        item.appendChild(editBtn);
        item.appendChild(delBtn);
        listEl.appendChild(item);
    });
}

/**
 * Open the New Rule overlay
 */
function openNewRuleOverlay(rule) {
    const overlay   = document.getElementById('newRuleOverlay');
    const titleEl   = document.getElementById('ruleOverlayTitle');
    const editIdEl  = document.getElementById('ruleEditId');
    const nameInput = document.getElementById('ruleNameInput');
    const textInput = document.getElementById('ruleTextInput');
    if (!overlay) return;
    // Guard: only treat argument as a rule if it's a plain object with an id
    // (prevents a MouseEvent being passed from a direct addEventListener binding)
    if (rule && typeof rule === 'object' && rule.id && typeof rule.name === 'string') {
        if (titleEl)  titleEl.textContent  = 'Edit Rule';
        if (editIdEl) editIdEl.value       = rule.id;
        if (nameInput) nameInput.value     = rule.name;
        if (textInput) textInput.textContent = rule.text;
    } else {
        if (titleEl)  titleEl.textContent  = 'New Rule';
        if (editIdEl) editIdEl.value       = '';
        if (nameInput) nameInput.value     = '';
        if (textInput) textInput.textContent = '';
    }
    overlay.classList.remove('hidden');
    if (nameInput) nameInput.focus();
}

/**
 * Close the New Rule overlay
 */
function closeNewRuleOverlay() {
    const overlay = document.getElementById('newRuleOverlay');
    if (overlay) overlay.classList.add('hidden');
}

/**
 * Save the rule from the overlay form
 */
function saveNewRule() {
    const editId = (document.getElementById('ruleEditId')?.value || '').trim();
    const name   = (document.getElementById('ruleNameInput').value || '').trim();
    const text   = (document.getElementById('ruleTextInput').textContent || '').trim();
    if (!name) {
        document.getElementById('ruleNameInput').focus();
        return;
    }
    if (!text) {
        document.getElementById('ruleTextInput').focus();
        return;
    }
    const rule = {
        id:   editId || app.storage.generateRuleId(),
        name: name,
        text: text
    };
    app.storage.saveRule(rule);
    loadRules();
    closeNewRuleOverlay();
}

/**
 * Wire up the New Rule overlay buttons and keyboard shortcuts
 */
function setupRuleOverlay() {
    const saveBtn = document.getElementById('saveRuleBtn');
    const cancelBtn = document.getElementById('cancelRuleBtn');
    const overlay = document.getElementById('newRuleOverlay');
    const textInput = document.getElementById('ruleTextInput');

    if (saveBtn) saveBtn.addEventListener('click', saveNewRule);
    if (cancelBtn) cancelBtn.addEventListener('click', closeNewRuleOverlay);

    // Close when clicking the backdrop
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeNewRuleOverlay();
        });
    }

    // Ctrl+Enter to save, Escape to cancel, from the text editor
    if (textInput) {
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); saveNewRule(); }
            if (e.key === 'Escape') closeNewRuleOverlay();
        });
    }

    // Escape from name input
    const nameInput = document.getElementById('ruleNameInput');
    if (nameInput) {
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeNewRuleOverlay();
            if (e.key === 'Enter') {
                e.preventDefault();
                const textEl = document.getElementById('ruleTextInput');
                if (textEl) textEl.focus();
            }
        });
    }
}

// ========== SLASH COMMANDS ==========

/**
 * Handle built-in slash commands typed into the chat input.
 * Returns true if the message was a recognised command (caller should bail out),
 * false if it should be treated as a normal message.
 */
async function handleSlashCommand(chatId, message) {
    const trimmed = message.trim();
    if (!trimmed.startsWith('/')) return false;

    // Only match bare /word commands — multi-word /rule shortcuts are handled
    // later by expandRulesInMessage and must not be intercepted here.
    const match = trimmed.match(/^\/([a-zA-Z]+)\s*$/);
    if (!match) return false;

    const cmd = match[1].toLowerCase();

    switch (cmd) {
        case 'new':
            app.ui.handleNewChat();
            return true;

        case 'clear':
            app.ui.handleClearChat();
            return true;

        case 'redo': {
            const chat = app.storage ? app.storage.getChat(chatId) : null;
            if (!chat) return true;
            // Find the last user message that wasn't itself a bare slash command
            const userMsgs = chat.messages.filter(
                m => m.role === 'user' && !m.content.trim().match(/^\/[a-zA-Z]+\s*$/)
            );
            if (userMsgs.length === 0) {
                showError('No previous message to redo.');
                return true;
            }
            const lastUserMsg = userMsgs[userMsgs.length - 1];
            await handleSendMessage(chatId, lastUserMsg.content);
            return true;
        }

        case 'private': {
            const checkbox = document.getElementById('privateCheckbox');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                showSuccess(`Private mode ${checkbox.checked ? 'enabled' : 'disabled'}.`);
            } else {
                showError('Private mode toggle not available.');
            }
            return true;
        }

        case 'export':
            _exportCurrentChat(chatId);
            return true;

        case 'help':
            _showHelpMessage();
            return true;

        default:
            return false; // Unknown /word — pass through as a normal message
    }
}

/**
 * Download the current chat as a plain-text file.
 */
function _exportCurrentChat(chatId) {
    const chat = app.storage ? app.storage.getChat(chatId) : null;
    if (!chat) { showError('No chat to export.'); return; }

    const lines = [];
    lines.push(`# ${chat.title}`);
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push('');
    chat.messages.forEach(msg => {
        const role = msg.role === 'user' ? 'You' : 'Boudica';
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
        lines.push(`--- ${role}${time ? ' · ' + time : ''} ---`);
        lines.push(msg.content);
        lines.push('');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boudica-chat-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess('Chat exported.');
}

/**
 * Display an in-chat help message listing all slash commands.
 * The message is shown in the UI but not stored in chat history.
 */
function _showHelpMessage() {
    const helpText = `**Available slash commands:**

| Command | Description |
|---------|-------------|
| \`/help\` | Show this help message |
| \`/new\` | Start a new chat |
| \`/clear\` | Clear the current conversation |
| \`/redo\` | Resend your last message |
| \`/private\` | Toggle "Keep private" on/off |
| \`/export\` | Download this chat as a .txt file |
| \`/<rule name>\` | Expand a saved rule into your prompt |

**Rule shortcuts:** type \`use\`, \`add\`, \`include\`, or \`/<name>\` followed by a rule name to expand it inline before sending.`;

    const helpMessage = {
        role: 'assistant',
        content: helpText,
        timestamp: new Date().toISOString()
    };
    // Display only — do not persist in chat history or send to server
    app.ui.displayMessage(helpMessage);
    app.ui.scrollToBottom();
    const ws = document.getElementById('welcomeScreen');
    if (ws) ws.classList.add('hidden');
}

/**
 * Appends a short instruction telling the model to emit chart requests as a
 * structured ```chart JSON block instead of hand-drawn SVG path math, which
 * models are reliably bad at (wrong angles, overlapping wedges - confirmed
 * live 2026-08-29 against a real model response: a "40%" slice actually
 * covered 50% of the circle, using triangle vertices that never touched the
 * chart's own center point). chat-ui.js's formatMessageContent() renders
 * ```chart blocks by computing the actual wedge geometry in JS instead of
 * trusting the model's math, so this is a real fix, not just better
 * prompting - the append here only needs to get the model to emit that
 * format, not to get its geometry right, which it still isn't reliably
 * capable of.
 *
 * Keyword-gated (not sent on every message) purely to save prompt tokens on
 * the common case - a false-negative here just means the model falls back
 * to hand-drawn SVG (still renders, sanitized, just not guaranteed-correct
 * geometry), not a broken response, so the keyword list errs toward
 * catching real chart requests rather than being exhaustive.
 */
function appendChartFormatHint(text) {
    if (!/\b(chart|graph|pie|plot|diagram|histogram|scatter|visuali[sz]e|visualisation|visualization)\b/i.test(text)) {
        return text;
    }
    // "line" isn't in the trigger list on its own (too common a word,
    // would false-positive constantly) - "line graph"/"line chart" still
    // match via "graph"/"chart" above.
    const hint = '\n\n(If this asks for a chart/graph/plot/diagram, output it as a single fenced '
        + '```chart code block containing ONLY valid JSON, in one of these shapes depending on the '
        + 'requested type - do not hand-draw SVG path coordinates for any of them: '
        + 'pie/bar/histogram/line: {"type":"pie","title":"...","data":[{"label":"...","value":N}, ...]} '
        + '(type is one of "pie","bar","histogram","line"); '
        + 'scatter: {"type":"scatter","title":"...","data":[{"x":N,"y":N}, ...]}. '
        + 'Values do not need to sum to 100 - they are proportions. If the request is not actually asking '
        + 'for a chart, ignore this instruction entirely.)';
    return text + hint;
}

/**
 * Expand all rule references in a message before sending to the API.
 * Replaces every occurrence of "use|add|include <ruleName>" (case-insensitive)
 * with the corresponding rule text. Multiple references in a single message
 * are each replaced in-place.
 */
function expandRulesInMessage(text) {
    if (!app.storage) return text;
    const rules = app.storage.getRules();
    if (!rules || rules.length === 0) return text;

    let expanded = text;
    rules.forEach(rule => {
        const escaped = rule.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?:\\b(?:use|add|include)\\s+|\/\\s*)${escaped}\\b`, 'gi');
        expanded = expanded.replace(pattern, rule.text);
    });
    return expanded;
}

/**
 * Inject a rule's text into the chat prompt.
 * If the prompt already contains "add|use|include <ruleName>" or "/<ruleName>"
 * the placeholder phrase is replaced; otherwise the rule text is prepended.
 */
function applyRuleToPrompt(rule) {
    const input = document.getElementById('chatInput');
    if (!input) return;

    const current = input.value;
    const escaped = rule.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:\\b(?:add|use|include)\\s+|\/\\s*)${escaped}\\b`, 'i');

    if (pattern.test(current)) {
        input.value = current.replace(pattern, rule.text);
    } else {
        input.value = current ? `${rule.text}\n\n${current}` : rule.text;
    }

    // Fire input so auto-resize and send-button enable both trigger
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
}

// ========== SLASH MENU ==========

const SLASH_COMMANDS = [
    { cmd: '/help',    desc: 'Show available commands' },
    { cmd: '/new',     desc: 'Start a new chat' },
    { cmd: '/clear',   desc: 'Clear the current conversation' },
    { cmd: '/redo',    desc: 'Resend your last message' },
    { cmd: '/private', desc: 'Toggle "Keep private" on/off' },
    { cmd: '/export',  desc: 'Download this chat as a .txt file' },
];

let _slashMenuActive    = false;
let _slashMenuIndex     = -1;
let _slashMenuWordStart = 0;   // index of the '/' that opened the menu

/**
 * Wire the slash-command / rule picker to the chat input.
 * Called once during app initialisation.
 */
function setupSlashMenu() {
    const input = document.getElementById('chatInput');
    if (!input) return;

    // Show/update menu as the user types
    input.addEventListener('input', _onSlashMenuInput);

    // Navigate and select with keyboard (capture phase so we intercept before
    // chat-ui.js's bubble-phase handleKeyDown can fire Enter to send)
    input.addEventListener('keydown', _onSlashMenuKeyDown, true);

    // Close when the input loses focus (mousedown on items calls
    // e.preventDefault() so blur won't fire for item clicks)
    input.addEventListener('blur', () => setTimeout(_hideSlashMenu, 150));
}

function _onSlashMenuInput() {
    const input  = document.getElementById('chatInput');
    const val    = input.value;
    const cursor = input.selectionStart;

    // Walk backwards from the cursor to find the start of the current token.
    // Stop at any whitespace — slashes mid-word (e.g. URLs) are ignored.
    let tokenStart = cursor;
    while (tokenStart > 0 && !/\s/.test(val[tokenStart - 1])) {
        tokenStart--;
    }

    const token = val.slice(tokenStart, cursor);

    if (token.startsWith('/')) {
        _slashMenuWordStart = tokenStart;
        _renderSlashMenu(token.slice(1).toLowerCase());
    } else {
        _hideSlashMenu();
    }
}

function _renderSlashMenu(filter) {
    const menu = document.getElementById('slashMenu');
    if (!menu) return;

    // Matched commands
    const matchedCmds = SLASH_COMMANDS.filter(
        c => c.cmd.slice(1).startsWith(filter)
    );

    // Matched rules
    const rules = app.storage ? app.storage.getRules() : [];
    const matchedRules = rules.filter(
        r => r.name.toLowerCase().startsWith(filter) || r.name.toLowerCase().includes(filter)
    );

    if (matchedCmds.length === 0 && matchedRules.length === 0) {
        _hideSlashMenu();
        return;
    }

    let html = '';

    if (matchedCmds.length > 0) {
        html += '<div class="slash-menu-section-label">Commands</div>';
        matchedCmds.forEach(c => {
            html += `<div class="slash-menu-item" data-value="${c.cmd}" role="option">`
                  + `<span class="slash-menu-cmd">${c.cmd}</span>`
                  + `<span class="slash-menu-desc">${c.desc}</span>`
                  + '</div>';
        });
    }

    if (matchedRules.length > 0) {
        html += '<div class="slash-menu-section-label">Rules</div>';
        matchedRules.forEach(r => {
            const preview = r.text.length > 60 ? r.text.slice(0, 60) + '\u2026' : r.text;
            html += `<div class="slash-menu-item" data-value="/${escapeHtml(r.name)}" role="option">`
                  + `<span class="slash-menu-cmd">/${escapeHtml(r.name)}</span>`
                  + `<span class="slash-menu-desc">${escapeHtml(preview)}</span>`
                  + '</div>';
        });
    }

    menu.innerHTML = html;
    menu.classList.remove('hidden');
    _slashMenuActive = true;
    _slashMenuIndex  = -1;

    // Attach click handlers
    menu.querySelectorAll('.slash-menu-item').forEach(item => {
        item.addEventListener('mousedown', e => {
            e.preventDefault(); // keep focus on input
            _selectSlashItem(item.dataset.value);
        });
    });
}

function _hideSlashMenu() {
    const menu = document.getElementById('slashMenu');
    if (menu) menu.classList.add('hidden');
    _slashMenuActive = false;
    _slashMenuIndex  = -1;
}

function _onSlashMenuKeyDown(e) {
    if (!_slashMenuActive) return;
    const menu = document.getElementById('slashMenu');
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll('.slash-menu-item'));
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _slashMenuIndex = Math.min(_slashMenuIndex + 1, items.length - 1);
        _updateSlashMenuHighlight(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _slashMenuIndex = Math.max(_slashMenuIndex - 1, 0);
        _updateSlashMenuHighlight(items);
    } else if (e.key === 'Tab') {
        // Tab auto-completes the first (or highlighted) item
        e.preventDefault();
        const idx = _slashMenuIndex >= 0 ? _slashMenuIndex : 0;
        _selectSlashItem(items[idx].dataset.value);
    } else if (e.key === 'Enter' && _slashMenuIndex >= 0) {
        // Enter selects the highlighted item; if nothing is highlighted let
        // the message send through normally
        e.preventDefault();
        e.stopPropagation();
        _selectSlashItem(items[_slashMenuIndex].dataset.value);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        _hideSlashMenu();
    }
}

function _updateSlashMenuHighlight(items) {
    items.forEach((item, i) => {
        item.classList.toggle('slash-menu-item--active', i === _slashMenuIndex);
        if (i === _slashMenuIndex) item.scrollIntoView({ block: 'nearest' });
    });
}

function _selectSlashItem(value) {
    const input = document.getElementById('chatInput');
    if (!input) return;

    // Replace only the "/token" the user was typing; leave the rest intact.
    const cursor = input.selectionStart;
    const before = input.value.slice(0, _slashMenuWordStart);
    const after   = input.value.slice(cursor);
    input.value   = before + value + (after ? ' ' + after.trimStart() : '');

    // Place cursor immediately after the inserted text.
    const newPos = before.length + value.length;
    input.setSelectionRange(newPos, newPos);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    _hideSlashMenu();
    input.focus();
}

// ========== COLLABORATION ==========

/**
 * Wire collapse/expand for the top-level Collaboration section and
 * each of the three sub-sections (Users, In-Box, Sent).
 */
function setupCollaborationToggles() {
    // Top-level toggle
    const toggleCollab = document.getElementById('toggleCollabBtn');
    const collabBody = document.getElementById('collabBody');
    if (toggleCollab && collabBody) {
        const collapsed = localStorage.getItem('boudica_collab_collapsed') === 'true';
        if (collapsed) { collabBody.style.display = 'none'; toggleCollab.style.transform = 'rotate(-90deg)'; }
        toggleCollab.addEventListener('click', () => {
            const hidden = collabBody.style.display === 'none';
            collabBody.style.display = hidden ? '' : 'none';
            toggleCollab.style.transform = hidden ? 'rotate(0deg)' : 'rotate(-90deg)';
            localStorage.setItem('boudica_collab_collapsed', hidden ? 'false' : 'true');
        });
    }

    // Sub-section toggles
    [
        ['toggleCollabUsersBtn',  'collabUsersList',   'boudica_collab_users_collapsed'],
        ['toggleCollabInboxBtn',  'collabInboxList',   'boudica_collab_inbox_collapsed'],
        ['toggleCollabSentBtn',   'collabSentList',    'boudica_collab_sent_collapsed'],
        ['toggleCollabSharedBtn', 'collabSharedList',  'boudica_collab_shared_collapsed']
    ].forEach(([btnId, listId, storageKey]) => {
        const btn = document.getElementById(btnId);
        const list = document.getElementById(listId);
        if (!btn || !list) return;
        const isCollapsed = localStorage.getItem(storageKey) === 'true';
        if (isCollapsed) { list.style.display = 'none'; btn.style.transform = 'rotate(-90deg)'; }
        btn.addEventListener('click', () => {
            const hidden = list.style.display === 'none';
            list.style.display = hidden ? '' : 'none';
            btn.style.transform = hidden ? 'rotate(0deg)' : 'rotate(-90deg)';
            localStorage.setItem(storageKey, hidden ? 'false' : 'true');
        });
    });
}

/**
 * Load the distinct user list from the server and render it in #collabUsersList.
 * Called once on page load (after auth) and silently skipped if the API is unavailable.
 */
async function loadCollaborationUsers() {
    const listEl = document.getElementById('collabUsersList');
    if (!listEl || !app.api) return;

    listEl.innerHTML = '<div class="collab-loading">Loading users\u2026</div>';

    try {
        const users = await app.api.loadUsers();
        listEl.innerHTML = '';

        if (!users || users.length === 0) {
            listEl.innerHTML = '<div class="collab-empty">No users found</div>';
            return;
        }

        // Get current user so we can exclude them and derive their domain
        const currentUser = app.api.getCurrentUserId();
        const currentDomain = currentUser.includes('@') ? currentUser.split('@')[1] : null;

        users
            .filter(userId => {
                if (userId === currentUser) return false;
                // Only show users in the same domain
                if (currentDomain && userId.includes('@')) {
                    return userId.split('@')[1] === currentDomain;
                }
                return false;
            })
            .forEach(userId => {
                const item = document.createElement('div');
                item.className = 'collab-user-item';
                item.dataset.userId = userId;

                const parts = userId.split(/[@.\s_-]+/).filter(Boolean);
                const initials = parts.length >= 2
                    ? (parts[0][0] + parts[1][0]).toUpperCase()
                    : userId.substring(0, 2).toUpperCase();

                item.innerHTML =
                    `<span class="collab-user-avatar">${initials}</span>` +
                    `<span class="collab-user-name">${escapeHtml(userId)}</span>`;

                item.addEventListener('click', () => openComposeOverlay(userId));
                listEl.appendChild(item);
            });

        // Re-apply joined indicators if a shared chat is currently open
        if (_sharedChatId && _sharedChatJoinedUsers.size) {
            _setCollabActiveUsers(_sharedChatJoinedUsers);
        }
    } catch (err) {
        console.warn('Failed to load collaboration users:', err);
        listEl.innerHTML = '<div class="collab-empty">Could not load users</div>';
    }
}

// ========== COMPOSE OVERLAY ==========

// Tracks recipients currently added to the compose form
let _composeRecipients = [];

function openComposeOverlay(userId) {
    const overlay = document.getElementById('composeOverlay');
    if (!overlay) return;

    // If overlay is already open, just add the recipient
    if (!overlay.classList.contains('hidden')) {
        addComposeRecipient(userId);
        return;
    }

    // Open overlay — preserve existing recipients so the user can close, click
    // another user in the sidebar, and have them added rather than replaced.
    const fromEl = document.getElementById('composeFrom');
    const subjectEl = document.getElementById('composeSubject');
    const bodyEl = document.getElementById('composeBody');

    if (fromEl) fromEl.textContent = app.api ? app.api.getCurrentUserId() : '';
    if (subjectEl) subjectEl.value = '';
    if (bodyEl) { bodyEl.textContent = ''; delete bodyEl.dataset.chatExcerpt; }

    overlay.classList.remove('hidden');
    addComposeRecipient(userId);
    if (subjectEl) subjectEl.focus();
}

function addComposeRecipient(userId) {
    if (_composeRecipients.includes(userId)) return;
    _composeRecipients.push(userId);

    const tagsEl = document.getElementById('composeToTags');
    if (!tagsEl) return;

    const tag = document.createElement('span');
    tag.className = 'compose-to-tag';
    tag.dataset.userId = userId;
    tag.innerHTML = `${escapeHtml(userId)}<button class="compose-to-tag-remove" title="Remove">&times;</button>`;
    tag.querySelector('.compose-to-tag-remove').addEventListener('click', () => {
        _composeRecipients = _composeRecipients.filter(u => u !== userId);
        tag.remove();
    });
    tagsEl.appendChild(tag);
}

function closeComposeOverlay() {
    const overlay = document.getElementById('composeOverlay');
    if (overlay) overlay.classList.add('hidden');
    // Recipients are intentionally kept so re-opening (e.g. clicking another user
    // in the sidebar) adds to them rather than starting fresh.
}

function clearComposeRecipients() {
    _composeRecipients = [];
    const tagsEl = document.getElementById('composeToTags');
    if (tagsEl) tagsEl.innerHTML = '';
}

function composeAddChat() {
    if (!app.storage) return;
    const chatId = app.storage.getCurrentChatId();
    if (!chatId) return;
    const chat = app.storage.getChat(chatId);
    if (!chat || !chat.messages || chat.messages.length === 0) return;

    // Find last user message and last assistant response
    const userMsgs = chat.messages.filter(m => m.role === 'user');
    const assistantMsgs = chat.messages.filter(m => m.role === 'assistant');
    const lastPrompt   = userMsgs.length      ? userMsgs[userMsgs.length - 1].content      : null;
    const lastResponse = assistantMsgs.length ? assistantMsgs[assistantMsgs.length - 1].content : null;

    const bodyEl = document.getElementById('composeBody');
    if (!bodyEl) return;

    const divider = '\n\n--- Chat Excerpt ---\n';
    let excerpt = divider;
    if (lastPrompt)   excerpt += `Prompt:\n${lastPrompt}\n\n`;
    if (lastResponse) excerpt += `Response:\n${lastResponse}`;

    // Append as plain text
    const existing = bodyEl.innerText || '';
    bodyEl.innerText = existing + excerpt;
    bodyEl.focus();

    // Store the raw excerpt on the overlay for sending
    bodyEl.dataset.chatExcerpt = JSON.stringify({ prompt: lastPrompt, response: lastResponse });
}

async function composeSend() {
    const fromEl   = document.getElementById('composeFrom');
    const subjectEl = document.getElementById('composeSubject');
    const bodyEl   = document.getElementById('composeBody');

    const from    = fromEl    ? fromEl.textContent.trim()   : '';
    const subject = subjectEl ? subjectEl.value.trim()       : '';
    const bodyText = bodyEl   ? bodyEl.innerText.trim()      : '';

    if (_composeRecipients.length === 0) {
        alert('Please add at least one recipient.');
        return;
    }
    if (!subject) {
        subjectEl && subjectEl.focus();
        alert('Please enter a subject.');
        return;
    }

    let chatExcerpt = null;
    if (bodyEl && bodyEl.dataset.chatExcerpt) {
        try { chatExcerpt = JSON.parse(bodyEl.dataset.chatExcerpt); } catch(_) {}
    }

    const messageBody = { text: bodyText };
    if (chatExcerpt) messageBody.chat_excerpt = chatExcerpt;

    try {
        const result = await app.api.sendUserMessage(from, _composeRecipients, subject, messageBody);
        // Add to SENT list in sidebar
        appendSentItem({
            message_id: result.message_id,
            from_user_id: from,
            to_user_ids: [..._composeRecipients],
            subject: subject,
            message_body: messageBody,
            sent_at: result.sent_at
        });
        clearComposeRecipients();
        closeComposeOverlay();
    } catch (err) {
        console.error('Failed to send message:', err);
        alert('Failed to send message. Please try again.');
    }
}

function appendSentItem(msg) {
    const sentList = document.getElementById('collabSentList');
    if (!sentList) return;

    const empty = sentList.querySelector('.collab-empty');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'collab-message-item';
    if (msg.message_id) item.dataset.messageId = msg.message_id;

    const toStr = Array.isArray(msg.to_user_ids) ? msg.to_user_ids.join(', ') : (msg.to_user_ids || '');
    const dateStr = msg.sent_at
        ? new Date(msg.sent_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    item.innerHTML =
        `<div class="collab-msg-subject">${escapeHtml(msg.subject || '(no subject)')}</div>` +
        `<div class="collab-msg-meta">To: ${escapeHtml(toStr)} · ${escapeHtml(dateStr)}</div>`;

    item.addEventListener('click', () => openMessageOverlay(msg, item, null, true));
    sentList.insertBefore(item, sentList.firstChild);
}

function setupComposeOverlay() {
    const overlay = document.getElementById('composeOverlay');
    if (!overlay) return;

    document.getElementById('composeSendBtn')   ?.addEventListener('click', composeSend);
    document.getElementById('composeCancelBtn') ?.addEventListener('click', () => { clearComposeRecipients(); closeComposeOverlay(); });
    document.getElementById('composeAddChatBtn')?.addEventListener('click', composeAddChat);

    // Close on backdrop click
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeComposeOverlay();
    });

    // Escape to close
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
            closeComposeOverlay();
        }
    });
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ========== INBOX LOADING ==========

async function loadSentItems() {
    const sentList = document.getElementById('collabSentList');
    if (!sentList || !app.api) return;

    const userId = app.api.getCurrentUserId();
    if (!userId) return;

    sentList.innerHTML = '<div class="collab-loading">Loading…</div>';

    try {
        const messages = await app.api.loadUserMessages(userId, 'sent');
        sentList.innerHTML = '';

        if (!messages || messages.length === 0) {
            sentList.innerHTML = '<div class="collab-empty">No sent messages</div>';
            return;
        }

        messages.forEach(msg => appendSentItem(msg));
    } catch (err) {
        console.warn('Failed to load sent messages:', err);
        sentList.innerHTML = '<div class="collab-empty">Could not load sent messages</div>';
    }
}

// Tracks message IDs already rendered in the inbox (for polling diff)
let _knownInboxIds = new Set();
// setInterval handle so we can clear it on logout
let _inboxPollTimer = null;
const INBOX_POLL_INTERVAL_MS = 30000; // 30 seconds

async function loadInboxItems() {
    const inboxEl = document.getElementById('collabInboxList');
    if (!inboxEl || !app.api) return;

    const userId = app.api.getCurrentUserId();
    if (!userId) return;

    inboxEl.innerHTML = '<div class="collab-loading">Loading\u2026</div>';
    _knownInboxIds.clear();

    try {
        const messages = await app.api.loadUserMessages(userId, 'inbox');
        inboxEl.innerHTML = '';

        if (!messages || messages.length === 0) {
            inboxEl.innerHTML = '<div class="collab-empty">No messages</div>';
            _updateInboxBadge(userId, []);
            return;
        }

        messages.forEach(msg => {
            _knownInboxIds.add(String(msg.message_id));
            inboxEl.appendChild(_buildInboxItem(msg, userId));
        });
        _updateInboxBadge(userId, messages);
    } catch (err) {
        console.warn('Failed to load inbox:', err);
        inboxEl.innerHTML = '<div class="collab-empty">Could not load messages</div>';
    }
}

/** Build a single inbox list item element */
function _buildInboxItem(msg, userId) {
    const readBy = Array.isArray(msg.read_by) ? msg.read_by : [];
    const isUnread = !readBy.includes(userId);
    const item = document.createElement('div');
    item.className = 'collab-message-item' + (isUnread ? ' unread' : '');
    item.dataset.messageId = msg.message_id;

    const dateStr = new Date(msg.sent_at).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    item.innerHTML =
        `<div class="collab-msg-subject">${escapeHtml(msg.subject || '(no subject)')}</div>` +
        `<div class="collab-msg-meta">From: ${escapeHtml(msg.from_user_id)} \u00b7 ${escapeHtml(dateStr)}</div>`;

    item.addEventListener('click', () => openMessageOverlay(msg, item, userId));
    return item;
}

/** Update (or hide) the unread badge on the Inbox sub-header */
function _updateInboxBadge(userId, messages) {
    const badge = document.getElementById('inboxUnreadBadge');
    if (!badge) return;
    const count = messages.filter(m => {
        const readBy = Array.isArray(m.read_by) ? m.read_by : [];
        return !readBy.includes(userId);
    }).length;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

/** Silent poll — fetches inbox and prepends only genuinely new messages */
async function _pollInbox() {
    if (!app.api) return;
    const userId = app.api.getCurrentUserId();
    if (!userId) return;

    try {
        const messages = await app.api.loadUserMessages(userId, 'inbox');
        if (!messages) return;

        const inboxEl = document.getElementById('collabInboxList');
        if (!inboxEl) return;

        // Remove "No messages" placeholder if present
        const emptyEl = inboxEl.querySelector('.collab-empty');

        const newMessages = messages.filter(m => !_knownInboxIds.has(String(m.message_id)));
        if (newMessages.length > 0) {
            if (emptyEl) emptyEl.remove();
            // Prepend newest first (API returns DESC order, so reverse to prepend correctly)
            [...newMessages].reverse().forEach(msg => {
                _knownInboxIds.add(String(msg.message_id));
                const item = _buildInboxItem(msg, userId);
                item.classList.add('inbox-new-flash');
                inboxEl.insertBefore(item, inboxEl.firstChild);
            });
        }

        _updateInboxBadge(userId, messages);
    } catch (err) {
        // Silent — don't disturb the UI on poll errors
        console.debug('Inbox poll error:', err);
    }
}

/** Start background inbox polling (idempotent) */
function startInboxPolling() {
    if (_inboxPollTimer) return;
    _inboxPollTimer = setInterval(_pollInbox, INBOX_POLL_INTERVAL_MS);
}

/** Stop inbox polling (call on logout) */
function stopInboxPolling() {
    if (_inboxPollTimer) {
        clearInterval(_inboxPollTimer);
        _inboxPollTimer = null;
    }
}

// ========== MESSAGE VIEW OVERLAY ==========

function openMessageOverlay(msg, itemEl, currentUserId, isSent = false) {
    const overlay = document.getElementById('msgViewOverlay');
    if (!overlay) return;

    document.getElementById('msgViewSubject').textContent = msg.subject || '(no subject)';
    document.getElementById('msgViewDate').textContent = new Date(msg.sent_at).toLocaleString();

    const fromEl = document.getElementById('msgViewFrom');
    const fromLabelEl = document.getElementById('msgViewFromLabel');
    if (isSent) {
        const toStr = Array.isArray(msg.to_user_ids) ? msg.to_user_ids.join(', ') : (msg.to_user_ids || '');
        if (fromLabelEl) fromLabelEl.textContent = 'To:';
        fromEl.textContent = toStr;
    } else {
        if (fromLabelEl) fromLabelEl.textContent = 'From:';
        fromEl.textContent = msg.from_user_id;
    }

    const deleteBtn = document.getElementById('msgViewDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = isSent ? 'none' : '';

    const bodyEl = document.getElementById('msgViewBody');
    bodyEl.innerHTML = '';

    const body = msg.message_body || {};
    if (body.text) {
        const textDiv = document.createElement('div');
        textDiv.className = 'msg-view-text';
        textDiv.textContent = body.text;
        bodyEl.appendChild(textDiv);
    }

    if (body.chat_excerpt) {
        const excerptDiv = document.createElement('div');
        excerptDiv.className = 'msg-view-excerpt';
        let excerptHtml = '<hr class="msg-view-divider"><span class="msg-view-excerpt-label">Chat Excerpt</span>';
        if (body.chat_excerpt.prompt) {
            excerptHtml += `<div class="msg-view-excerpt-row"><strong>Prompt:</strong> ${escapeHtml(body.chat_excerpt.prompt)}</div>`;
        }
        if (body.chat_excerpt.response) {
            excerptHtml += `<div class="msg-view-excerpt-row"><strong>Response:</strong> ${escapeHtml(body.chat_excerpt.response)}</div>`;
        }
        excerptDiv.innerHTML = excerptHtml;
        bodyEl.appendChild(excerptDiv);
    }

    overlay.dataset.messageId = msg.message_id;
    overlay.dataset.currentUserId = currentUserId || '';
    overlay.dataset.isSent = isSent ? '1' : '';
    overlay._itemEl = itemEl;
    overlay.classList.remove('hidden');
}

function closeMessageOverlay() {
    const overlay = document.getElementById('msgViewOverlay');
    if (!overlay) return;

    const msgId = overlay.dataset.messageId;
    const userId = overlay.dataset.currentUserId;
    const itemEl = overlay._itemEl;

    // Mark as read on close (inbox only, not sent)
    const isSent = overlay.dataset.isSent === '1';
    if (!isSent && msgId && userId && app.api && itemEl && itemEl.classList.contains('unread')) {
        app.api.updateUserMessage(msgId, userId, 'read')
            .then(() => { if (itemEl) itemEl.classList.remove('unread'); })
            .catch(err => console.warn('mark-read failed:', err));
    }

    overlay.classList.add('hidden');
    delete overlay._itemEl;
}

async function deleteMessage() {
    const overlay = document.getElementById('msgViewOverlay');
    if (!overlay) return;

    const msgId = overlay.dataset.messageId;
    const userId = overlay.dataset.currentUserId;
    const itemEl = overlay._itemEl;

    if (!msgId || !userId || !app.api) return;

    try {
        await app.api.updateUserMessage(msgId, userId, 'delete');
        if (itemEl) itemEl.remove();
    } catch (err) {
        console.error('delete message failed:', err);
        alert('Failed to delete message. Please try again.');
        return;
    }

    overlay.classList.add('hidden');
    delete overlay._itemEl;
}

function setupMessageViewOverlay() {
    const overlay = document.getElementById('msgViewOverlay');
    if (!overlay) return;

    document.getElementById('msgViewCloseBtn')?.addEventListener('click', closeMessageOverlay);
    document.getElementById('msgViewDeleteBtn')?.addEventListener('click', deleteMessage);

    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeMessageOverlay();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
            closeMessageOverlay();
        }
    });
}

// ========== FAQ ==========

function setupFaq() {
    const faqBtn    = document.getElementById('faqBtn');
    const overlay   = document.getElementById('faqOverlay');
    const closeBtn  = document.getElementById('faqCloseBtn');
    const searchEl  = document.getElementById('faqSearch');
    if (!overlay) return;

    // Open
    if (faqBtn) faqBtn.addEventListener('click', openFaq);

    // Close
    if (closeBtn) closeBtn.addEventListener('click', closeFaq);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeFaq(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeFaq();
    });

    // Category accordion
    overlay.querySelectorAll('.faq-category-header').forEach(btn => {
        btn.addEventListener('click', () => {
            const body = btn.nextElementSibling;
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', String(!expanded));
            if (body) {
                if (expanded) { body.setAttribute('hidden', ''); }
                else           { body.removeAttribute('hidden'); }
            }
        });
    });

    // Q&A accordion
    overlay.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
            const answer  = btn.nextElementSibling;
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', String(!expanded));
            if (answer) answer.classList.toggle('open', !expanded);
        });
    });

    // Live search/filter
    if (searchEl) {
        searchEl.addEventListener('input', () => _faqFilter(searchEl.value.trim()));
    }
}

function openFaq() {
    const overlay = document.getElementById('faqOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        const searchEl = document.getElementById('faqSearch');
        if (searchEl) { searchEl.value = ''; _faqFilter(''); searchEl.focus(); }
    }
}

function closeFaq() {
    const overlay = document.getElementById('faqOverlay');
    if (overlay) overlay.classList.add('hidden');
}

function _faqFilter(query) {
    const overlay   = document.getElementById('faqOverlay');
    const noResults = document.getElementById('faqNoResults');
    if (!overlay) return;

    const q = query.toLowerCase();
    let totalVisible = 0;

    overlay.querySelectorAll('.faq-category').forEach(cat => {
        let catVisible = 0;

        cat.querySelectorAll('.faq-item').forEach(item => {
            const questionEl = item.querySelector('.faq-question');
            const answerEl   = item.querySelector('.faq-answer');
            const qText = questionEl ? questionEl.textContent : '';
            const aText = answerEl   ? answerEl.textContent   : '';
            const matches = !q || qText.toLowerCase().includes(q) || aText.toLowerCase().includes(q);

            item.classList.toggle('faq-hidden', !matches);
            if (matches) catVisible++;
        });

        // Show/hide whole category
        const body   = cat.querySelector('.faq-category-body');
        const header = cat.querySelector('.faq-category-header');

        if (catVisible > 0) {
            cat.style.display = '';
            totalVisible += catVisible;
            // Auto-expand categories that have matches when searching
            if (q && body) {
                body.removeAttribute('hidden');
                if (header) header.setAttribute('aria-expanded', 'true');
            }
        } else {
            cat.style.display = q ? 'none' : '';
        }
    });

    if (noResults) noResults.classList.toggle('hidden', totalVisible > 0 || !q);
}


/**
 * Show content safety violation alert
 */
function showContentSafetyAlert() {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'contentSafetyOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        animation: fadeIn 0.2s ease-out;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        padding: 32px;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
        max-width: 500px;
        text-align: center;
        animation: slideUp 0.3s ease-out;
    `;
    
    modal.innerHTML = `
        <div style="
            width: 64px;
            height: 64px;
            margin: 0 auto 20px;
            background: #fef3cd;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
        ">⚠️</div>
        <h2 style="color: #d93025; margin-bottom: 16px; font-size: 24px;">Content Policy Violation</h2>
        <p style="color: #5f6368; margin-bottom: 24px; line-height: 1.6;">
            Your message violates our content safety policies. This could be due to:
        </p>
        <ul style="
            color: #5f6368;
            text-align: left;
            margin: 0 auto 24px;
            max-width: 400px;
            line-height: 1.8;
        ">
            <li>Injection patterns or command injection attempts</li>
            <li>Potentially harmful or unsafe content</li>
            <li>Policy violations configured by administrators</li>
        </ul>
        <p style="color: #5f6368; margin-bottom: 24px; line-height: 1.6;">
            Please rephrase your message and try again.
        </p>
        <button id="closeSafetyAlert" style="
            background: #4285f4;
            color: white;
            border: none;
            padding: 12px 32px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            transition: background 0.2s;
        ">I Understand</button>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Add hover effect to button
    const closeBtn = modal.querySelector('#closeSafetyAlert');
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = '#3367d6';
    });
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = '#4285f4';
    });
    
    // Close modal on button click
    closeBtn.addEventListener('click', () => {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 200);
    });
    
    // Close modal on overlay click (outside modal)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease-out';
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 200);
        }
    });
    
    // Close modal on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.style.animation = 'fadeOut 0.2s ease-out';
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 200);
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

/**
 * Show critical error
 */
function showCriticalError(error) {
    const errorHtml = `
        <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 32px;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            text-align: center;
        ">
            <h2 style="color: #d93025; margin-bottom: 16px;">Critical Error</h2>
            <p style="color: #5f6368; margin-bottom: 24px;">
                ${error.message || 'An unexpected error occurred. Please refresh the page or contact support.'}
            </p>
            <button onclick="window.location.reload()" style="
                background: #4285f4;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            ">
                Reload Page
            </button>
        </div>
    `;
    
    document.body.innerHTML = errorHtml;
}

/**
 * Show error notification
 */
function showError(message) {
    showNotification(message, 'error');
}

/**
 * Show warning notification
 */
function showWarning(message) {
    showNotification(message, 'warning');
}

/**
 * Show success notification
 */
function showSuccess(message) {
    showNotification(message, 'success');
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    const colors = {
        error: '#d93025',
        warning: '#f9ab00',
        success: '#1e8e3e',
        info: '#4285f4'
    };
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        background: white;
        color: ${colors[type]};
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        border-left: 4px solid ${colors[type]};
        z-index: 10000;
        animation: slideInRight 0.3s ease-out;
        max-width: 400px;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 5000);
}

/**
 * Show a persistent, full-width maintenance-restart warning banner - unlike
 * showNotification() above (a 5s auto-dismissing corner toast), this stays
 * until manually dismissed, since "the system restarts in N minutes" needs
 * to actually be seen, not flash by. Dismissal is remembered per
 * maintenance_id in localStorage, so re-showing only happens if the admin
 * schedules a NEW restart (a different id) - not on every page load once
 * acknowledged. See chat-api.js's getMaintenanceStatus() for the data this
 * renders, and src/admin_api_full.cpp's handle_maintenance_schedule() for
 * where an admin sets it.
 */
function showMaintenanceBanner(data) {
    const dismissedId = localStorage.getItem('boudica_maintenance_dismissed_id');
    if (String(data.maintenance_id) === dismissedId) {
        return;
    }

    const existing = document.getElementById('maintenanceBanner');
    if (existing) existing.remove();

    const when = new Date(data.scheduled_at).toLocaleString();
    const banner = document.createElement('div');
    banner.id = 'maintenanceBanner';
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #f9ab00;
        color: #1a1a1a;
        padding: 12px 24px;
        text-align: center;
        font-size: 14px;
        font-weight: 500;
        z-index: 10001;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    `;
    const text = document.createElement('span');
    text.textContent = `Scheduled maintenance: the system will be unavailable for `
        + `~${data.duration_minutes} minutes starting ${when}.`
        + (data.message ? ` ${data.message}` : '');
    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = '×';
    dismissBtn.setAttribute('aria-label', 'Dismiss');
    dismissBtn.style.cssText = `
        background: none;
        border: none;
        color: #1a1a1a;
        font-size: 20px;
        line-height: 1;
        margin-left: 16px;
        cursor: pointer;
        vertical-align: middle;
    `;
    dismissBtn.addEventListener('click', () => {
        localStorage.setItem('boudica_maintenance_dismissed_id', String(data.maintenance_id));
        banner.remove();
    });

    banner.appendChild(text);
    banner.appendChild(dismissBtn);
    document.body.appendChild(banner);
}

// Add notification and modal animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    
    @keyframes fadeOut {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
        }
    }

    @keyframes slideUp {
        from {
            transform: translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// ── Collaboration user active-indicator helpers ───────────────────────────
//
// Marks users in the sidebar Users list who have *actually sent a message*
// in the currently-open shared chat with collab-user-item--collab-active.
// Being listed as a participant (invited) does NOT trigger the indicator —
// only posting at least one user-role message counts as "joined".
//
function _setCollabActiveUsers(joinedSet) {
    const listEl = document.getElementById('collabUsersList');
    if (!listEl) return;
    // Accept either a Set or an Array
    const set = (joinedSet instanceof Set) ? joinedSet : new Set(joinedSet);
    listEl.querySelectorAll('.collab-user-item').forEach(item => {
        const uid = item.dataset.userId || '';
        if (set.has(uid)) {
            item.classList.add('collab-user-item--collab-active');
            item.title = uid + ' — has joined this collaboration';
        } else {
            item.classList.remove('collab-user-item--collab-active');
            item.title = '';
        }
    });
}

function _clearCollabActiveUsers() {
    const listEl = document.getElementById('collabUsersList');
    if (!listEl) return;
    listEl.querySelectorAll('.collab-user-item--collab-active').forEach(item => {
        item.classList.remove('collab-user-item--collab-active');
        item.title = '';
    });
}

// ── Shared Chats ───────────────────────────────────────────────────────────
//
// State
let _sharedChatPollTimer   = null;
let _sharedChatId          = null;   // currently open chat id
let _sharedChatLastMsgId   = 0;      // for poll diff
let _sharedChatParticipants    = [];          // invited participants (includes those not yet active)
let _sharedChatJoinedUsers     = new Set();  // users who have actually posted (role==='user') → drives green indicator
let _sharedChatAnnouncedUsers  = new Set();  // users who have ANY message (user or group) → suppresses duplicate join announcements
let _sharedNewParticipants     = [];          // being assembled in the "new chat" modal
const SHARED_POLL_INTERVAL_MS = 10000; // poll every 10 s when panel is open

// ── Setup (called once on init) ───────────────────────────────────────────
function setupSharedChats() {
    // sidebar "+ new" button
    const newBtn = document.getElementById('newSharedChatBtn');
    if (newBtn) newBtn.addEventListener('click', openNewSharedChatModal);

    // panel back button
    const backBtn = document.getElementById('scBackBtn');
    if (backBtn) backBtn.addEventListener('click', closeSharedChatPanel);

    // panel invite button
    const invBtn = document.getElementById('scInviteBtn');
    if (invBtn) invBtn.addEventListener('click', openInviteModal);

    // panel send button + textarea keyboard
    const sendBtn = document.getElementById('scSendBtn');
    if (sendBtn) sendBtn.addEventListener('click', sendSharedMessage);

    const textarea = document.getElementById('scInput');
    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendSharedMessage();
            }
        });
        // auto-grow
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
        });
    }

    // "New chat" modal buttons
    const addPartBtn = document.getElementById('scNewAddParticipantBtn');
    if (addPartBtn) addPartBtn.addEventListener('click', _addNewChatParticipant);

    const partInput = document.getElementById('scNewParticipantInput');
    if (partInput) {
        partInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); _addNewChatParticipant(); }
        });
    }

    document.getElementById('scNewCancelBtn')?.addEventListener('click', closeNewSharedChatModal);
    document.getElementById('scNewCloseBtn')?.addEventListener('click', closeNewSharedChatModal);
    document.getElementById('scNewCreateBtn')?.addEventListener('click', createSharedChat);

    // Invite modal buttons
    document.getElementById('scInviteCancelBtn')?.addEventListener('click', closeInviteModal);
    document.getElementById('scInviteCloseBtn')?.addEventListener('click', closeInviteModal);
    document.getElementById('scInviteConfirmBtn')?.addEventListener('click', confirmInvite);

    // sidebar toggle
    document.getElementById('toggleCollabSharedBtn')?.addEventListener('click', () => {
        const list = document.getElementById('collabSharedList');
        if (list) list.classList.toggle('hidden');
    });

    // Data load (seeds known IDs so the invite poll only triggers the
    // notification sound for chats that arrive AFTER page load) is
    // triggered by handleAuthSuccess() once identity is confirmed, NOT
    // here - this function only wires up DOM listeners, which are safe
    // before auth completes. See handleAuthSuccess()'s own comment.
}

// ── Collaboration invite notification ─────────────────────────────────────
//
// Tracks chat IDs already known to this session so we can detect when a new
// invite arrives (i.e. a chat_id not seen before) and alert the user.

let _knownSharedChatIds   = new Set();  // seeded on first load — no sound
let _sharedInvitePollTimer = null;
const SHARED_INVITE_POLL_MS = 30000;    // 30 s — same cadence as inbox

/**
 * Play a short two-tone notification chime using the Web Audio API.
 * No external audio files required.
 */
function _playInviteSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;

        // First note
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);          // A5
        gain1.gain.setValueAtTime(0.18, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Second note (slightly higher, brief)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1100, now + 0.18); // C#6
        gain2.gain.setValueAtTime(0.0, now + 0.18);
        gain2.gain.linearRampToValueAtTime(0.14, now + 0.22);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc2.start(now + 0.18);
        osc2.stop(now + 0.55);

        // Auto-close context to free resources
        setTimeout(() => ctx.close(), 700);
    } catch (e) {
        // Web Audio not available — silent fallback
        console.debug('Invite sound unavailable:', e);
    }
}

/** Seed known IDs without playing a sound (call on first load). */
function _seedSharedChatIds(chats) {
    (chats || []).forEach(c => _knownSharedChatIds.add(String(c.chat_id)));
}

/** Poll for new shared chat invites and notify if any found. */
async function _pollSharedInvites() {
    if (!app.api) return;
    const userId = app.api.getCurrentUserId();
    if (!userId || userId === 'anonymous') return;

    try {
        const api = new window.ChatAPI();
        const chats = await api.loadSharedChats(userId);
        if (!chats || !chats.length) return;

        // Detect chats where this user is NOT the owner (i.e. they were invited)
        const newInvites = chats.filter(c =>
            !_knownSharedChatIds.has(String(c.chat_id)) && c.owner_id !== userId
        );

        // Seed all new IDs regardless of ownership (avoid re-notifying)
        chats.forEach(c => _knownSharedChatIds.add(String(c.chat_id)));

        if (newInvites.length === 0) return;

        // Play notification chime
        _playInviteSound();

        // Flash the Shared badge in the sidebar header
        const badge = document.getElementById('sharedChatsUnreadBadge');
        if (badge) {
            badge.textContent = newInvites.length > 99 ? '99+' : String(newInvites.length);
            badge.classList.remove('hidden');
        }

        // Refresh the sidebar list so the new chat appears
        loadSharedChatsList(false);
    } catch (err) {
        console.debug('Shared invite poll error:', err);
    }
}

function startSharedInvitePolling() {
    if (_sharedInvitePollTimer) return;
    _sharedInvitePollTimer = setInterval(_pollSharedInvites, SHARED_INVITE_POLL_MS);
}

function stopSharedInvitePolling() {
    if (_sharedInvitePollTimer) {
        clearInterval(_sharedInvitePollTimer);
        _sharedInvitePollTimer = null;
    }
}

// ── Load list into sidebar ─────────────────────────────────────────────────
async function loadSharedChatsList(seed = true) {
    const userId = app.api ? app.api.getCurrentUserId() : null;
    if (!userId) return;
    const list = document.getElementById('collabSharedList');
    if (!list) return;

    try {
        const api = new window.ChatAPI();
        const chats = await api.loadSharedChats(userId);
        // Seed known IDs on first load so existing chats don't trigger a sound
        if (seed) _seedSharedChatIds(chats);
        list.innerHTML = '';
        if (!chats.length) {
            list.innerHTML = '<div style="padding:0.4rem 0.6rem;font-size:0.78rem;opacity:0.6;">No shared chats yet.</div>';
            return;
        }
        // Ensure the list is visible when there are tiles to show — the
        // toggle button may have collapsed it before this render ran.
        list.classList.remove('hidden');
        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'sc-list-item';
            item.dataset.chatId = chat.chat_id;

            const isOwner = chat.owner_id === userId;

            const inner = document.createElement('div');
            inner.style.cssText = 'display:flex;align-items:center;gap:0.4rem;flex:1;min-width:0;cursor:pointer;';
            inner.innerHTML = `
                <svg class="sc-item-icon" width="13" height="13" viewBox="0 0 20 20" fill="none">
                    <path d="M17 11a2 2 0 0 1-2 2H5l-3 3V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6z"
                          stroke="currentColor" stroke-width="1.8" fill="none"/>
                </svg>
                <span class="sc-item-label">${_escHtml(chat.title)}</span>
                <span class="sc-item-count">${chat.msg_count || 0}</span>
            `;
            inner.addEventListener('click', () => openSharedChatPanel(
                chat.chat_id,
                chat.title,
                chat.participants || []
            ));
            item.appendChild(inner);

            if (isOwner) {
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-icon-sm sc-delete-btn';
                delBtn.title = 'Delete shared chat';
                delBtn.setAttribute('aria-label', 'Delete ' + chat.title);
                delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                    <path d="M4 6h12M8 6V4h4v2M9 10v5M11 10v5M5 6l1 11h8l1-11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>`;
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete "${chat.title}"? This cannot be undone.`)) return;
                    try {
                        const api = new window.ChatAPI();
                        await api.deleteSharedChat(chat.chat_id, userId);
                        // If panel is open for this chat, close it
                        if (_sharedChatId == chat.chat_id) closeSharedChatPanel();
                        await loadSharedChatsList();
                    } catch (err) {
                        console.error('deleteSharedChat error:', err);
                        alert('Failed to delete: ' + err.message);
                    }
                });
                item.appendChild(delBtn);
            }

            list.appendChild(item);
        });
    } catch (err) {
        console.error('loadSharedChatsList error:', err);
    }
}

// ── Open panel for a specific chat ───────────────────────────────────────
async function openSharedChatPanel(chatId, title, participants) {
    _sharedChatId          = chatId;
    _sharedChatLastMsgId   = 0;
    _sharedChatParticipants = Array.isArray(participants) ? participants : [];
    _sharedChatJoinedUsers   = new Set(); // reset; rebuilt from message history below

    // Start a fresh isolated working session each time the panel is opened.
    if (app.api) app.api.resetSharedSession(chatId);

    document.getElementById('scPanelTitle').textContent = title || 'Shared Chat';
    document.getElementById('scPanelParticipants').textContent =
        _sharedChatParticipants.length
            ? 'Participants: ' + _sharedChatParticipants.join(', ')
            : '';

    // clear messages
    const msgs = document.getElementById('scMessages');
    if (msgs) msgs.innerHTML = '';

    document.getElementById('scPanel')?.classList.remove('hidden');
    document.getElementById('sharedChatPanel')?.classList.remove('hidden');
    document.getElementById('scInput')?.focus();

    // Load history — _appendSharedMessage will populate _sharedChatJoinedUsers
    // for every user message it renders, then we apply indicators once at the end.
    const userId = app.api ? app.api.getCurrentUserId() : null;
    if (userId) {
        try {
            const api = new window.ChatAPI();
            const history = await api.loadSharedChatMessages(chatId, userId, 0);
            history.forEach(m => _appendSharedMessage(m, false));
            if (history.length) {
                _sharedChatLastMsgId = history[history.length - 1].msg_id;
            }
            _scrollSharedToBottom();
        } catch (err) {
            console.error('openSharedChatPanel history load error:', err);
        }
    }

    // Apply joined indicators now that history is loaded
    _setCollabActiveUsers(_sharedChatJoinedUsers);

    // Send join announcement if this user has no prior messages in this chat.
    // Using _sharedChatAnnouncedUsers (populated from ALL message roles during history
    // load) ensures we only fire once — even if the user closes and reopens the panel.
    if (userId && _sharedChatId && !_sharedChatAnnouncedUsers.has(userId)) {
        _sharedChatAnnouncedUsers.add(userId); // mark immediately to prevent double-fire
        const joinMsg = userId + ' has joined';
        // Render locally as a group notice
        _appendSharedMessage({
            msg_id:    Date.now(),
            author_id: userId,
            role:      'group',
            content:   joinMsg,
            sent_at:   new Date().toISOString()
        }, true);
        _scrollSharedToBottom();
        // Persist to DB so all other participants see it via polling
        (async () => {
            try {
                const api = new window.ChatAPI();
                const result = await api.sendSharedGroupMessage(_sharedChatId, userId, joinMsg);
                if (result.msg && result.msg.msg_id > _sharedChatLastMsgId) {
                    _sharedChatLastMsgId = result.msg.msg_id;
                }
            } catch (err) {
                console.warn('Join announcement failed (non-fatal):', err);
            }
        })();
    }

    startSharedChatPolling();
}

function closeSharedChatPanel() {
    stopSharedChatPolling();
    _sharedChatId = null;
    _sharedChatJoinedUsers    = new Set();
    _sharedChatAnnouncedUsers = new Set();
    _clearCollabActiveUsers();
    document.getElementById('sharedChatPanel')?.classList.add('hidden');
}

// ── Polling ───────────────────────────────────────────────────────────────
function startSharedChatPolling() {
    stopSharedChatPolling();
    _sharedChatPollTimer = setInterval(_pollSharedChat, SHARED_POLL_INTERVAL_MS);
}

function stopSharedChatPolling() {
    if (_sharedChatPollTimer) {
        clearInterval(_sharedChatPollTimer);
        _sharedChatPollTimer = null;
    }
}

async function _pollSharedChat() {
    if (!_sharedChatId) return;
    const userId = app.api ? app.api.getCurrentUserId() : null;
    if (!userId) return;

    try {
        const api = new window.ChatAPI();
        const newMsgs = await api.loadSharedChatMessages(
            _sharedChatId, userId, _sharedChatLastMsgId
        );
        if (!newMsgs.length) return;

        newMsgs.forEach(m => {
            // Skip messages the current user just sent (already rendered)
            if (m.role === 'user' && m.author_id === userId) {
                // Still update cursor
                if (m.msg_id > _sharedChatLastMsgId) _sharedChatLastMsgId = m.msg_id;
                return;
            }
            _appendSharedMessage(m, true);
        });
        _scrollSharedToBottom();

        // update sidebar list badge
        const badge = document.getElementById('sharedChatsUnreadBadge');
        if (badge) {
            badge.textContent = newMsgs.length;
            badge.classList.remove('hidden');
            setTimeout(() => badge.classList.add('hidden'), 5000);
        }
    } catch (err) {
        console.error('_pollSharedChat error:', err);
    }
}

// ── Send a message ────────────────────────────────────────────────────────
async function sendSharedMessage() {
    const input = document.getElementById('scInput');
    const raw = input ? input.value.trim() : '';
    if (!raw || !_sharedChatId) return;

    const userId = app.api ? app.api.getCurrentUserId() : null;
    if (!userId) return;

    // @message — treat as a plain group note, not a prompt to Boudica
    if (raw.startsWith('@')) {
        const content = raw.slice(1).trim();
        if (!content) return;
        if (input) { input.value = ''; input.style.height = 'auto'; }
        // Optimistically render
        _appendSharedMessage({ msg_id: Date.now(), author_id: userId, role: 'group', content, sent_at: new Date().toISOString() }, false);
        _scrollSharedToBottom();
        try {
            const api = new window.ChatAPI();
            const result = await api.sendSharedGroupMessage(_sharedChatId, userId, content);
            if (result.msg && result.msg.msg_id > _sharedChatLastMsgId) {
                _sharedChatLastMsgId = result.msg.msg_id;
            }
        } catch (err) {
            console.error('sendSharedGroupMessage error:', err);
            _appendErrorMessage('Failed to send group message: ' + err.message);
        }
        return;
    }

    const content = raw;

    // Optimistically render user message
    const tempMsg = { msg_id: Date.now(), author_id: userId, role: 'user', content, sent_at: new Date().toISOString() };
    _appendSharedMessage(tempMsg, false);
    _scrollSharedToBottom();

    if (input) { input.value = ''; input.style.height = 'auto'; }

    // Show typing indicator
    const typing = document.getElementById('scTyping');
    typing?.classList.remove('hidden');

    try {
        const api = new window.ChatAPI();
        const result = await api.sendSharedChatMessage(_sharedChatId, userId, content);

        if (result.user_msg && result.user_msg.msg_id) {
            _sharedChatLastMsgId = result.user_msg.msg_id;
        }

        // Append AI response
        if (result.assistant_msg) {
            _appendSharedMessage(result.assistant_msg, false);
            if (result.assistant_msg.msg_id > _sharedChatLastMsgId) {
                _sharedChatLastMsgId = result.assistant_msg.msg_id;
            }
        }
        _scrollSharedToBottom();
    } catch (err) {
        console.error('sendSharedMessage error:', err);
        _appendErrorMessage('Failed to send: ' + err.message);
    } finally {
        typing?.classList.add('hidden');
    }
}

// ── Render helpers ─────────────────────────────────────────────────────────
function _appendSharedMessage(msg, isNew) {
    const msgs = document.getElementById('scMessages');
    if (!msgs) return;

    // Group messages (@message) get a distinct centered notice style
    if (msg.role === 'group') {
        const el = document.createElement('div');
        el.className = 'sc-group-msg' + (isNew ? ' sc-new-flash' : '');
        const ts = msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
        el.innerHTML = `<span class="sc-group-author">${_escHtml(msg.author_id)}</span>`
                     + `<span class="sc-group-content">${_escHtml(msg.content)}</span>`
                     + (ts ? `<span class="sc-group-ts">${ts}</span>` : '');
        msgs.appendChild(el);
        if (msg.msg_id && msg.msg_id > _sharedChatLastMsgId && !String(msg.msg_id).startsWith(String(Date.now()).slice(0, 8))) {
            _sharedChatLastMsgId = msg.msg_id;
        }
        return;
    }

    const isUser = (msg.role === 'user');

    // Track joined/announced users for sidebar indicators and join-message deduplication.
    if (msg.author_id) {
        // Any message (user or group) means this user has "been in" the chat before.
        _sharedChatAnnouncedUsers.add(msg.author_id);
        // user-role AND group-role messages both light up the green indicator.
        // group messages include the "X has joined" announcement and @notes — all human-authored.
        if (isUser || msg.role === 'group') {
            const wasNew = !_sharedChatJoinedUsers.has(msg.author_id);
            _sharedChatJoinedUsers.add(msg.author_id);
            if (wasNew) _setCollabActiveUsers(_sharedChatJoinedUsers);
        }
    }

    const el = document.createElement('div');
    el.className = 'sc-message ' + (isUser ? 'user-msg' : 'ai-msg') + (isNew ? ' sc-new-flash' : '');

    const bubble = document.createElement('div');
    bubble.className = 'sc-bubble';
    if (!isUser && app && app.ui) {
        const formatted = app.ui.formatMessageContent(msg.content || '');
        if (formatted.type === 'html') {
            // HTML document response: show a card in the bubble, render in the shared flyout panel
            bubble.innerHTML = `
                <div class="html-preview-card">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--primary-color)">
                        <polyline points="16 18 22 12 16 6"></polyline>
                        <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    <div class="html-preview-card-text">
                        <span class="html-preview-card-title">HTML Response</span>
                        <span class="html-preview-card-desc">Rendered in the preview panel →</span>
                    </div>
                </div>`;
            app.ui.openHtmlPreview(app.ui._ensureHtmlClosingTags(msg.content), false);
        } else {
            bubble.innerHTML = formatted.html;
        }
    } else {
        bubble.textContent = msg.content;
    }
    el.appendChild(bubble);

    const meta = document.createElement('div');
    meta.className = 'sc-msg-meta';
    const ts = msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
    const author = isUser ? (msg.author_id || 'You') : 'Boudica';
    meta.textContent = author + (ts ? ' · ' + ts : '');
    el.appendChild(meta);

    msgs.appendChild(el);

    if (msg.msg_id && msg.msg_id > _sharedChatLastMsgId && !String(msg.msg_id).startsWith(String(Date.now()).slice(0, 8))) {
        _sharedChatLastMsgId = msg.msg_id;
    }
}

function _appendErrorMessage(text) {
    const msgs = document.getElementById('scMessages');
    if (!msgs) return;
    const el = document.createElement('div');
    el.style.cssText = 'font-size:0.8rem;color:#e05050;padding:0.4rem 0.6rem;';
    el.textContent = text;
    msgs.appendChild(el);
}

function _scrollSharedToBottom() {
    const msgs = document.getElementById('scMessages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function _escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── New chat modal ─────────────────────────────────────────────────────────
function openNewSharedChatModal() {
    _sharedNewParticipants = [];
    document.getElementById('scNewTitle').value = '';
    document.getElementById('scNewParticipantInput').value = '';
    document.getElementById('scNewParticipantTags').innerHTML = '';
    document.getElementById('newSharedChatOverlay')?.classList.remove('hidden');
    document.getElementById('scNewTitle')?.focus();
}

function closeNewSharedChatModal() {
    document.getElementById('newSharedChatOverlay')?.classList.add('hidden');
}

function _addNewChatParticipant() {
    const input = document.getElementById('scNewParticipantInput');
    const val = input ? input.value.trim() : '';
    if (!val || _sharedNewParticipants.includes(val)) { if(input) input.value=''; return; }
    _sharedNewParticipants.push(val);
    const tags = document.getElementById('scNewParticipantTags');
    if (tags) {
        const tag = document.createElement('span');
        tag.className = 'sc-tag';
        tag.innerHTML = `${_escHtml(val)}<button class="sc-tag-remove" aria-label="Remove ${_escHtml(val)}">×</button>`;
        tag.querySelector('button').addEventListener('click', () => {
            _sharedNewParticipants = _sharedNewParticipants.filter(p => p !== val);
            tag.remove();
        });
        tags.appendChild(tag);
    }
    if (input) input.value = '';
}

async function createSharedChat() {
    const userId = app.api ? app.api.getCurrentUserId() : null;
    if (!userId) return;

    const titleInput = document.getElementById('scNewTitle');
    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) { titleInput?.focus(); return; }

    const createBtn = document.getElementById('scNewCreateBtn');
    if (createBtn) createBtn.disabled = true;

    try {
        const api = new window.ChatAPI();
        const result = await api.createSharedChat(userId, title, _sharedNewParticipants);
        closeNewSharedChatModal();
        await loadSharedChatsList();
        // open the newly created chat
        await openSharedChatPanel(result.chat_id, title, [userId, ..._sharedNewParticipants]);
    } catch (err) {
        console.error('createSharedChat error:', err);
        alert('Failed to create shared chat: ' + err.message);
    } finally {
        if (createBtn) createBtn.disabled = false;
    }
}

// ── Invite modal ───────────────────────────────────────────────────────────
function openInviteModal() {
    document.getElementById('scInviteInput').value = '';
    document.getElementById('scInviteOverlay')?.classList.remove('hidden');
    document.getElementById('scInviteInput')?.focus();
}

function closeInviteModal() {
    document.getElementById('scInviteOverlay')?.classList.add('hidden');
}

async function confirmInvite() {
    const userId = app.api ? app.api.getCurrentUserId() : null;
    if (!userId || !_sharedChatId) return;

    const input = document.getElementById('scInviteInput');
    const invitee = input ? input.value.trim() : '';
    if (!invitee) { input?.focus(); return; }

    const btn = document.getElementById('scInviteConfirmBtn');
    if (btn) btn.disabled = true;

    try {
        const api = new window.ChatAPI();
        await api.inviteToSharedChat(_sharedChatId, userId, invitee);
        _sharedChatParticipants.push(invitee);
        document.getElementById('scPanelParticipants').textContent =
            'Participants: ' + _sharedChatParticipants.join(', ');
        closeInviteModal();
    } catch (err) {
        console.error('confirmInvite error:', err);
        alert('Failed to invite user: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Export for debugging
window.app = app;

// ── Idle overlay ─────────────────────────────────────────────────────────────
// Shows a friendly nudge after 10 minutes of inactivity. Any user interaction
// (mouse move, keypress, click, touch, scroll) resets the timer and hides it.
(function initIdleOverlay() {
    const IDLE_MS = 10 * 60 * 1000; // 10 minutes
    const overlay = document.getElementById('idleOverlay');
    const nameEl  = document.getElementById('idleUserName');
    if (!overlay || !nameEl) return;

    let idleTimer = null;

    function getUserName() {
        try {
            if (app && app.api && typeof app.api.getCurrentUserId === 'function') {
                const uid = app.api.getCurrentUserId();
                if (uid && uid !== 'anonymous') {
                    // Use the local part of an email address for a friendlier greeting
                    return uid.includes('@') ? uid.split('@')[0] : uid;
                }
            }
        } catch (_) {}
        return 'there';
    }

    function showOverlay() {
        nameEl.textContent = getUserName();
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        overlay.classList.add('hidden');
    }

    function resetTimer() {
        hideOverlay();
        clearTimeout(idleTimer);
        idleTimer = setTimeout(showOverlay, IDLE_MS);
    }

    // Only reset on GENUINE user gestures. event.isTrusted is false for any
    // event dispatched programmatically (e.g. the inbox poll triggering a
    // scroll when it prepends new messages), so those are silently ignored.
    function onActivity(e) {
        if (e && e.isTrusted === false) return;
        resetTimer();
    }

    // Clicking the card itself dismisses it and resets the timer
    overlay.addEventListener('click', resetTimer);

    // Any of these events means the user is active
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(evt =>
        document.addEventListener(evt, onActivity, { passive: true })
    );

    // Kick off the timer once the page is ready
    resetTimer();
}());
