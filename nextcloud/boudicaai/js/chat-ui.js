/**
 * Chat UI Module
 * Handles all UI interactions and updates
 */

class ChatUI {
    constructor(storage, api) {
        this.storage = storage;
        this.api = api;
        this.currentChatId = null;
        // Prompt history (bash-style up/down arrow recall)
        this._promptHistory = [];
        this._historyIndex = -1;   // -1 = not browsing history
        this._historyDraft = '';   // saves what was typed before browsing
        this.initializeElements();
        this.initializeMarkdown();
        this.attachEventListeners();
        // Per-message streaming throttle state.  Prevents calling marked.parse
        // (and replacing innerHTML) on every single token — only renders at most
        // once per animation frame (≈16 ms), saving gigabytes of GC pressure on
        // long responses.
        this._streamPending = new Map(); // messageId → { content, timer }
    }

    /**
     * Initialize Markdown renderer with syntax highlighting
     */
    initializeMarkdown() {
        if (typeof marked !== 'undefined') {
            // Configure marked for GFM (GitHub Flavored Markdown)
            marked.setOptions({
                gfm: true,
                breaks: true,
                headerIds: true,
                mangle: false,
                sanitize: false,
                smartLists: true,
                smartypants: true
            });

            // Add syntax highlighting if highlight.js is available
            if (typeof hljs !== 'undefined') {
                marked.setOptions({
                    highlight: function(code, lang) {
                        if (lang && hljs.getLanguage(lang)) {
                            try {
                                return hljs.highlight(code, { language: lang }).value;
                            } catch (err) {
                                console.error('Highlight error:', err);
                            }
                        }
                        return hljs.highlightAuto(code).value;
                    }
                });
            }
        }
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        // Main containers
        this.chatApp = document.getElementById('chatApp');
        this.authModal = document.getElementById('authModal');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatHistoryList = document.getElementById('chatHistoryList');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        // this.workingIndicator = document.getElementById('workingIndicator'); // Removed - now using inline loading indicators
        
        // Input elements
        this.chatInput = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.attachBtn = document.getElementById('attachBtn');
        this.charCount = document.getElementById('charCount');
        
        // Buttons
        this.newChatBtn = document.getElementById('newChatBtn');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.historySearch = document.getElementById('historySearch');
        
        // User info
        this.userName = document.getElementById('userName');
        this.userEmail = document.getElementById('userEmail');
        this.userInitials = document.getElementById('userInitials');
        this.chatTitle = document.getElementById('chatTitle');
        
        // Folder state
        this.expandedFolders = new Set();
        this.draggedItem = null;

        // Sidebar toggle
        this.sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
        this.sidebar = document.querySelector('.sidebar');
        // Restore collapsed state from localStorage
        if (localStorage.getItem('boudica_sidebar_collapsed') === 'true') {
            this.sidebar && this.sidebar.classList.add('collapsed');
        }

        // HTML Preview Panel
        this.htmlPreviewPanel = document.getElementById('htmlPreviewPanel');
        this.htmlPreviewFrame = document.getElementById('htmlPreviewFrame');
        this.closeHtmlPreviewBtn = document.getElementById('closeHtmlPreviewBtn');
        this.htmlPreviewResizeHandle = document.getElementById('htmlPreviewResizeHandle');
        this.htmlPreviewPrintBtn = document.getElementById('htmlPreviewPrintBtn');
        this.htmlPreviewSaveBtn = document.getElementById('htmlPreviewSaveBtn');

        // Restore last HTML from localStorage if available
        this._lastHtmlContent = localStorage.getItem('boudica_last_html') || null;

        // Streaming placeholder state
        this._htmlStreamingPlaceholderActive = false;
        this._htmlStreamingBuffer = null;
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Input events
        this.chatInput.addEventListener('input', () => this.handleInputChange());
        this.chatInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Button events
        this.sendBtn.addEventListener('click', () => this.handleSendMessage());
        this.newChatBtn.addEventListener('click', () => this.handleNewChat());
        this.historySearch.addEventListener('input', (e) => this.handleSearchHistory(e));

        // Sidebar collapse toggle
        if (this.sidebarToggleBtn) {
            this.sidebarToggleBtn.addEventListener('click', () => {
                const collapsed = this.sidebar.classList.toggle('collapsed');
                localStorage.setItem('boudica_sidebar_collapsed', collapsed);
            });
        }

        // HTML Preview Panel close button.
        // When the user interacts with the sandboxed iframe it captures focus,
        // causing the parent page to stop receiving mouse events.  Fix: whenever
        // the window loses focus to the iframe, immediately refocus the parent
        // document so buttons in the host page remain clickable at all times.
        window.addEventListener('blur', () => {
            if (this.htmlPreviewPanel?.classList.contains('open')) {
                // Small timeout lets the iframe receive its event first, then
                // we return focus to the parent without disrupting the interaction.
                setTimeout(() => { window.focus(); }, 0);
            }
        });

        if (this.closeHtmlPreviewBtn) {
            this.closeHtmlPreviewBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.closeHtmlPreview();
            });
        }

        // Keyboard fallback for quick close when preview is open.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.htmlPreviewPanel?.classList.contains('open')) {
                this.closeHtmlPreview();
            }
        });

        // HTML Preview Panel print/save/reopen buttons
        if (this.htmlPreviewPrintBtn) {
            this.htmlPreviewPrintBtn.addEventListener('click', () => this.printHtmlPreview());
        }
        if (this.htmlPreviewSaveBtn) {
            this.htmlPreviewSaveBtn.addEventListener('click', () => this.saveHtmlPreview());
        }
        // Resize handle for the flyout panel
        if (this.htmlPreviewResizeHandle) {
            this._initResizeHandle();
        }
        
        // Suggestion chips
        this.welcomeScreen.addEventListener('click', (e) => {
            if (e.target.classList.contains('chip')) {
                const prompt = e.target.getAttribute('data-prompt');
                this.chatInput.value = prompt;
                this.handleInputChange();
                this.chatInput.focus();
                this.handleSendMessage();
            }
        });

        // Auto-resize textarea
        this.chatInput.addEventListener('input', () => this.autoResizeTextarea());
        
        // Message action buttons (using event delegation)
        this.chatMessages.addEventListener('click', (e) => {
            console.log('Click detected on:', e.target);
            const actionBtn = e.target.closest('.btn-message-action');
            console.log('Action button found:', actionBtn);
            if (actionBtn) {
                const action = actionBtn.getAttribute('data-action');
                console.log('Action:', action);
                const messageDiv = actionBtn.closest('.message');
                const messageId = messageDiv.getAttribute('data-message-id');
                console.log('MessageId:', messageId);
                
                if (action === 'copy') {
                    this.handleCopyMessage(messageId, actionBtn);
                } else if (action === 'rate') {
                    console.log('Calling handleRateMessage');
                    this.handleRateMessage(messageId, actionBtn);
                } else if (action === 'redo') {
                    this.handleRedoMessage(messageId, actionBtn);
                } else if (action === 'toggle-view') {
                    this.handleToggleView(messageDiv, actionBtn);
                } else if (action === 'print') {
                    this.handlePrintMessage(messageDiv);
                } else if (action === 'view-html') {
                    const rawContent = messageDiv.querySelector('.message-content')?.getAttribute('data-raw-content') || '';
                    this.openHtmlPreview(this._cleanupHtmlClosingTags(rawContent), false);
                }
            }
        });
    }

    /**
     * Show the chat interface after authentication
     */
    showChatInterface(user) {
        // NOTE: no userName/userEmail/userInitials/authModal here - Nextcloud's
        // own top-bar already shows the current user and handles login/logout
        // at the platform level, so this port drops the standalone product's
        // in-page auth modal and sidebar user-info footer entirely (see
        // templates/index.php). Those elements don't exist in this app's DOM,
        // so referencing them here would throw on every login.
        this.chatApp.classList.remove('hidden');
        
        // Load chat history
        this.loadChatHistory();
        
        // Load current or create new chat. Guard against a stale
        // currentChatId pointer (deleted chat, trimmed by the 100-chat cap,
        // or a remote-settings sync where current_chat_id and the chats
        // array disagreed) - loadChat() silently no-ops when the chat isn't
        // found, which previously left currentChatId permanently null and
        // the send button/Enter key dead with no console error at all.
        const currentChatId = this.storage.getCurrentChatId();
        if (currentChatId && this.storage.getChat(currentChatId)) {
            this.loadChat(currentChatId);
        } else {
            this.handleNewChat();
        }
    }

    /**
     * Get initials from name
     */
    getInitials(name) {
        if (!name || typeof name !== 'string') {
            return 'U';
        }
        return name
            .split(' ')
            .map(part => part[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    /**
     * Handle input change
     */
    handleInputChange() {
        const content = this.chatInput.value.trim();
        const length = content.length;
        
        // Update character count
        this.charCount.textContent = `${length} / 4000`;
        
        // Enable/disable send button
        this.sendBtn.disabled = length === 0 || length > 4000;
        
        // Update char count color if approaching limit
        if (length > 3800) {
            this.charCount.style.color = 'var(--error-color)';
        } else if (length > 3500) {
            this.charCount.style.color = 'var(--warning-color)';
        } else {
            this.charCount.style.color = 'var(--text-tertiary)';
        }
    }

    /**
     * Handle keydown in input
     */
    handleKeyDown(e) {
        // Bash-style history: Up/Down arrow key recall
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // Only activate when cursor is on the first/last line of the textarea
            // to avoid stealing multi-line navigation.
            const val = this.chatInput.value;
            const atStart = this.chatInput.selectionStart === 0;
            const atEnd   = this.chatInput.selectionStart === val.length;
            const multiline = val.includes('\n');

            if (e.key === 'ArrowUp' && (atStart || !multiline)) {
                if (this._promptHistory.length === 0) return;
                e.preventDefault();
                if (this._historyIndex === -1) {
                    // Save whatever is currently typed so Down can restore it
                    this._historyDraft = val;
                    this._historyIndex = this._promptHistory.length - 1;
                } else if (this._historyIndex > 0) {
                    this._historyIndex--;
                }
                this.chatInput.value = this._promptHistory[this._historyIndex];
                this.handleInputChange();
                this.autoResizeTextarea();
                // Move cursor to end
                this.chatInput.selectionStart = this.chatInput.selectionEnd = this.chatInput.value.length;
                return;
            }

            if (e.key === 'ArrowDown' && (atEnd || !multiline) && this._historyIndex !== -1) {
                e.preventDefault();
                if (this._historyIndex < this._promptHistory.length - 1) {
                    this._historyIndex++;
                    this.chatInput.value = this._promptHistory[this._historyIndex];
                } else {
                    // Past the end of history — restore the draft
                    this._historyIndex = -1;
                    this.chatInput.value = this._historyDraft;
                }
                this.handleInputChange();
                this.autoResizeTextarea();
                this.chatInput.selectionStart = this.chatInput.selectionEnd = this.chatInput.value.length;
                return;
            }
        }

        // Send on Enter (without Shift)
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!this.sendBtn.disabled) {
                this.handleSendMessage();
            }
        }
    }

    /**
     * Auto-resize textarea
     */
    autoResizeTextarea() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 200) + 'px';
    }

    /**
     * Handle send message
     */
    handleSendMessage() {
        const content = this.chatInput.value.trim();
        if (!content || !this.currentChatId) return;
        
        // Check if private checkbox is checked
        const privateCheckbox = document.getElementById('privateCheckbox');
        const isPrivate = privateCheckbox && privateCheckbox.checked;
        
        // Check if verbatim checkbox is checked
        const verbatimCheckbox = document.getElementById('verbatimCheckbox');
        const isVerbatim = verbatimCheckbox && verbatimCheckbox.checked;
        
        // Add "Keep private" suffix if checkbox is checked
        const finalContent = isPrivate ? content + ' Keep private' : content;
        
        // Record the sent prompt in history (skip duplicates of the immediately preceding entry)
        if (content && (this._promptHistory.length === 0 ||
                this._promptHistory[this._promptHistory.length - 1] !== content)) {
            this._promptHistory.push(content);
            // Cap history at 100 entries
            if (this._promptHistory.length > 100) this._promptHistory.shift();
        }
        this._historyIndex = -1;
        this._historyDraft = '';

        // Clear input first
        this.chatInput.value = '';
        this.handleInputChange();
        this.autoResizeTextarea();
        
        // Trigger send callback FIRST (it will handle scheduled actions and normal messages)
        if (this.onSendMessage) {
            this.onSendMessage(this.currentChatId, finalContent, { verbatim_rag: isVerbatim });
        }
        
        // Hide welcome screen
        this.welcomeScreen.classList.add('hidden');
    }

    /**
     * Display a message in the chat
     */
    displayMessage(message, isTyping = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', message.role);
        if (message.id) {
            messageDiv.setAttribute('data-message-id', message.id);
        }
        
        // Store audit_id for rating functionality
        if (message.audit_id) {
            messageDiv.setAttribute('data-audit-id', message.audit_id);
        }
        
        // Message content (no header in messaging style)
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        
        if (isTyping) {
            messageDiv.classList.add('typing');
            // Bouncing-dot placeholder shown from the moment the prompt is sent
            // until the first stream chunk arrives (removeTypingIndicator() in
            // app.js's stream callback) - without this the response bubble is
            // just an empty box for however long prefill/retrieval takes before
            // the first token, which reads as a hang rather than "working".
            contentDiv.innerHTML = `
                <div class="typing-indicator">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            `;
        } else {
            const formattedData = this.formatMessageContent(message.content);
            if (formattedData.type === 'html') {
                // HTML content: show a preview card in the chat bubble and open the flyout panel
                contentDiv.innerHTML = `
                    <div class="html-preview-card">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--primary-color)">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                        <div class="html-preview-card-text">
                            <span class="html-preview-card-title">HTML Response</span>
                            <span class="html-preview-card-desc">Rendered in the preview panel →</span>
                        </div>
                    </div>
                `;
                // Ensure closing tags for a valid document in the iframe
                this.openHtmlPreview(this._ensureHtmlClosingTags(message.content), false);
            } else {
                contentDiv.innerHTML = formattedData.html;
            }
            contentDiv.setAttribute('data-content-type', formattedData.type);
            contentDiv.setAttribute('data-raw-content', message.content);
            contentDiv.setAttribute('data-view-mode', 'formatted'); // default to formatted view
        }

        // Thinking block goes before the final content, matching reading order
        // (reasoning first, then the answer it led to).
        if (message.role === 'assistant' && !isTyping && message.thinking) {
            const thinkingWrapper = document.createElement('div');
            thinkingWrapper.innerHTML = this._renderThinkingHtml(message.thinking);
            messageDiv.appendChild(thinkingWrapper.firstElementChild);
        }

        messageDiv.appendChild(contentDiv);
        
        // Add action buttons for assistant messages
        if (message.role === 'assistant' && !isTyping) {
            const actionsDiv = document.createElement('div');
            actionsDiv.classList.add('message-actions');
            actionsDiv.innerHTML = `
                <button class="btn btn-message-action" title="Please rate this response. Your ratings do affect the quality of your conversations going forward." data-action="rate">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    5 Stars
                </button>
                <button class="btn btn-message-action" title="Copy response" data-action="copy">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy
                </button>
                <button class="btn btn-message-action" title="Toggle between formatted view and code view" data-action="toggle-view">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="16 18 22 12 16 6"></polyline>
                        <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    Show Code
                </button>
                <button class="btn btn-message-action" title="Print this response" data-action="print">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 6 2 18 2 18 9"></polyline>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                        <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                    Print
                </button>
                <button class="btn btn-message-action" title="Resend last prompt" data-action="redo">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
                    </svg>
                    Redo
                </button>
            `;
            messageDiv.appendChild(actionsDiv);

            // For HTML content type, insert a "View in Panel" button before the toggle-view button
            const contentType = contentDiv.getAttribute('data-content-type');
            if (contentType === 'html') {
                const toggleViewBtn = actionsDiv.querySelector('[data-action="toggle-view"]');
                const viewInPanelBtn = document.createElement('button');
                viewInPanelBtn.className = 'btn btn-message-action';
                viewInPanelBtn.title = 'View HTML in the preview panel';
                viewInPanelBtn.setAttribute('data-action', 'view-html');
                viewInPanelBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <polyline points="9 3 9 21"></polyline>
                    </svg>
                    View in Panel
                `;
                if (toggleViewBtn) {
                    actionsDiv.insertBefore(viewInPanelBtn, toggleViewBtn);
                } else {
                    actionsDiv.appendChild(viewInPanelBtn);
                }
            }
        }
        
        // Add loading indicator for assistant messages during generation
        // Show for typing indicator (isTyping=true) and new messages without audit_id
        if (message.role === 'assistant' && !message.audit_id) {
            const loadingDiv = document.createElement('div');
            loadingDiv.classList.add('loading-indicator');
            // Only mark as complete if not typing (for historical edge cases)
            if (!isTyping) {
                loadingDiv.classList.add('complete');
            }
            // Absolute path, not "img/...": this app lives under custom_apps,
            // which config.php's apps_paths maps to URL prefix /custom_apps,
            // not /apps - a bare relative path resolves against the current
            // page's /apps/boudicaai/... URL and 404s (confirmed 2026-09-05).
            loadingDiv.innerHTML = '<img src="/custom_apps/boudicaai/img/logoanimated.svg" alt="Loading..." style="width: 32px; height: 32px;">';
            messageDiv.appendChild(loadingDiv);
        }
        
        this.chatMessages.appendChild(messageDiv);

        // If this is an HTML assistant message, attach a View HTML button to
        // the preceding user bubble so each prompt can re-open its own response
        if (message.role === 'assistant' && !isTyping) {
            if (contentDiv.getAttribute('data-content-type') === 'html') {
                this._injectHtmlButtonIntoUserMessage(message.content, messageDiv);
            }
        }

        this.scrollToBottom();
        
        return messageDiv;
    }

    /**
     * Build the collapsible "thinking" block shown above an assistant message's
     * final answer. Collapsed by default (matches ChatGPT/Claude's extended-
     * thinking pattern) — the model's raw chain-of-thought, plain text so it's
     * rendered as-is rather than reformatted as markdown.
     */
    _renderThinkingHtml(thinking) {
        if (!thinking) return '';
        return `
            <details class="thinking-block">
                <summary class="thinking-summary">Show thinking</summary>
                <div class="thinking-content">${this.escapeHtml(thinking)}</div>
            </details>
        `;
    }

    /**
     * Show/update a one-line agentic progress status ("Working out the best
     * way to approach this…", "Step 2 of 3…", etc.) above the message while
     * there's no real content yet. Each call replaces the previous text;
     * _clearAgenticStatus removes it once real thinking or answer content
     * starts arriving, since the narration is stale at that point.
     */
    updateAgenticStatus(messageId, message) {
        const messageEl = this.chatMessages.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) return;
        const contentDiv = messageEl.querySelector('.message-content');
        if (!contentDiv) return;

        let statusEl = messageEl.querySelector('.agentic-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.className = 'agentic-status';
            messageEl.insertBefore(statusEl, contentDiv);
        }
        statusEl.textContent = message;
    }

    /** Removes the agentic status line, if present. */
    _clearAgenticStatus(messageEl) {
        const statusEl = messageEl.querySelector('.agentic-status');
        if (statusEl) statusEl.remove();
    }

    /**
     * Live-update the collapsible thinking panel as reasoning streams in.
     * Creates the panel (expanded) on the first call for a message, appends
     * text on each subsequent call, and auto-collapses it the moment
     * thinking ends — so by the time the real answer starts appearing the
     * panel is already out of the way instead of sitting open next to it.
     * @param {string} messageId
     * @param {boolean} active - true while still streaming reasoning
     * @param {string} text - full reasoning text accumulated so far
     */
    updateLiveThinking(messageId, active, text) {
        const messageEl = this.chatMessages.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) return;
        this._clearAgenticStatus(messageEl);

        let details = messageEl.querySelector('.thinking-block');
        if (!details) {
            const contentDiv = messageEl.querySelector('.message-content');
            if (!contentDiv) return;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
                <details class="thinking-block" open>
                    <summary class="thinking-summary">Thinking…</summary>
                    <div class="thinking-content"></div>
                </details>
            `;
            details = wrapper.firstElementChild;
            messageEl.insertBefore(details, contentDiv);
        }

        const contentEl = details.querySelector('.thinking-content');
        if (contentEl) {
            contentEl.textContent = text;
            contentEl.scrollTop = contentEl.scrollHeight;
        }

        const summaryEl = details.querySelector('.thinking-summary');
        details.open = active;
        if (summaryEl) summaryEl.textContent = active ? 'Thinking…' : 'Show thinking';
    }

    /**
     * Format message content using Marked.js for full Markdown support
     * Returns object with html and type (html/markdown)
     */
    formatMessageContent(content) {
        // Convert any explicit UTC times to the user's local timezone
        content = this._convertUtcTimes(content);

        // Strip Gemma 4 thinking/reasoning tokens before any rendering.
        // The model sometimes emits <thought>...</thought> blocks (or partial
        // opening tags during streaming) that must not appear in the output.
        // A bare <br> immediately before <thought> is also removed so we don't
        // end up with the artefact "br>thought" in rendered markdown.
        content = content
            // Gemma 4 channel thinking tokens: <|channel>thought ... <channel|>
            .replace(/<\|channel>thought[\s\S]*?<channel\|>/gi, '')
            // Incomplete channel open at end of stream
            .replace(/<\|channel>thought[\s\S]*$/i, '')
            // Orphaned channel closing token
            .replace(/<channel\|>/gi, '')
            // Complete blocks: <thought>...</thought>
            .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
            // Incomplete open tag at end of stream (no closing tag yet)
            .replace(/<thought>[\s\S]*$/i, '')
            // Orphaned closing tag
            .replace(/<\/thought>/gi, '')
            // <br> immediately followed by leftover "thought" text
            .replace(/<br\s*\/?>\s*thought\b/gi, '');

        // Detect genuine HTML documents by the <html tag (NOT <!DOCTYPE alone).
        // Do NOT use a "count tags > N" heuristic: normal LLM responses discussing HTML
        // code in markdown will have many tag-like patterns and should still be rendered
        // as markdown in the chat, not diverted to the flyout panel.
        const isHTML = /<html[\s>]/i.test(content);
        
        if (isHTML) {
            // Content is HTML - render it directly in an iframe for safety
            return {
                html: content,
                type: 'html'
            };
        }

        // Chart-spec blocks (```chart fenced JSON, see appendChartFormatHint()
        // in app.js) and any raw <svg> the model draws directly both render
        // inline in the message bubble (unlike the isHTML/flyout-panel path
        // above, which is for full documents) - see renderChartBlocks() and
        // sanitizeInlineSvg() below for why they're handled differently:
        // chart-spec SVG is generated by our own code (real trigonometry, no
        // sanitization needed), raw model-drawn SVG is untrusted and must be
        // sanitized before ever reaching the DOM.
        content = this.renderChartBlocks(content);
        content = this.sanitizeInlineSvg(content);

        // Content is Markdown - parse and render
        if (typeof marked !== 'undefined') {
            try {
                // Use marked to parse markdown
                const html = marked.parse(content);
                return {
                    html: html,
                    type: 'markdown'
                };
            } catch (err) {
                console.error('Markdown parsing error:', err);
                // Fallback to escaped plain text
                return {
                    html: this.escapeHtml(content).replace(/\n/g, '<br>'),
                    type: 'text'
                };
            }
        } else {
            // Fallback if marked is not loaded - basic formatting
            return {
                html: this.basicMarkdownFormat(content),
                type: 'markdown'
            };
        }
    }

    /**
     * Convert explicit UTC times in a text string to the user's local timezone.
     * Handles:
     *   ISO 8601:  2026-05-06T15:30:00Z  /  2026-05-06T15:30:00+00:00
     *   HH:MM UTC  /  HH:MM:SS UTC  (with optional (UTC) / [UTC])
     *   H:MMam/pm UTC
     *   Hpm UTC  /  H am UTC
     * Each match is replaced with "LOCAL_TIME (UTC_TIME UTC)" and wrapped in
     * a <span class="utc-converted" title="Original: UTC_TIME UTC">.
     */
    _convertUtcTimes(text) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const today = new Date();
        const yyyy = today.getUTCFullYear();
        const mm   = String(today.getUTCMonth() + 1).padStart(2, '0');
        const dd   = String(today.getUTCDate()).padStart(2, '0');

        // Helper: parse a UTC time string into a Date using today's UTC date
        const parseUtc = (h, min, sec, meridiem) => {
            let hour = parseInt(h, 10);
            if (meridiem) {
                const m = meridiem.toLowerCase();
                if (m === 'pm' && hour !== 12) hour += 12;
                else if (m === 'am' && hour === 12) hour = 0;
            }
            const s = sec ? String(sec).padStart(2, '0') : '00';
            return new Date(`${yyyy}-${mm}-${dd}T${String(hour).padStart(2,'0')}:${String(min||0).padStart(2,'0')}:${s}Z`);
        };

        // Helper: format a Date in local time
        const fmtLocal = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

        // ── ISO 8601 datetime ────────────────────────────────────────────────
        // 2026-05-06T15:30:00Z  or  2026-05-06T15:30:00+00:00
        text = text.replace(
            /(\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|\+00:?00))/g,
            (match) => {
                try {
                    const d = new Date(match);
                    if (isNaN(d)) return match;
                    const local = fmtLocal(d);
                    return `<span class="utc-converted" title="Original: ${match}">${local}</span>`;
                } catch { return match; }
            }
        );

        // ── H:MM[:SS] am/pm UTC  (e.g. "3:45 pm UTC", "3:45:00 PM UTC") ────
        text = text.replace(
            /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)\s*(?:\(UTC\)|\[UTC\]|UTC)\b/gi,
            (match, h, min, sec, mer) => {
                try {
                    const d = parseUtc(h, min, sec, mer);
                    if (isNaN(d)) return match;
                    return `<span class="utc-converted" title="Original: ${match.trim()}">${fmtLocal(d)}</span>`;
                } catch { return match; }
            }
        );

        // ── HH:MM[:SS] UTC  (24-hour, e.g. "15:30 UTC", "09:00:00 UTC") ────
        text = text.replace(
            /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:\(UTC\)|\[UTC\]|UTC)\b/gi,
            (match, h, min, sec) => {
                try {
                    const d = parseUtc(h, min, sec, null);
                    if (isNaN(d)) return match;
                    return `<span class="utc-converted" title="Original: ${match.trim()}">${fmtLocal(d)}</span>`;
                } catch { return match; }
            }
        );

        // ── Hpm UTC / H am UTC  (no colon, e.g. "3pm UTC", "9 AM UTC") ─────
        text = text.replace(
            /(\d{1,2})\s*(am|pm)\s*(?:\(UTC\)|\[UTC\]|UTC)\b/gi,
            (match, h, mer) => {
                try {
                    const d = parseUtc(h, 0, 0, mer);
                    if (isNaN(d)) return match;
                    return `<span class="utc-converted" title="Original: ${match.trim()}">${fmtLocal(d)}</span>`;
                } catch { return match; }
            }
        );

        return text;
    }

    /**
     * Finds ```chart fenced JSON blocks and replaces each with an inline
     * SVG chart computed by this function's own trigonometry - not the
     * model's. Confirmed live 2026-08-29: models reliably get hand-drawn
     * pie-chart path math wrong (wedges that don't touch the circle's own
     * center, angles that don't match the stated percentages, overlapping
     * slices) - asking the model to "double check" its own geometry doesn't
     * fix this, since self-checking requires the same math skill it just
     * failed at. This function makes the geometry correct by construction
     * instead: real angle = value/total * 360, standard SVG arc-path
     * formula, so wedges always tile the circle exactly with no overlap.
     *
     * Placeholder-token substitution (not string-splitting around the
     * match) so any markdown before/after/between multiple chart blocks
     * still parses as one coherent document through marked afterward.
     */
    renderChartBlocks(content) {
        // Accepts ANY fence language tag (or none) - confirmed live
        // 2026-08-29 that the model doesn't reliably use the ```chart tag
        // it's told to, even when explicitly instructed (see
        // appendChartFormatHint() in app.js): it used ```json once, then
        // an untagged/differently-tagged block another time. Safe to be
        // this permissive because generateChartSvg()'s own structural shape
        // check (findChartSpec()) is the real gate - a fenced block that
        // isn't valid JSON, or doesn't contain a {label,value} array
        // anywhere in it, just falls through to normal code-block
        // rendering, unchanged.
        const blockPattern = /```\w*\s*\n([\s\S]*?)```/gi;
        const blocks = [];
        let result = content.replace(blockPattern, (match, jsonText) => {
            let renderedHtml;
            try {
                const spec = JSON.parse(jsonText.trim());
                renderedHtml = this.generateChartSvg(spec);
            } catch (err) {
                renderedHtml = null;
            }
            // Malformed/unsupported spec: fall back to showing the block as
            // plain text (via marked's own code-fence rendering) rather than
            // silently dropping it - leave the original match untouched.
            if (!renderedHtml) return match;
            blocks.push(renderedHtml);
            return `%%BOUDICA_CHART_${blocks.length - 1}%%`;
        });
        blocks.forEach((html, i) => {
            result = result.replace(`%%BOUDICA_CHART_${i}%%`, html);
        });

        // Last resort: a bare, unfenced chart-spec object directly in the
        // text - confirmed live 2026-08-29 as a real case, not
        // hypothetical (the model has emitted JSON with no code fence at
        // all). extractJsonObjects() finds balanced {...} substrings via a
        // brace counter (regex can't reliably match nested braces);
        // findChartSpec() is still the real gate, so this only fires on
        // something that actually parses as JSON and structurally
        // contains a {label,value} array - not on arbitrary prose braces.
        const bareObjects = this.extractJsonObjects(result);
        for (let i = bareObjects.length - 1; i >= 0; i--) {
            const obj = bareObjects[i];
            const rendered = this.generateChartSvg(obj.value);
            if (!rendered) continue;
            result = result.slice(0, obj.start) + rendered + result.slice(obj.end);
        }

        return result;
    }

    /**
     * Finds balanced top-level {...} substrings in text via a brace
     * counter (not regex - nested braces can't be matched reliably with
     * regex) and returns each one that parses as valid JSON, with its
     * position in the original string. See renderChartBlocks()'s bare-
     * object fallback for why this exists.
     */
    extractJsonObjects(text) {
        const results = [];
        let depth = 0, start = -1;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (c === '}') {
                if (depth > 0) {
                    depth--;
                    if (depth === 0 && start !== -1) {
                        const candidate = text.slice(start, i + 1);
                        try {
                            results.push({ start, end: i + 1, value: JSON.parse(candidate) });
                        } catch (err) {
                            // Not valid JSON on its own (e.g. a fragment of prose
                            // or code that merely contains braces) - skip it.
                        }
                        start = -1;
                    }
                }
            }
        }
        return results;
    }

    /**
     * Normalizes a raw chart-type string (from wherever the model put it -
     * key name varies, see findChartType()) to one of 'pie'|'bar'|
     * 'histogram'|'scatter'|'line', or null if it isn't a recognized type.
     */
    chartTypeFromString(v) {
        if (typeof v !== 'string') return null;
        const s = v.trim().toLowerCase().replace(/[\s_-]+/g, '');
        if (s === 'pie') return 'pie';
        if (s === 'bar') return 'bar';
        if (s === 'histogram') return 'histogram';
        if (s === 'scatter' || s === 'scatterplot') return 'scatter';
        if (s === 'line' || s === 'linegraph' || s === 'linechart') return 'line';
        return null;
    }

    /**
     * Walks a parsed JSON value looking for ANY string that names a
     * supported chart type (see chartTypeFromString()), regardless of
     * which key it's under - confirmed live 2026-08-29 the model has used
     * "type" once and "chart_type" another time for the exact same thing.
     * Used to decide which data-shape finder to use (findChartSpec() for
     * pie/bar/histogram/line, findScatterSpec() for scatter - scatter
     * needs numeric x/y pairs, not label+value, so the right finder has to
     * be chosen before either one runs). Returns null (caller defaults to
     * 'pie') if nothing matches.
     */
    findChartType(obj, depth = 0) {
        if (depth > 4 || obj === null || typeof obj !== 'object') return null;
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const found = this.findChartType(item, depth + 1);
                if (found) return found;
            }
            return null;
        }
        for (const v of Object.values(obj)) {
            const t = this.chartTypeFromString(v);
            if (t) return t;
        }
        for (const v of Object.values(obj)) {
            const found = this.findChartType(v, depth + 1);
            if (found) return found;
        }
        return null;
    }

    /**
     * True if d has at least two number-valued fields - the generic shape
     * of a scatter point, regardless of field names (x/y, or anything
     * else - see extractScatterPoint()).
     */
    isScatterPointLike(d) {
        if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
        return Object.values(d).filter(v => typeof v === 'number').length >= 2;
    }

    /** Prefers explicit x/y keys; otherwise the first two numeric fields, in order. */
    extractScatterPoint(d) {
        if (typeof d.x === 'number' && typeof d.y === 'number') return { x: d.x, y: d.y };
        const nums = Object.values(d).filter(v => typeof v === 'number');
        return { x: nums[0], y: nums[1] };
    }

    /**
     * Same idea as findChartSpec(), but for scatter data: an array of
     * {x, y}-like objects (any field names, see isScatterPointLike()) or
     * an array of [x, y] two-element numeric tuples.
     */
    findScatterSpec(obj, depth = 0) {
        if (depth > 4 || obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            return null;
        }
        const title = typeof obj.title === 'string' ? obj.title : null;

        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (Array.isArray(val) && val.length > 0) {
                if (val.every(d => this.isScatterPointLike(d))) {
                    return { points: val.map(d => this.extractScatterPoint(d)), title };
                }
                if (val.every(d => Array.isArray(d) && d.length >= 2 &&
                                    typeof d[0] === 'number' && typeof d[1] === 'number')) {
                    return { points: val.map(d => ({ x: d[0], y: d[1] })), title };
                }
            }
        }
        for (const key of Object.keys(obj)) {
            const found = this.findScatterSpec(obj[key], depth + 1);
            if (found) return found;
        }
        return null;
    }

    /**
     * True if d is an object with at least one string-valued field and at
     * least one number-valued field - the generic shape of a single chart
     * data point, regardless of what the model happened to name those two
     * fields (label/value, sector/count, name/amount, category/total, ...).
     * Confirmed live 2026-08-29 as a real case: {"sector":"...","count":N}
     * was rejected outright when this only recognized literal "label"/
     * "value" keys.
     */
    isChartPointLike(d) {
        if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
        let hasString = false, hasNumber = false;
        for (const v of Object.values(d)) {
            if (typeof v === 'string') hasString = true;
            else if (typeof v === 'number') hasNumber = true;
        }
        return hasString && hasNumber;
    }

    /**
     * Extracts {label, value} from a chart-point-like object, using
     * whichever fields are the first string-valued and first number-valued
     * ones found (key names ignored - see isChartPointLike()).
     */
    extractChartPoint(d) {
        let label = null, value = null;
        for (const v of Object.values(d)) {
            if (label === null && typeof v === 'string') label = v;
            else if (value === null && typeof v === 'number') value = v;
        }
        return { label, value };
    }

    /**
     * Walks a parsed JSON object/array looking for the first array of
     * chart-point-like objects (see isChartPointLike()); a plain
     * {label: value, ...} map (confirmed live 2026-08-29 as a real shape
     * the model used for "data" instead of an array); or a Chart.js-style
     * pair of parallel arrays (labels/categories/names + values/data/counts,
     * same length) - regardless of what key(s) any of these are nested
     * under, and regardless of the field names used inside each data point.
     * Returns {data, title, chartType} (title from a sibling "title" key,
     * chartType from any sibling string value matching "pie"/"bar" -
     * confirmed live 2026-08-29 the model used "chart_type" one time and
     * "type" another - defaults to null, caller decides the fallback) or
     * null. Depth-limited to 4 to bound the search on deeply nested/
     * unrelated JSON.
     *
     * This function has been widened four times in one session as the
     * model produced a new shape each attempt despite being told the exact
     * format to use - see appendChartFormatHint() in app.js. That pattern
     * is the actual reason this searches structurally instead of expecting
     * one shape: a model's compliance with an exact JSON schema isn't
     * reliable, so the parser has to be permissive by design rather than
     * patched reactively forever.
     */
    findChartSpec(obj, depth = 0) {
        if (depth > 4 || obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            return null;
        }

        const title = typeof obj.title === 'string' ? obj.title : null;
        let chartType = null;
        for (const v of Object.values(obj)) {
            const t = this.chartTypeFromString(v);
            if (t) { chartType = t; break; }
        }

        // Chart.js-style parallel arrays at this level.
        const labelKeys = ['labels', 'categories', 'names'];
        const valueKeys = ['values', 'data', 'counts'];
        for (const lk of labelKeys) {
            for (const vk of valueKeys) {
                const labels = obj[lk], values = obj[vk];
                if (Array.isArray(labels) && Array.isArray(values) &&
                    labels.length > 0 && labels.length === values.length &&
                    labels.every(l => typeof l === 'string') && values.every(v => typeof v === 'number')) {
                    return { data: labels.map((label, i) => ({ label, value: values[i] })), title, chartType };
                }
            }
        }

        // Real Chart.js config shape - confirmed live 2026-08-29 as an
        // actual case, not hypothetical: {labels:[...], datasets:[{data:
        // [...], label:"...", backgroundColor:"..."}]}. The values array
        // is nested inside the first dataset object here, not a sibling
        // of "labels" the way the parallel-arrays check above expects -
        // genuinely different shape, worth its own explicit check rather
        // than trying to force it through the generic one. Only the first
        // dataset is used; multi-series charts aren't rendered specially.
        if (Array.isArray(obj.labels) && obj.labels.length > 0 && obj.labels.every(l => typeof l === 'string') &&
            Array.isArray(obj.datasets) && obj.datasets.length > 0) {
            const firstDataset = obj.datasets[0];
            if (firstDataset && Array.isArray(firstDataset.data) &&
                firstDataset.data.length === obj.labels.length &&
                firstDataset.data.every(v => typeof v === 'number')) {
                return {
                    data: obj.labels.map((label, i) => ({ label, value: firstDataset.data[i] })),
                    title,
                    chartType
                };
            }
        }

        for (const key of Object.keys(obj)) {
            const val = obj[key];
            // Array of chart-point-like objects (any string+number field pair).
            if (Array.isArray(val) && val.length > 0 && val.every(d => this.isChartPointLike(d))) {
                return { data: val.map(d => this.extractChartPoint(d)), title, chartType };
            }
            // Plain {label: value, ...} map.
            if (val && typeof val === 'object' && !Array.isArray(val)) {
                const entries = Object.entries(val);
                if (entries.length > 0 && entries.every(([, v]) => typeof v === 'number')) {
                    return { data: entries.map(([label, value]) => ({ label, value })), title, chartType };
                }
            }
        }

        for (const key of Object.keys(obj)) {
            const found = this.findChartSpec(obj[key], depth + 1);
            if (found) return found;
        }
        return null;
    }

    /**
     * Dispatches to a real (trigonometry/geometry-computed, not model-
     * drawn) chart renderer - see renderChartBlocks() for why this exists
     * at all. Supports pie/bar/histogram/line (all share the label+value
     * data shape via findChartSpec()) and scatter (numeric x/y pairs via
     * findScatterSpec() - a genuinely different shape, so chart type has
     * to be determined FIRST to pick the right finder). Unrecognized
     * chartType or a malformed/empty spec returns null so the caller falls
     * back to showing the raw block instead of a blank space. Defaults to
     * 'pie' when findChartType() couldn't determine one.
     */
    generateChartSvg(rawSpec) {
        if (!rawSpec) return null;
        // Don't expect a specific top-level shape - confirmed live
        // 2026-08-29 across several consecutive attempts that the model
        // uses a different wrapper key, data shape, and field names every
        // time despite being told the exact format to emit. Chasing each
        // new variant isn't a fix, it's whack-a-mole - findChartSpec()/
        // findScatterSpec() below search the parsed JSON structurally for
        // chart-shaped data wherever it's nested, under whatever key names
        // were used. This is robust to any wrapper the model invents, not
        // just the ones seen so far.
        const chartType = this.findChartType(rawSpec) || 'pie';

        if (chartType === 'scatter') {
            const found = this.findScatterSpec(rawSpec);
            if (!found) return null;
            const points = found.points.filter(p => typeof p.x === 'number' && typeof p.y === 'number');
            if (points.length === 0) return null;
            return this.generateScatterSvg(points, found.title);
        }

        const found = this.findChartSpec(rawSpec);
        if (!found) return null;
        const data = found.data.filter(d => d && typeof d.value === 'number' && d.value > 0 && d.label);
        if (data.length === 0) return null;

        if (chartType === 'bar' || chartType === 'histogram') {
            return this.generateBarChartSvg(data, found.title);
        }
        if (chartType === 'line') {
            return this.generateLineChartSvg(data, found.title);
        }
        return this.generatePieChartSvg(data, found.title);
    }

    generatePieChartSvg(data, title) {
        const total = data.reduce((sum, d) => sum + d.value, 0);
        const cx = 150, cy = 150, r = 120;
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFD93D', '#A78BFA', '#F783AC', '#63E6BE'];

        let cumulativeDeg = 0;
        const slices = data.map((d, i) => {
            const sliceDeg = (d.value / total) * 360;
            const startDeg = cumulativeDeg;
            cumulativeDeg += sliceDeg;
            const endDeg = cumulativeDeg;

            // Standard SVG pie-wedge path: center -> line to arc start ->
            // arc to arc end -> close back to center. This (not a triangle
            // between two arbitrary edge points) is what guarantees wedges
            // that actually meet at the center with no gap/overlap.
            const startRad = (startDeg - 90) * Math.PI / 180;
            const endRad = (endDeg - 90) * Math.PI / 180;
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);
            const largeArc = sliceDeg > 180 ? 1 : 0;

            return {
                path: `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`,
                color: colors[i % colors.length],
                label: d.label,
                pct: ((d.value / total) * 100).toFixed(1)
            };
        });

        // Single-line, no incidental leading whitespace - CommonMark treats
        // a line indented 4+ spaces as a literal indented code block, not
        // HTML. Confirmed live 2026-08-29: this generated HTML gets
        // substituted into markdown source that then goes through
        // marked.parse(), and a multi-line template literal's own JS
        // source indentation (12+ spaces per line) was carried straight
        // into the output, so everything past the first line rendered as
        // literal escaped text instead of real markup.
        const legendItems = slices.map(s =>
            `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-size:13px;">`
            + `<span style="width:12px;height:12px;background:${s.color};display:inline-block;border-radius:2px;flex-shrink:0;"></span>`
            + `<span>${this.escapeHtml(s.label)} — ${s.pct}%</span></div>`
        ).join('');

        const titleHtml = title
            ? `<div style="font-weight:600;margin-bottom:8px;">${this.escapeHtml(title)}</div>`
            : '';

        return `<div class="boudica-chart" style="max-width:420px;margin:12px 0;">`
            + titleHtml
            + `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">`
            + `<svg width="220" height="220" viewBox="0 0 300 300">`
            + slices.map(s => `<path d="${s.path}" fill="${s.color}" stroke="white" stroke-width="2"/>`).join('')
            + `</svg><div>${legendItems}</div></div></div>`;
    }

    /**
     * Also used for 'histogram' - the KYC/fraud/etc. data this renders is
     * genuinely categorical (sector counts), not continuous binned data,
     * so a real histogram (bars touching, continuous numeric x-axis) isn't
     * a meaningfully different chart for anything actually requested so
     * far. Revisit with a dedicated renderer if that changes.
     */
    generateBarChartSvg(data, title) {
        const width = 420, marginLeft = 150, marginRight = 50, rowHeight = 34, barHeightPx = 20;
        const height = data.length * rowHeight + 20;
        const chartWidth = width - marginLeft - marginRight;
        const maxValue = Math.max(...data.map(d => d.value));
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFD93D', '#A78BFA', '#F783AC', '#63E6BE'];

        const bars = data.map((d, i) => {
            const barWidth = Math.max(2, (d.value / maxValue) * chartWidth);
            const y = 10 + i * rowHeight;
            const textY = y + barHeightPx / 2 + 4;
            const color = colors[i % colors.length];
            return `<text x="${marginLeft - 8}" y="${textY.toFixed(1)}" text-anchor="end" font-size="12" fill="currentColor">${this.escapeHtml(d.label)}</text>`
                + `<rect x="${marginLeft}" y="${y}" width="${barWidth.toFixed(1)}" height="${barHeightPx}" fill="${color}" rx="2"/>`
                + `<text x="${(marginLeft + barWidth + 6).toFixed(1)}" y="${textY.toFixed(1)}" font-size="12" fill="currentColor">${d.value}</text>`;
        }).join('');

        const titleHtml = title
            ? `<div style="font-weight:600;margin-bottom:8px;">${this.escapeHtml(title)}</div>`
            : '';

        return `<div class="boudica-chart" style="max-width:${width}px;margin:12px 0;">`
            + titleHtml
            + `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="color:var(--text-primary,#333);">`
            + bars
            + `</svg></div>`;
    }

    /** Points evenly spaced along x by index (categorical, matching bar/pie's label+value shape), y scaled to the value range. */
    generateLineChartSvg(data, title) {
        const width = 420, height = 240, marginLeft = 40, marginRight = 20, marginTop = 20, marginBottom = 50;
        const plotW = width - marginLeft - marginRight;
        const plotH = height - marginTop - marginBottom;
        const values = data.map(d => d.value);
        const minV = Math.min(0, ...values);
        const maxV = Math.max(...values);
        const range = (maxV - minV) || 1;
        const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;

        const points = data.map((d, i) => ({
            x: marginLeft + i * stepX,
            y: marginTop + plotH - ((d.value - minV) / range) * plotH,
            label: d.label
        }));

        const polylinePoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const dots = points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#4ECDC4"/>`).join('');
        const xLabels = points.map(p =>
            `<text x="${p.x.toFixed(1)}" y="${(marginTop + plotH + 16).toFixed(1)}" text-anchor="middle" font-size="11" fill="currentColor">${this.escapeHtml(p.label)}</text>`
        ).join('');
        const axisLine = `<line x1="${marginLeft}" y1="${(marginTop + plotH).toFixed(1)}" x2="${(marginLeft + plotW).toFixed(1)}" y2="${(marginTop + plotH).toFixed(1)}" stroke="currentColor" stroke-opacity="0.3"/>`;

        const titleHtml = title
            ? `<div style="font-weight:600;margin-bottom:8px;">${this.escapeHtml(title)}</div>`
            : '';

        return `<div class="boudica-chart" style="max-width:${width}px;margin:12px 0;">`
            + titleHtml
            + `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="color:var(--text-primary,#333);">`
            + axisLine
            + `<polyline points="${polylinePoints}" fill="none" stroke="#4ECDC4" stroke-width="2"/>`
            + dots + xLabels
            + `</svg></div>`;
    }

    /** Both axes auto-scaled to the data's own min/max - see findScatterSpec() for the x/y data shape this expects. */
    generateScatterSvg(points, title) {
        const width = 320, height = 260, margin = 30;
        const xs = points.map(p => p.x), ys = points.map(p => p.y);
        const xMin = Math.min(...xs), xMax = Math.max(...xs);
        const yMin = Math.min(...ys), yMax = Math.max(...ys);
        const xRange = (xMax - xMin) || 1, yRange = (yMax - yMin) || 1;
        const plotW = width - margin * 2, plotH = height - margin * 2;
        const scaleX = x => margin + ((x - xMin) / xRange) * plotW;
        const scaleY = y => (height - margin) - ((y - yMin) / yRange) * plotH;

        const dots = points.map(p =>
            `<circle cx="${scaleX(p.x).toFixed(1)}" cy="${scaleY(p.y).toFixed(1)}" r="4" fill="#4ECDC4" fill-opacity="0.8"/>`
        ).join('');
        const axisLines = `<line x1="${margin}" y1="${height - margin}" x2="${width - margin}" y2="${height - margin}" stroke="currentColor" stroke-opacity="0.3"/>`
            + `<line x1="${margin}" y1="${margin}" x2="${margin}" y2="${height - margin}" stroke="currentColor" stroke-opacity="0.3"/>`;

        const titleHtml = title
            ? `<div style="font-weight:600;margin-bottom:8px;">${this.escapeHtml(title)}</div>`
            : '';

        return `<div class="boudica-chart" style="max-width:${width}px;margin:12px 0;">`
            + titleHtml
            + `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="color:var(--text-primary,#333);">`
            + axisLines + dots
            + `</svg></div>`;
    }

    /**
     * Sanitizes any raw <svg>...</svg> the model draws directly (as
     * opposed to a ```chart block, see renderChartBlocks() above) before
     * letting it reach the DOM. Required because marked.setOptions
     * ({sanitize:false}) already lets raw HTML blocks through untouched,
     * and SVG can carry <script>/on*="" attributes that execute on
     * insertion via innerHTML - this content is fully model-controlled (a
     * crafted prompt, or the model quoting back RAG-injected content), so
     * it must never reach the DOM unsanitized. Same placeholder-token
     * approach as renderChartBlocks() for the same reason.
     */
    sanitizeInlineSvg(content) {
        if (typeof DOMPurify === 'undefined') return content;
        const svgPattern = /<svg[\s>][\s\S]*?<\/svg>/gi;
        if (!svgPattern.test(content)) return content;
        svgPattern.lastIndex = 0;

        const blocks = [];
        const withPlaceholders = content.replace(svgPattern, (match) => {
            blocks.push(DOMPurify.sanitize(match, { USE_PROFILES: { svg: true, svgFilters: true } }));
            return `%%BOUDICA_RAWSVG_${blocks.length - 1}%%`;
        });

        let result = withPlaceholders;
        blocks.forEach((html, i) => {
            result = result.replace(`%%BOUDICA_RAWSVG_${i}%%`, html);
        });
        return result;
    }

    /**
     * Escape HTML entities
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Basic markdown formatting (fallback)
     */
    basicMarkdownFormat(content) {
        let formatted = this.escapeHtml(content);
        
        // Code blocks
        formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        
        // Inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
    }

    /**
     * Format timestamp
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        // Less than 1 minute
        if (diff < 60000) {
            return 'Just now';
        }
        
        // Less than 1 hour
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes}m ago`;
        }
        
        // Less than 24 hours
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours}h ago`;
        }
        
        // Format as date/time
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Scroll chat to bottom
     */
    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    /**
     * Handle new chat
     */
    handleNewChat() {
        if (this.htmlPreviewFrame) {
            this.htmlPreviewFrame.srcdoc = '';
        }
        this._lastHtmlContent = null;
        this._htmlStreamingPlaceholderActive = false;
        this._htmlStreamingBuffer = null;
        this.closeHtmlPreview();

        const chat = this.storage.createNewChat();
        this.loadChat(chat.id);
        this.loadChatHistory();
    }

    /**
     * Handle clear chat
     */
    handleClearChat() {
        if (!this.currentChatId) return;
        
        if (confirm('Are you sure you want to clear this conversation?')) {
            const chat = this.storage.getChat(this.currentChatId);
            if (chat) {
                chat.messages = [];
                this.storage.saveChat(chat);
                this.loadChat(this.currentChatId);
            }
        }
    }

    /**
     * Handle delete chat
     */
    handleDeleteChat(chatId) {
        const chat = this.storage.getChat(chatId);
        if (!chat) return;
        
        if (confirm(`Are you sure you want to delete "${chat.title}"? This cannot be undone.`)) {
            // Delete from storage
            this.storage.deleteChat(chatId);
            
            // If deleted chat was current, clear the HTML preview and create a new chat
            if (chatId === this.currentChatId) {
                // Clear and close the HTML preview panel
                if (this.htmlPreviewFrame) {
                    this.htmlPreviewFrame.srcdoc = '';
                }
                this._lastHtmlContent = null;
                this._htmlStreamingPlaceholderActive = false;
                this._htmlStreamingBuffer = null;
                localStorage.removeItem('boudica_last_html');
                this.closeHtmlPreview();

                const newChat = this.storage.createNewChat();
                this.loadChat(newChat.id);
            }
            
            // Reload history
            this.loadChatHistory();
        }
    }

    /**
     * Handle copy message to clipboard
     */
    async handleCopyMessage(messageId, button) {
        if (!this.currentChatId) return;
        
        // Get the raw message content from storage
        const chat = this.storage.getChat(this.currentChatId);
        if (!chat) return;
        
        const message = chat.messages.find(m => m.id === messageId);
        if (!message) return;
        
        try {
            // Copy the raw content (markdown, HTML, or plain text)
            await navigator.clipboard.writeText(message.content);
            
            // Visual feedback - change button text temporarily
            const originalHTML = button.innerHTML;
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Copied!
            `;
            button.style.color = 'var(--success-color)';
            button.style.borderColor = 'var(--success-color)';
            
            // Reset after 2 seconds
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.style.color = '';
                button.style.borderColor = '';
            }, 2000);
            
        } catch (error) {
            console.error('Failed to copy message:', error);
            
            // Show error feedback
            const originalHTML = button.innerHTML;
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                Failed
            `;
            button.style.color = 'var(--error-color)';
            button.style.borderColor = 'var(--error-color)';
            
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.style.color = '';
                button.style.borderColor = '';
            }, 2000);
        }
    }

    /**
     * Handle rate message - show star rating UI
     */
    handleRateMessage(messageId, button) {
        console.log('handleRateMessage called with messageId:', messageId);
        const messageDiv = button.closest('.message');
        console.log('messageDiv:', messageDiv);
        const auditId = messageDiv.getAttribute('data-audit-id');
        console.log('auditId:', auditId);
        
        if (!auditId || auditId === 'null') {
            console.warn('No audit ID available');
            this.showToast('Cannot rate this message - no audit ID available', 'error');
            return;
        }

        // Create rating popup
        const existingRating = messageDiv.querySelector('.rating-popup');
        if (existingRating) {
            existingRating.remove();
            return;
        }

        console.log('Creating rating popup...');
        const ratingPopup = document.createElement('div');
        ratingPopup.className = 'rating-popup';
        
        ratingPopup.innerHTML = `
            <div class="rating-popup-content">
                <div class="rating-title">Rate this response:</div>
                <div class="rating-stars">
                    <button class="star-btn" data-rating="1" title="1 star - Poor">★</button>
                    <button class="star-btn" data-rating="2" title="2 stars - Fair">★</button>
                    <button class="star-btn" data-rating="3" title="3 stars - Good">★</button>
                    <button class="star-btn" data-rating="4" title="4 stars - Very Good">★</button>
                    <button class="star-btn" data-rating="5" title="5 stars - Excellent">★</button>
                </div>
                <button class="rating-cancel">Cancel</button>
            </div>
        `;

        // Add star hover effects
        const stars = ratingPopup.querySelectorAll('.star-btn');
        console.log('Found stars:', stars.length);
        stars.forEach((star, index) => {
            console.log('Setting up star:', index, star);
            star.addEventListener('mouseenter', () => {
                console.log('Star mouseenter:', index);
                stars.forEach((s, i) => {
                    if (i <= index) {
                        s.classList.add('hover');
                    } else {
                        s.classList.remove('hover');
                    }
                });
            });

            star.addEventListener('click', async (e) => {
                console.log('Star clicked - event:', e);
                console.log('Star clicked - target:', e.target);
                console.log('Star clicked - rating:', star.getAttribute('data-rating'));
                e.preventDefault();
                e.stopPropagation();
                const rating = parseInt(star.getAttribute('data-rating'));
                await this.submitRating(auditId, rating, messageId);
                ratingPopup.remove();
            });
        });

        ratingPopup.addEventListener('mouseleave', () => {
            stars.forEach(s => s.classList.remove('hover'));
        });

        // Cancel button
        ratingPopup.querySelector('.rating-cancel').addEventListener('click', () => {
            console.log('Rating cancelled');
            ratingPopup.remove();
        });

        messageDiv.appendChild(ratingPopup);
        
        // Position it with fixed positioning after adding to DOM so we can measure it
        const buttonRect = button.getBoundingClientRect();
        const popupHeight = ratingPopup.offsetHeight;
        
        ratingPopup.style.position = 'fixed';
        ratingPopup.style.top = (buttonRect.top - popupHeight - 10) + 'px';  // 10px gap above button
        ratingPopup.style.left = buttonRect.left + 'px';
        ratingPopup.style.right = 'auto';  // Override CSS right
        ratingPopup.style.bottom = 'auto';  // Override CSS bottom
        
        console.log('Rating popup added to message');
        console.log('Popup element:', ratingPopup);
        console.log('Button rect:', buttonRect);
        console.log('Popup height:', popupHeight);
        console.log('Calculated top:', (buttonRect.top - popupHeight - 10));
    }

    /**
     * Submit rating to backend
     */
    async submitRating(auditId, rating, messageId) {
        console.log('submitRating called:', { auditId, rating, messageId });
        try {
            // Send rating command to backend
            const ratingCommand = `rate #${auditId} as ${rating}`;
            console.log('Rating command:', ratingCommand);
            
            // Get current chat ID from the UI
            const chatId = this.currentChatId || this.storage.getCurrentChatId();
            console.log('Chat ID:', chatId);
            if (!chatId) {
                console.error('No chat ID found');
                this.showToast('No active chat', 'error');
                return;
            }
            
            // Create a simple message object
            const message = {
                role: 'user',
                content: ratingCommand,
                timestamp: new Date().toISOString()
            };
            console.log('Message object:', message);
            console.log('About to call sendMessage...');
            
            // Send without streaming
            const response = await this.api.sendMessage(chatId, message, null, null);
            console.log('Response received:', response);
            
            if (response && response.content) {
                this.showToast('Rating submitted successfully!', 'success');
                
                // Update button to show rating was submitted
                const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageDiv) {
                    const rateBtn = messageDiv.querySelector('[data-action="rate"]');
                    if (rateBtn) {
                        rateBtn.innerHTML = `
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="gold" stroke="currentColor" stroke-width="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                            ${rating} ★
                        `;
                        rateBtn.disabled = true;
                        rateBtn.style.opacity = '0.6';
                    }
                }
            }
        } catch (error) {
            console.error('Rating submission error:', error);
            console.error('Error stack:', error.stack);
            this.showToast('Failed to submit rating: ' + error.message, 'error');
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Handle redo message - resend the last prompt
     */
    handleRedoMessage(messageId, button) {
        if (!this.currentChatId) return;
        
        // Get the current chat
        const chat = this.storage.getChat(this.currentChatId);
        if (!chat) return;
        
        // Find the assistant message index
        const messageIndex = chat.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return;
        
        // Get the user message that came before this assistant message
        let userMessage = null;
        for (let i = messageIndex - 1; i >= 0; i--) {
            if (chat.messages[i].role === 'user') {
                userMessage = chat.messages[i];
                break;
            }
        }
        
        if (!userMessage) {
            console.warn('No user message found before this assistant message');
            return;
        }
        
        // Visual feedback - show the button is processing
        const originalHTML = button.innerHTML;
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
            </svg>
            Sending...
        `;
        button.disabled = true;
        
        // Create a new user message with the same content
        const newUserMessage = {
            role: 'user',
            content: userMessage.content
        };
        
        // Add to storage
        this.storage.addMessage(this.currentChatId, newUserMessage);
        
        // Display message
        this.displayMessage(newUserMessage);
        
        // Hide welcome screen
        this.welcomeScreen.classList.add('hidden');
        
        // Trigger send callback (for API call)
        if (this.onSendMessage) {
            this.onSendMessage(this.currentChatId, newUserMessage);
        }
        
        // Update chat history
        this.loadChatHistory();
        
        // Reset button after a short delay
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 1000);
    }

    /**
     * Handle toggle between formatted and code view
     */
    handleToggleView(messageDiv, button) {
        const contentDiv = messageDiv.querySelector('.message-content');
        if (!contentDiv) return;
        
        const currentMode = contentDiv.getAttribute('data-view-mode') || 'formatted';
        const contentType = contentDiv.getAttribute('data-content-type') || 'markdown';
        const rawContent = contentDiv.getAttribute('data-raw-content') || '';
        
        if (currentMode === 'formatted') {
            // Switch to code view
            const escapedCode = this.escapeHtml(rawContent);
            contentDiv.innerHTML = `<pre><code>${escapedCode}</code></pre>`;
            contentDiv.setAttribute('data-view-mode', 'code');
            
            // Update button
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Show Formatted
            `;
            button.setAttribute('title', 'Show formatted view');
        } else {
            // Switch to formatted view
            const formattedData = this.formatMessageContent(rawContent);
            if (formattedData.type === 'html') {
                contentDiv.innerHTML = `
                    <div class="html-preview-card">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--primary-color)">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                        <div class="html-preview-card-text">
                            <span class="html-preview-card-title">HTML Response</span>
                            <span class="html-preview-card-desc">Rendered in the preview panel →</span>
                        </div>
                    </div>
                `;
                this.openHtmlPreview(this._cleanupHtmlClosingTags(rawContent), false);
            } else {
                contentDiv.innerHTML = formattedData.html;
            }
            contentDiv.setAttribute('data-view-mode', 'formatted');
            
            // Update button
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6"></polyline>
                    <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                Show Code
            `;
            button.setAttribute('title', 'Show code view');
        }
    }

    /**
     * Handle print message
     */
    handlePrintMessage(messageDiv) {
        const contentDiv = messageDiv.querySelector('.message-content');
        if (!contentDiv) return;
        
        // Get the current view mode
        const viewMode = contentDiv.getAttribute('data-view-mode') || 'formatted';
        const contentType = contentDiv.getAttribute('data-content-type') || 'markdown';
        
        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            alert('Please allow popups to print');
            return;
        }
        
        // Get the content HTML
        const contentHTML = contentDiv.innerHTML;
        
        // Write HTML to print window
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print - Boudica Response</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 800px;
                        margin: 20px auto;
                        padding: 20px;
                    }
                    pre {
                        background: #f5f5f5;
                        padding: 12px;
                        border-radius: 4px;
                        overflow-x: auto;
                        border: 1px solid #ddd;
                    }
                    code {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 14px;
                    }
                    h1, h2, h3, h4, h5, h6 {
                        margin-top: 24px;
                        margin-bottom: 12px;
                    }
                    table {
                        border-collapse: collapse;
                        width: 100%;
                        margin: 16px 0;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                    }
                    th {
                        background-color: #f5f5f5;
                    }
                    @media print {
                        body {
                            margin: 0;
                            padding: 20px;
                        }
                    }
                </style>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css">
            </head>
            <body>
                <div class="print-header">
                    <h2>Boudica Response</h2>
                    <p style="color: #666; font-size: 14px;">Generated on ${new Date().toLocaleString()}</p>
                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                </div>
                <div class="content">
                    ${contentHTML}
                </div>
            </body>
            </html>
        `);
        
        printWindow.document.close();
        
        // Wait for content to load, then print
        printWindow.onload = function() {
            setTimeout(() => {
                printWindow.print();
            }, 250);
        };
    }

    /**
     * Load a chat
     */
    loadChat(chatId) {
        const chat = this.storage.getChat(chatId);
        if (!chat) return;
        
        this.currentChatId = chatId;
        this.storage.setCurrentChatId(chatId);
        
        // Migrate legacy default title from old localStorage data
        if (chat.title === 'New Conversation') {
            chat.title = 'OmniIndex Boudica Chat';
            this.storage.saveChat(chat);
        }
        
        // Update title
        this.chatTitle.textContent = chat.title;
        
        // Clear messages
        this.chatMessages.innerHTML = '';
        
        // Show/hide welcome screen
        if (chat.messages.length === 0) {
            this.welcomeScreen.classList.remove('hidden');
            this.chatMessages.appendChild(this.welcomeScreen);
        } else {
            this.welcomeScreen.classList.add('hidden');
            
            // Display messages
            chat.messages.forEach(message => {
                this.displayMessage(message);
            });
        }
        
        // Update active state in history
        this.updateHistoryActiveState(chatId);
        
        // Focus input
        this.chatInput.focus();
    }

    /**
     * Load chat history with folder structure
     */
    loadChatHistory() {
        const chats = this.storage.getAllChats();
        const folders = this.storage.getFolderHierarchy();
        this.chatHistoryList.innerHTML = '';
        
        // Add "New Folder" button
        const newFolderBtn = document.createElement('button');
        newFolderBtn.classList.add('btn-new-folder');
        newFolderBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4.667A1.333 1.333 0 0 1 3.333 3.333h3.334L8 4.667h5.333A1.333 1.333 0 0 1 14.667 6v6.667A1.333 1.333 0 0 1 13.333 14H3.333A1.333 1.333 0 0 1 2 12.667V4.667Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New Folder
        `;
        newFolderBtn.addEventListener('click', () => this.handleCreateFolder(null));
        this.chatHistoryList.appendChild(newFolderBtn);
        
        // Render root folders
        folders.forEach(folder => {
            this.renderFolder(folder);
        });
        
        // Render chats not in any folder
        const rootChats = chats.filter(chat => !chat.folderId);
        rootChats.forEach(chat => {
            const item = this.createHistoryItem(chat);
            this.chatHistoryList.appendChild(item);
        });
        
        if (chats.length === 0 && folders.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.classList.add('empty-history');
            emptyDiv.innerHTML = `
                <div class="empty-history-icon">💬</div>
                <div class="empty-history-text">No conversations yet</div>
            `;
            this.chatHistoryList.appendChild(emptyDiv);
        }
    }

    /**
     * Render folder and its contents recursively
     */
    renderFolder(folder, level = 0) {
        const folderDiv = document.createElement('div');
        folderDiv.classList.add('folder-item');
        folderDiv.setAttribute('data-folder-id', folder.id);
        folderDiv.style.paddingLeft = `${level * 16}px`;
        
        const isExpanded = this.expandedFolders.has(folder.id);
        
        // Folder header
        const header = document.createElement('div');
        header.classList.add('folder-header');
        header.innerHTML = `
            <svg class="folder-icon ${isExpanded ? 'expanded' : ''}" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg class="folder-icon-folder" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4.667A1.333 1.333 0 0 1 3.333 3.333h3.334L8 4.667h5.333A1.333 1.333 0 0 1 14.667 6v6.667A1.333 1.333 0 0 1 13.333 14H3.333A1.333 1.333 0 0 1 2 12.667V4.667Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="folder-name">${folder.name}</span>
            <div class="folder-actions">
                <button class="folder-action-btn" data-action="add" title="New subfolder">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </button>
                <button class="folder-action-btn" data-action="delete" title="Delete folder">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 3h8M4 3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1m1.5 0v7a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V3h7.5Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Toggle expand/collapse
        header.addEventListener('click', (e) => {
            if (e.target.closest('.folder-action-btn')) return;
            this.toggleFolder(folder.id);
        });
        
        // Action buttons
        header.querySelector('[data-action="add"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleCreateFolder(folder.id);
        });
        
        header.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDeleteFolder(folder.id);
        });
        
        // Make folder a drop target
        folderDiv.addEventListener('dragover', (e) => {
            e.preventDefault();
            folderDiv.classList.add('drag-over');
        });
        
        folderDiv.addEventListener('dragleave', () => {
            folderDiv.classList.remove('drag-over');
        });
        
        folderDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            folderDiv.classList.remove('drag-over');
            if (this.draggedItem) {
                this.storage.moveChatToFolder(this.draggedItem, folder.id);
                this.loadChatHistory();
            }
        });
        
        folderDiv.appendChild(header);
        this.chatHistoryList.appendChild(folderDiv);
        
        // Render folder contents if expanded
        if (isExpanded) {
            // Render child folders
            if (folder.children && folder.children.length > 0) {
                folder.children.forEach(child => {
                    this.renderFolder(child, level + 1);
                });
            }
            
            // Render chats in this folder
            const folderChats = this.storage.getChatsInFolder(folder.id);
            folderChats.forEach(chat => {
                const item = this.createHistoryItem(chat, level + 1);
                this.chatHistoryList.appendChild(item);
            });
        }
    }

    /**
     * Toggle folder expansion
     */
    toggleFolder(folderId) {
        if (this.expandedFolders.has(folderId)) {
            this.expandedFolders.delete(folderId);
        } else {
            this.expandedFolders.add(folderId);
        }
        this.loadChatHistory();
    }

    /**
     * Handle create folder
     */
    handleCreateFolder(parentId) {
        const name = prompt('Enter folder name:', parentId ? 'New Subfolder' : 'New Folder');
        if (name && name.trim()) {
            this.storage.createFolder(name.trim(), parentId);
            if (parentId) {
                this.expandedFolders.add(parentId);
            }
            this.loadChatHistory();
        }
    }

    /**
     * Handle delete folder
     */
    handleDeleteFolder(folderId) {
        const folder = this.storage.getFolder(folderId);
        if (!folder) return;
        
        const chatsCount = this.storage.getChatsInFolder(folderId).length;
        const childFolders = this.storage.getChildFolderIds(folderId).length;
        
        let message = `Delete folder "${folder.name}"?`;
        if (chatsCount > 0 || childFolders > 0) {
            message += `\n\nThis folder contains ${chatsCount} conversation(s) and ${childFolders} subfolder(s).`;
            message += '\nAll contents will be moved to root.';
        }
        
        if (confirm(message)) {
            this.storage.deleteFolder(folderId, null);
            this.expandedFolders.delete(folderId);
            this.loadChatHistory();
        }
    }

    /**
     * Create history item element
     */
    createHistoryItem(chat, level = 0) {
        const item = document.createElement('div');
        item.classList.add('chat-history-item');
        item.setAttribute('data-chat-id', chat.id);
        item.setAttribute('draggable', 'true');
        item.style.paddingLeft = `${Math.max(12, level * 16 + 12)}px`;
        
        if (chat.id === this.currentChatId) {
            item.classList.add('active');
        }
        
        const preview = chat.messages.length > 0 
            ? chat.messages[chat.messages.length - 1].content.substring(0, 60) 
            : 'No messages';
        
        // Create editable title
        const titleDiv = document.createElement('div');
        titleDiv.classList.add('chat-history-item-title');
        titleDiv.textContent = chat.title;
        titleDiv.contentEditable = false;
        
        // Double-click to edit
        titleDiv.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            titleDiv.contentEditable = true;
            titleDiv.focus();
            // Select all text
            const range = document.createRange();
            range.selectNodeContents(titleDiv);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        
        // Save on blur or Enter
        const saveTitle = () => {
            titleDiv.contentEditable = false;
            const newTitle = titleDiv.textContent.trim() || 'Untitled Chat';
            titleDiv.textContent = newTitle;
            
            // Update storage
            const chatData = this.storage.getChat(chat.id);
            if (chatData) {
                chatData.title = newTitle;
                this.storage.saveChat(chatData);
                
                // Update main title if this is current chat
                if (chat.id === this.currentChatId) {
                    this.chatTitle.textContent = newTitle;
                }
            }
        };
        
        titleDiv.addEventListener('blur', saveTitle);
        titleDiv.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleDiv.blur();
            } else if (e.key === 'Escape') {
                titleDiv.textContent = chat.title;
                titleDiv.blur();
            }
        });
        
        const previewDiv = document.createElement('div');
        previewDiv.classList.add('chat-history-item-preview');
        previewDiv.textContent = preview;
        
        const dateDiv = document.createElement('div');
        dateDiv.classList.add('chat-history-item-date');
        dateDiv.textContent = this.formatTimestamp(chat.updatedAt);
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('chat-history-item-delete');
        deleteBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        deleteBtn.title = 'Delete conversation';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDeleteChat(chat.id);
        });
        
        item.appendChild(titleDiv);
        item.appendChild(previewDiv);
        item.appendChild(dateDiv);
        item.appendChild(deleteBtn);
        
        item.addEventListener('click', (e) => {
            // Don't load chat if editing title
            if (titleDiv.contentEditable === 'true') {
                e.stopPropagation();
                return;
            }
            this.loadChat(chat.id);
        });
        
        // Drag and drop events
        item.addEventListener('dragstart', (e) => {
            this.draggedItem = chat.id;
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragend', () => {
            this.draggedItem = null;
            item.classList.remove('dragging');
        });
        
        return item;
    }

    /**
     * Update active state in history
     */
    updateHistoryActiveState(chatId) {
        const items = this.chatHistoryList.querySelectorAll('.chat-history-item');
        items.forEach(item => {
            if (item.getAttribute('data-chat-id') === chatId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    /**
     * Handle search history
     */
    handleSearchHistory(e) {
        const query = e.target.value.trim();
        
        if (!query) {
            this.loadChatHistory();
            return;
        }
        
        const results = this.storage.searchChats(query);
        this.chatHistoryList.innerHTML = '';
        
        if (results.length === 0) {
            this.chatHistoryList.innerHTML = `
                <div class="empty-history">
                    <div class="empty-history-icon">🔍</div>
                    <div class="empty-history-text">No results found</div>
                </div>
            `;
            return;
        }
        
        results.forEach(chat => {
            const item = this.createHistoryItem(chat);
            this.chatHistoryList.appendChild(item);
        });
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        // Clean up any existing loading indicators from previous responses
        const existingIndicators = this.chatMessages.querySelectorAll('.loading-indicator');
        existingIndicators.forEach(indicator => indicator.remove());
        
        // Lock input and start the gold race line — prompt is now sent to the server
        this.lockInput();
        this.startRaceLine();
        
        const typingMessage = {
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString()
        };
        
        return this.displayMessage(typingMessage, true);
    }

    /**
     * Remove typing indicator (dots only, keeps working indicator)
     */
    removeTypingIndicator() {
        const typingMsg = this.chatMessages.querySelector('.message.typing');
        if (typingMsg) {
            typingMsg.remove();
        }
    }

    /**
     * Remove typing indicator and hide working indicator
     */
    removeTypingIndicatorComplete() {
        this.hideWorkingIndicator();
        const typingMsg = this.chatMessages.querySelector('.message.typing');
        if (typingMsg) {
            typingMsg.remove();
        }
    }

    /**
     * Show working indicator
     */
    /**
     * Lock the prompt input while awaiting a response.
     * Makes the textarea read-only and visually greyed out.
     */
    lockInput() {
        const wrapper = this.chatInput && this.chatInput.closest('.chat-input-wrapper');
        if (wrapper) wrapper.classList.add('chat-input-wrapper--waiting');
        if (this.chatInput) {
            this.chatInput.readOnly = true;
            this.chatInput.setAttribute('placeholder', 'Waiting for response…');
        }
        if (this.sendBtn) this.sendBtn.disabled = true;
    }

    /**
     * Unlock the prompt input after the response is fully downloaded.
     */
    unlockInput() {
        const wrapper = this.chatInput && this.chatInput.closest('.chat-input-wrapper');
        if (wrapper) wrapper.classList.remove('chat-input-wrapper--waiting');
        if (this.chatInput) {
            this.chatInput.readOnly = false;
            this.chatInput.setAttribute('placeholder', 'Send a message to Boudica...');
        }
        // Re-evaluate send button state based on current content
        this.handleInputChange();
    }

    /**
     * Start the gold race-line animation around the prompt input box.
     * Called when the prompt is dispatched to the server.
     */
    startRaceLine() {
        const wrapper = this.chatInput && this.chatInput.closest('.chat-input-wrapper');
        if (!wrapper) return;
        const buildRaceSVG = () => {
            const old = wrapper.querySelector('.race-line-svg');
            if (old) old.remove();
            const w = wrapper.offsetWidth;
            const h = wrapper.offsetHeight;
            if (w <= 0 || h <= 0) return;
            const r = parseFloat(getComputedStyle(wrapper).borderRadius) || 12;
            const perim = Math.round(2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r);
            const tailLen = Math.round(perim * 0.18);
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.classList.add('race-line-svg');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            const rect = document.createElementNS(ns, 'rect');
            rect.setAttribute('x', '1');
            rect.setAttribute('y', '1');
            rect.setAttribute('width', w - 2);
            rect.setAttribute('height', h - 2);
            rect.setAttribute('rx', r);
            rect.setAttribute('ry', r);
            rect.setAttribute('fill', 'none');
            rect.setAttribute('stroke', '#FFD700');
            rect.setAttribute('stroke-width', '1.5');
            rect.setAttribute('stroke-linecap', 'round');
            rect.setAttribute('stroke-dasharray', `${tailLen} ${perim - tailLen}`);
            rect.setAttribute('stroke-dashoffset', '0');
            rect.setAttribute('filter', 'drop-shadow(0 0 2px #B8860B)');
            const anim = document.createElementNS(ns, 'animate');
            anim.setAttribute('attributeName', 'stroke-dashoffset');
            anim.setAttribute('from', '0');
            anim.setAttribute('to', String(-perim));
            anim.setAttribute('dur', '1.8s');
            anim.setAttribute('repeatCount', 'indefinite');
            rect.appendChild(anim);
            svg.appendChild(rect);
            wrapper.appendChild(svg);
        };
        buildRaceSVG();
        // Rebuild the SVG whenever the wrapper resizes (e.g. textarea grows)
        this._raceLineObserver = new ResizeObserver(() => buildRaceSVG());
        this._raceLineObserver.observe(wrapper);
    }

    /**
     * Stop the gold race-line animation. Called as soon as the first response
     * token arrives (i.e. the server has received the prompt).
     */
    stopRaceLine() {
        if (this._raceLineObserver) {
            this._raceLineObserver.disconnect();
            this._raceLineObserver = null;
        }
        const wrapper = this.chatInput && this.chatInput.closest('.chat-input-wrapper');
        if (wrapper) {
            const svg = wrapper.querySelector('.race-line-svg');
            if (svg) svg.remove();
        }
    }

    showWorkingIndicator() {
        // Find the last assistant message's loading indicator and activate it
        const assistantMessages = this.chatMessages.querySelectorAll('.message.assistant');
        if (assistantMessages.length > 0) {
            const lastMessage = assistantMessages[assistantMessages.length - 1];
            const loadingIndicator = lastMessage.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.classList.remove('complete');
            }
        }
    }

    /**
     * Hide working indicator - removes it completely
     */
    hideWorkingIndicator() {
        // Remove the loading indicator from the last assistant message
        const assistantMessages = this.chatMessages.querySelectorAll('.message.assistant');
        if (assistantMessages.length > 0) {
            const lastMessage = assistantMessages[assistantMessages.length - 1];
            const loadingIndicator = lastMessage.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        }
        // Ensure race line is stopped and input re-enabled
        this.stopRaceLine();
        this.unlockInput();
    }

    /**
     * Update assistant message (called on each streaming chunk and on completion)
     * @param {string} messageId
     * @param {string} content  - accumulated response text so far
     * @param {boolean} isDone  - true when the stream is finished
     */
    updateAssistantMessage(messageId, content, isDone = false, thinking = null) {
        if (!isDone) {
            // Throttle: store the latest content and schedule one DOM update per
            // animation frame.  If a frame is already scheduled for this message,
            // just update the pending content — the scheduled callback will pick
            // it up and we avoid thousands of marked.parse() calls per response.
            if (!this._streamPending) this._streamPending = new Map();
            const pending = this._streamPending.get(messageId);
            if (pending) {
                // A frame is already scheduled — just update the content.
                pending.content = content;
                return;
            }
            // Schedule the first frame for this message.
            const entry = { content };
            this._streamPending.set(messageId, entry);
            requestAnimationFrame(() => {
                const latest = this._streamPending.get(messageId);
                this._streamPending.delete(messageId);
                if (latest) {
                    this._applyAssistantMessageUpdate(messageId, latest.content, false);
                }
            });
            return;
        }

        // isDone — cancel any pending frame and render immediately with final content.
        if (this._streamPending) {
            this._streamPending.delete(messageId);
        }
        this._applyAssistantMessageUpdate(messageId, content, true, thinking);
    }

    /** Internal: actually update the DOM for an assistant message. */
    _applyAssistantMessageUpdate(messageId, content, isDone, thinking = null) {
        const messageEl = this.chatMessages.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            // Real answer content has started (or the response is done) —
            // any agentic progress narration is now stale.
            if (content && content.trim()) {
                this._clearAgenticStatus(messageEl);
            }
            // On completion, insert the thinking block (collapsed) before the
            // content div, instead of letting the reasoning that was visible
            // mid-stream just vanish when content gets replaced with the
            // server's final, already-stripped answer below.
            if (isDone && thinking && !messageEl.querySelector('.thinking-block')) {
                const contentDivForThinking = messageEl.querySelector('.message-content');
                const thinkingWrapper = document.createElement('div');
                thinkingWrapper.innerHTML = this._renderThinkingHtml(thinking);
                if (contentDivForThinking) {
                    messageEl.insertBefore(thinkingWrapper.firstElementChild, contentDivForThinking);
                }
            }
            const contentDiv = messageEl.querySelector('.message-content');
            const formattedData = this.formatMessageContent(content);
            if (formattedData.type === 'html') {
                // Show a compact card in the chat bubble
                contentDiv.innerHTML = `
                    <div class="html-preview-card">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--primary-color)">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                        <div class="html-preview-card-text">
                            <span class="html-preview-card-title">HTML Response</span>
                            <span class="html-preview-card-desc">${isDone ? 'Rendered in the preview panel →' : 'Streaming… preview updating live →'}</span>
                        </div>
                    </div>
                `;

                // While streaming, show placeholder; on completion render the real HTML.
                let htmlForPreview;
                if (isDone) {
                    htmlForPreview = this._cleanupHtmlClosingTags(content);
                    this.openHtmlPreview(htmlForPreview, false);  // render final document
                } else {
                    htmlForPreview = this._ensureHtmlClosingTags(content);
                    this.openHtmlPreview(htmlForPreview, true);   // show/maintain placeholder
                }

                if (isDone) {
                    this._injectHtmlButtonIntoUserMessage(htmlForPreview, messageEl);
                }
            } else {
                contentDiv.innerHTML = formattedData.html;
            }
            contentDiv.setAttribute('data-content-type', formattedData.type);
            // Only store raw content on the final update to avoid accumulating a
            // growing string in the DOM on every token.
            if (isDone) {
                contentDiv.setAttribute('data-raw-content', content);
            }
            contentDiv.setAttribute('data-view-mode', 'formatted');
        }
    }

    /**
     * Convert any Markdown syntax found inside an HTML document to
     * equivalent inline-styled HTML elements.  Only text outside of
     * HTML tags is processed; content inside <style>, <script>, <pre>,
     * <code>, and <textarea> elements is left untouched.
     */
    _stripMarkdownFromHtml(html) {
        if (!html) return html;

        // --- Pass 1: convert fenced code blocks (``` ... ```) at the
        //     full-text level since they can span across tag boundaries.
        let result = html.replace(/```\w*\n?([\s\S]*?)```/g, (_m, code) => {
            const escaped = code
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            return '<div style="font-family:monospace;background:#f5f5f5;padding:8px 12px;' +
                   'border-radius:4px;white-space:pre;overflow-x:auto;margin:8px 0">' +
                   escaped + '</div>';
        });

        // --- Pass 2: split into HTML tags vs text segments.
        //     Only transform text segments, and skip those inside
        //     preformatted / special elements.
        const parts = result.split(/(<[^>]*>)/);
        let insidePreformatted = 0;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            // Track HTML tags
            if (part.startsWith('<')) {
                const tagMatch = part.match(/^<(\/?)(\w+)/);
                if (tagMatch) {
                    const tagName = tagMatch[2].toLowerCase();
                    if (['style', 'script', 'pre', 'code', 'textarea'].includes(tagName)) {
                        insidePreformatted += tagMatch[1] === '/' ? -1 : 1;
                    }
                }
                continue;
            }

            // Skip text inside preformatted elements
            if (insidePreformatted > 0) continue;

            let t = parts[i];

            // Inline code
            t = t.replace(/`([^`]+)`/g,
                '<span style="font-family:monospace;background:#f5f5f5;padding:2px 4px;border-radius:3px;font-size:0.9em">$1</span>');

            // Headings (#### before ### before ## before #)
            t = t.replace(/^#{4,6}\s+(.+)$/gm,
                '<div style="font-weight:bold;margin:1em 0">$1</div>');
            t = t.replace(/^###\s+(.+)$/gm,
                '<div style="font-size:1.17em;font-weight:bold;margin:1em 0">$1</div>');
            t = t.replace(/^##\s+(.+)$/gm,
                '<div style="font-size:1.5em;font-weight:bold;margin:0.83em 0">$1</div>');
            t = t.replace(/^#\s+(.+)$/gm,
                '<div style="font-size:2em;font-weight:bold;margin:0.67em 0">$1</div>');

            // Bold (**text** or __text__) — process before italic
            t = t.replace(/\*\*(.+?)\*\*/g,
                '<span style="font-weight:bold">$1</span>');
            t = t.replace(/__(.+?)__/g,
                '<span style="font-weight:bold">$1</span>');

            // Italic (*text* or _text_) — lookbehind/ahead to avoid
            // matching inside words or identifiers
            t = t.replace(/(?<!\w)\*(.+?)\*(?!\w)/g,
                '<span style="font-style:italic">$1</span>');
            t = t.replace(/(?<!\w)_(.+?)_(?!\w)/g,
                '<span style="font-style:italic">$1</span>');

            // Strikethrough
            t = t.replace(/~~(.+?)~~/g,
                '<span style="text-decoration:line-through">$1</span>');

            // Blockquotes
            t = t.replace(/^>\s+(.+)$/gm,
                '<div style="border-left:3px solid #ccc;padding-left:1em;margin:8px 0;color:#555">$1</div>');

            // Unordered list items (- or *)
            t = t.replace(/^[-*]\s+(.+)$/gm,
                '<div style="margin-left:1.5em">\u2022 $1</div>');

            // Ordered list items
            t = t.replace(/^(\d+)\.\s+(.+)$/gm,
                '<div style="margin-left:1.5em">$1. $2</div>');

            // Horizontal rules
            t = t.replace(/^(?:---|\*\*\*|___)\s*$/gm,
                '<hr style="margin:16px 0;border:none;border-top:1px solid #ccc">');

            // Images (before links to avoid conflict)
            t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
                '<img alt="$1" src="$2" style="max-width:100%">');

            // Links
            t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
                '<a href="$2">$1</a>');

            parts[i] = t;
        }

        return parts.join('');
    }

    /**
     * Ensure HTML content has closing </body> and </html> tags.
     * Used during streaming so the iframe always has a valid document.
     */
    _ensureHtmlClosingTags(html) {
        const extracted = this._extractPrimaryHtmlDocument(html);

        // Strip malformed DOCTYPE/html fragments not preceded by '<'
        // e.g. the model emitting "DOCTYPE html>" instead of "<!DOCTYPE html>"
        let result = extracted.replace(/(?<!<)!?DOCTYPE\s+html>/gi, '');

        // If the content already ends with both closing tags, return as-is
        if (/<\/body>\s*<\/html>\s*$/i.test(result)) {
            return result;
        }
        // Strip any trailing partial closing tags before appending fresh ones
        result = result.replace(/<\/body>\s*$/i, '').replace(/<\/html>\s*$/i, '');
        return result + '\n</body>\n</html>';
    }

    /**
     * Clean up HTML so exactly one </body></html> pair exists at the end.
     * Also strips malformed tags at the head or tail that are missing their
     * opening '<', e.g. "DOCTYPE html>" or "html>" that the model occasionally
     * emits as the very first characters of a response.
     * Called when the stream is complete.
     */
    _cleanupHtmlClosingTags(html) {
        const extracted = this._extractPrimaryHtmlDocument(html);

        // Strip malformed DOCTYPE/html fragments not preceded by '<'
        // e.g. the model emitting "DOCTYPE html>" instead of "<!DOCTYPE html>"
        let result = extracted.replace(/(?<!<)!?DOCTYPE\s+html>/gi, '');

        // Remove every occurrence of the closing tags so we can add exactly one pair.
        result = result.replace(/<\/body>/gi, '').replace(/<\/html>/gi, '');

        return result.trimEnd() + '\n</body>\n</html>';
    }

    /**
     * Inject a "View HTML" button
     */
    _injectHtmlButtonIntoUserMessage(html, assistantMessageEl) {
        // Walk backwards through siblings to find the directly preceding user message
        let userMessageEl = null;
        let sibling = assistantMessageEl ? assistantMessageEl.previousElementSibling : null;
        while (sibling) {
            if (sibling.classList.contains('message') && sibling.classList.contains('user')) {
                userMessageEl = sibling;
                break;
            }
            sibling = sibling.previousElementSibling;
        }
        if (!userMessageEl) return;

        // Remove any pre-existing button on this message (avoid duplicates on re-render)
        const existing = userMessageEl.querySelector('.btn-view-html-prompt');
        if (existing) existing.remove();

        const btn = document.createElement('button');
        btn.className = 'btn btn-view-html-prompt';
        btn.title = 'View HTML response in preview panel';
        btn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            View HTML`;
        btn.addEventListener('click', () => this.openHtmlPreview(html));
        userMessageEl.appendChild(btn);
    }

    /**
     * Open the HTML preview flyout panel with the given HTML content
     */
    openHtmlPreview(html, streaming = false) {
        if (!this.htmlPreviewPanel || !this.htmlPreviewFrame) return;

        // Open the panel immediately
        this.htmlPreviewPanel.classList.add('open');

        if (streaming) {
            // During streaming: show the placeholder once; do NOT update srcdoc
            // on every chunk (that causes the flickering).
            if (!this._htmlStreamingPlaceholderActive) {
                this._htmlStreamingPlaceholderActive = true;
                this.htmlPreviewFrame.srcdoc = this._buildHtmlStreamingPlaceholder();
            }
            // Buffer the latest content for when streaming finishes
            this._htmlStreamingBuffer = html;
            return;
        }

        // Streaming done (or direct open): clear placeholder state and render
        this._htmlStreamingPlaceholderActive = false;
        this._htmlStreamingBuffer = null;

        const extracted = this._extractPrimaryHtmlDocument(html);
        const processed = /<html[\s>]/i.test(extracted)
            ? extracted
            : this._stripMarkdownFromHtml(extracted);
        this._lastHtmlContent = processed;
        localStorage.setItem('boudica_last_html', processed);
        this.htmlPreviewFrame.srcdoc = processed;
    }

    /**
     * Build the pulsating placeholder shown inside the iframe while HTML streams in.
     */
    _buildHtmlStreamingPlaceholder() {
        const phrases = [
            'Thinking about your request',
            'Getting all of the required information together',
            'Creating your document'
        ];
        // Build JS array literal
        const phrasesJs = JSON.stringify(phrases);

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: #f8f8f8;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
  }
  .box {
    width: 66%;
    aspect-ratio: 1 / 1;
    border-radius: 18px;
    /* radial gradient: light silver edge → dark charcoal centre */
    background: radial-gradient(circle at center, #3a3a3a 0%, #6e6e6e 45%, #c8c8c8 75%, #e8e8e8 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 32px;
    animation: pulse 2.4s ease-in-out infinite;
    box-shadow: 0 8px 40px rgba(0,0,0,0.18);
  }
  @keyframes pulse {
    0%   { transform: scale(1);    opacity: 1; }
    50%  { transform: scale(1.03); opacity: 0.85; }
    100% { transform: scale(1);    opacity: 1; }
  }
  .phrase {
    color: #f0f0f0;
    font-size: clamp(13px, 2.2vw, 18px);
    font-weight: 500;
    letter-spacing: 0.01em;
    text-align: center;
    line-height: 1.5;
    min-height: 1.5em;
    opacity: 0;
    transition: opacity 0.8s ease;
  }
  .phrase.visible { opacity: 1; }
  .dots {
    display: flex; gap: 8px;
  }
  .dot {
    width: 9px; height: 9px;
    border-radius: 50%;
    background: #d0d0d0;
    animation: bounce 1.4s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%, 80%, 100% { transform: translateY(0); }
    40%           { transform: translateY(-8px); }
  }
</style>
</head>
<body>
<div class="box">
  <div class="phrase" id="ph"></div>
  <div class="dots">
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  </div>
</div>
<script>
  const phrases = ${phrasesJs};
  const el = document.getElementById('ph');
  let idx = 0;
  function show() {
    if (idx >= phrases.length) return; // show each phrase once only
    el.classList.remove('visible');
    setTimeout(() => {
      el.textContent = phrases[idx];
      el.classList.add('visible');
      idx++;
      if (idx < phrases.length) setTimeout(show, 7000);
    }, 600);
  }
  show();
<\/script>
</body>
</html>`;
    }

    /**
     * Extract the primary HTML document from mixed response output.
     * Keeps only content from the first <html...> through the last </html>.
     */
    _extractPrimaryHtmlDocument(content) {
        const text = content || '';
        const start = text.search(/<html[\s>]/i);
        if (start < 0) {
            return text;
        }

        const fromHtml = text.slice(start);
        // Use indexOf (first occurrence) so we stop at the end of the FIRST
        // complete HTML document and discard any repeated responses after it.
        const end = fromHtml.toLowerCase().indexOf('</html>');
        if (end >= 0) {
            return fromHtml.slice(0, end + 7);
        }

        return fromHtml;
    }

    /**
     * Close the HTML preview flyout panel
     */
    closeHtmlPreview() {
        if (!this.htmlPreviewPanel) return;
        this.htmlPreviewPanel.classList.remove('open');
        this._htmlStreamingPlaceholderActive = false;
        this._htmlStreamingBuffer = null;
    }

    /**
     * Print the current HTML preview content
     */
    printHtmlPreview() {
        const currentHtml = this._lastHtmlContent || (this.htmlPreviewFrame && this.htmlPreviewFrame.srcdoc) || '';
        if (!currentHtml) return;

        // Open a new window and print from there — calling contentWindow.print()
        // on a sandboxed iframe is blocked in most browsers regardless of allow-modals.
        const printableHtml = this._normalizePrintableHtml(currentHtml);
        const win = window.open('', '_blank');
        if (!win) {
            alert('Pop-up blocked. Please allow pop-ups for this site to use Print.');
            return;
        }

        win.document.open();
        win.document.write(printableHtml);
        win.document.close();

        const triggerPrint = () => { win.focus(); win.print(); };
        if (win.document.readyState === 'complete') {
            triggerPrint();
        } else {
            win.addEventListener('load', triggerPrint, { once: true });
        }
    }

    /**
     * Ensure printable HTML is treated as a rendered document, not text.
     */
    _normalizePrintableHtml(html) {
        let normalized = html || '';

        // If the whole document is entity-escaped (e.g. &lt;html&gt;), decode it.
        if (!/<html[\s>]/i.test(normalized) && /&lt;(?:!DOCTYPE|html|head|body)/i.test(normalized)) {
            const decoder = document.createElement('textarea');
            decoder.innerHTML = normalized;
            normalized = decoder.value;
        }

        // Ensure a full document envelope for consistent browser print behavior.
        if (!/<html[\s>]/i.test(normalized)) {
            normalized = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${normalized}</body></html>`;
        }

        return normalized;
    }

    /**
     * Save the current HTML preview content as a .html file
     */
    saveHtmlPreview() {
        const html = this._lastHtmlContent;
        if (!html) return;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `boudica-response-${Date.now()}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Initialise the left-edge drag-to-resize handle for the flyout panel
     */
    _initResizeHandle() {
        const handle = this.htmlPreviewResizeHandle;
        const panel = this.htmlPreviewPanel;
        const MIN_WIDTH = 280;
        const MAX_WIDTH = window.innerWidth * 0.8;

        let startX = 0;
        let startWidth = 0;

        const onMouseMove = (e) => {
            const dx = startX - e.clientX; // dragging left expands, right shrinks
            const newWidth = Math.min(Math.max(startWidth + dx, MIN_WIDTH), MAX_WIDTH);
            panel.style.width = newWidth + 'px';
            panel.style.minWidth = newWidth + 'px';
            // Disable CSS transition while dragging for instant feedback
            panel.style.transition = 'none';
        };

        const onMouseUp = () => {
            handle.classList.remove('dragging');
            panel.style.transition = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (this.htmlPreviewFrame) this.htmlPreviewFrame.style.pointerEvents = '';
        };

        handle.addEventListener('mousedown', (e) => {
            if (!panel.classList.contains('open')) return;
            e.preventDefault();
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            handle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            // Disable pointer events on the iframe during drag so that if the
            // mouse enters the iframe, mouseup still fires in the parent document
            // (otherwise the drag listeners leak and the panel never stops resizing).
            if (this.htmlPreviewFrame) this.htmlPreviewFrame.style.pointerEvents = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }
}

// Export for use in other modules
window.ChatUI = ChatUI;
