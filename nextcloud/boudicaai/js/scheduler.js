/**
 * Boudica Scheduler
 * Handles scheduled/automated prompt execution
 */

class Scheduler {
    constructor(storage, api) {
        this.storage = storage;
        this.api = api;
        this.timers = new Map();
        this.actionsList = document.getElementById('actionsList');
        
        // Scheduling patterns to detect
        this.schedulePatterns = [
            /run\s+(at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
            /run\s+(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)-?(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
            /run\s+(daily|every\s+day|each\s+day)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
            /run\s+(every|each)\s+(\d+)\s+(hour|hours|minute|minutes)/i
        ];
        
        this.initializeActions();
        this.setupActionOverlay();
    }
    
    /**
     * Check if a prompt contains scheduling instructions
     */
    detectSchedule(prompt) {
        for (const pattern of this.schedulePatterns) {
            const match = prompt.match(pattern);
            if (match) {
                return {
                    hasSchedule: true,
                    matchText: match[0],
                    fullMatch: match
                };
            }
        }
        return { hasSchedule: false };
    }
    
    /**
     * Parse schedule from prompt and extract clean prompt
     */
    parseScheduledPrompt(prompt) {
        const detection = this.detectSchedule(prompt);
        if (!detection.hasSchedule) {
            return null;
        }
        
        // Remove the scheduling part from the prompt
        const cleanPrompt = prompt.replace(detection.matchText, '').trim();
        
        return {
            prompt: cleanPrompt,
            scheduleText: detection.matchText,
            originalPrompt: prompt
        };
    }
    
    /**
     * Add a new scheduled action
     */
    addAction(prompt, scheduleText, title) {
        const action = {
            id: Date.now().toString(),
            title: title || '',
            prompt: prompt,
            scheduleText: scheduleText,
            createdAt: new Date().toISOString(),
            responses: []
        };
        
        this.storage.saveScheduledAction(action);
        this.renderActions();
        this.startActionTimer(action.id, false); // Don't execute immediately when first created
        
        return action;
    }
    
    /**
     * Remove a scheduled action
     */
    deleteAction(actionId) {
        this.stopActionTimer(actionId);
        this.storage.deleteScheduledAction(actionId);
        this.renderActions();
    }
    
    /**
     * Delete a specific response from an action
     */
    deleteResponse(actionId, responseIndex) {
        const action = this.storage.getScheduledAction(actionId);
        if (action && action.responses) {
            action.responses.splice(responseIndex, 1);
            this.storage.updateScheduledAction(action);
            this.renderActions();
        }
    }
    
    /**
     * Execute a scheduled action
     */
    async executeAction(actionId) {
        const action = this.storage.getScheduledAction(actionId);
        if (!action) return;
        
        console.log(`Executing scheduled action: ${action.prompt}`);
        
        try {
            // Execute the prompt through the API (using a special chat ID that won't be saved)
            let fullResponse = '';
            await this.api.sendMessage(
                'scheduled-action-' + actionId, // Use unique chat ID for each scheduled action
                action.prompt,
                (content, isDone) => {
                    fullResponse = content;
                    if (isDone) {
                        // Save the FULL response (not truncated)
                        action.responses.unshift({
                            content: fullResponse,
                            fullContent: fullResponse,
                            timestamp: new Date().toISOString()
                        });
                        
                        // Keep only last 10 responses
                        if (action.responses.length > 10) {
                            action.responses = action.responses.slice(0, 10);
                        }
                        
                        this.storage.updateScheduledAction(action);
                        this.renderActions();
                    }
                },
                null // No files
            );
        } catch (error) {
            console.error('Error executing scheduled action:', error);
            action.responses.unshift({
                content: `Error: ${error.message}`,
                fullContent: `Error: ${error.message}`,
                timestamp: new Date().toISOString(),
                isError: true
            });
            this.storage.updateScheduledAction(action);
            this.renderActions();
        }
    }
    
    /**
     * Truncate response to first 100 characters for display
     */
    truncateResponse(text) {
        const maxLength = 100;
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    /**
     * Start timer for an action based on its schedule
     */
    startActionTimer(actionId, executeImmediately = true) {
        const action = this.storage.getScheduledAction(actionId);
        if (!action) return;
        
        // Execute immediately when page loads (for existing actions only)
        if (executeImmediately) {
            setTimeout(() => {
                this.executeAction(actionId);
            }, 2000); // Execute 2 seconds after page load
        }
        
        // Set up recurring timer - check every minute if action should run
        const timerId = setInterval(() => {
            this.checkAndExecuteAction(actionId);
        }, 60000); // Check every minute
        
        this.timers.set(actionId, timerId);
    }
    
    /**
     * Check if action should execute based on current time and schedule
     */
    checkAndExecuteAction(actionId) {
        const action = this.storage.getScheduledAction(actionId);
        if (!action) return;
        
        const now = new Date();
        const scheduleText = action.scheduleText.toLowerCase();
        
        // Parse time from schedule
        const timeMatch = scheduleText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (!timeMatch) return;
        
        let targetHour = parseInt(timeMatch[1]);
        const targetMinute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const meridiem = timeMatch[3] ? timeMatch[3].toLowerCase() : null;
        
        // Convert to 24-hour format
        if (meridiem === 'pm' && targetHour !== 12) {
            targetHour += 12;
        } else if (meridiem === 'am' && targetHour === 12) {
            targetHour = 0;
        }
        
        // Check if current time matches
        if (now.getHours() === targetHour && now.getMinutes() === targetMinute) {
            // Check day restrictions
            const dayMatch = scheduleText.match(/\b(mon|tue|wed|thu|fri|sat|sun)/i);
            if (dayMatch) {
                const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                const currentDay = days[now.getDay()];
                if (!scheduleText.includes(currentDay)) {
                    return; // Not the right day
                }
            }
            
            // Check if we already executed this minute
            const lastResponse = action.responses[0];
            if (lastResponse) {
                const lastTime = new Date(lastResponse.timestamp);
                if (lastTime.getHours() === now.getHours() && 
                    lastTime.getMinutes() === now.getMinutes()) {
                    return; // Already executed this minute
                }
            }
            
            this.executeAction(actionId);
        }
    }
    
    /**
     * Stop timer for an action
     */
    stopActionTimer(actionId) {
        const timerId = this.timers.get(actionId);
        if (timerId) {
            clearInterval(timerId);
            this.timers.delete(actionId);
        }
    }
    
    /**
     * Initialize all saved actions and start their timers
     */
    initializeActions() {
        const actions = this.storage.getScheduledActions();
        actions.forEach(action => {
            this.startActionTimer(action.id, false);
        });
        this.renderActions();
    }
    
    /**
     * Render the actions list in the sidebar
     */
    renderActions() {
        const actions = this.storage.getScheduledActions();
        
        if (!this.actionsList) return;

        // Always render the New Action button at the top
        const newBtnHtml = `
            <button class="btn btn-new-rule" id="newActionBtn">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="margin-right:6px">
                    <path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>New Action
            </button>`;

        if (actions.length === 0) {
            this.actionsList.innerHTML = newBtnHtml + `
                <div class="empty-actions">
                    <p>No scheduled actions yet.</p>
                    <p style="font-size: 11px; margin-top: 8px;">Click "New Action" or include "run daily at [time]" in your prompt.</p>
                </div>
            `;
        } else {
            this.actionsList.innerHTML = newBtnHtml +
                actions.map(action => this.renderActionItem(action)).join('');
        }

        // Wire up New Action button
        const newBtn = document.getElementById('newActionBtn');
        if (newBtn) newBtn.addEventListener('click', () => this.openActionOverlay());

        // Attach event listeners to action items
        actions.forEach(action => {
            const editBtn = document.querySelector(`[data-action-edit="${action.id}"]`);
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openActionOverlay(action.id);
                });
            }

            const deleteBtn = document.querySelector(`[data-action-delete="${action.id}"]`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteAction(action.id);
                });
            }
            
            // Add listeners for response delete buttons and click to view
            action.responses.forEach((response, index) => {
                const responseDeleteBtn = document.querySelector(`[data-response-delete="${action.id}-${index}"]`);
                if (responseDeleteBtn) {
                    responseDeleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteResponse(action.id, index);
                    });
                }
                
                // Add click listener to view full response
                const responseContent = document.querySelector(`[data-response-clickable="${action.id}-${index}"]`);
                if (responseContent) {
                    responseContent.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.showFullResponse(response);
                    });
                }
            });
        });
    }
    
    /**
     * Detect whether a string contains HTML markup
     */
    _isHtml(text) {
        return /<(?:p|div|ul|ol|li|h[1-6]|table|tr|td|th|br|hr|strong|em|a|pre|code|blockquote|span)[\s>]/i.test(text);
    }

    /**
     * Show full response in a modal
     */
    showFullResponse(response) {
        const content = response.fullContent || response.content;
        const isHtml = this._isHtml(content);

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'response-modal';
        modal.innerHTML = `
            <div class="response-modal-overlay"></div>
            <div class="response-modal-content">
                <div class="response-modal-header">
                    <h3>Full Response</h3>
                    <button class="response-modal-close">×</button>
                </div>
                <div class="response-modal-body">
                    <div class="response-modal-time">${this.formatTime(response.timestamp)}</div>
                    <div class="response-modal-text${isHtml ? ' response-modal-html' : ''}"></div>
                </div>
            </div>
        `;

        // Set content safely:
        // HTML responses go into a sandboxed iframe so the response's own CSS/JS
        // cannot affect the parent document (e.g. position:fixed overlays blocking
        // the close button). Plain text uses textContent as before.
        const textEl = modal.querySelector('.response-modal-text');
        if (isHtml) {
            const iframe = document.createElement('iframe');
            // allow-same-origin: lets linked stylesheets/images load
            // allow-popups: lets <a target="_blank"> work
            // No allow-scripts: block JS execution inside the response
            iframe.setAttribute('sandbox', 'allow-same-origin allow-popups');
            iframe.className = 'response-modal-iframe';
            iframe.srcdoc = content;
            // Auto-resize to content height once loaded
            iframe.addEventListener('load', () => {
                try {
                    const h = iframe.contentDocument.documentElement.scrollHeight;
                    if (h > 0) iframe.style.height = h + 'px';
                } catch (_) { /* cross-origin sandbox may block — fixed height is fine */ }
            });
            textEl.appendChild(iframe);
        } else {
            textEl.textContent = content;
        }
        
        document.body.appendChild(modal);
        
        // Add close handlers
        const closeBtn = modal.querySelector('.response-modal-close');
        const overlay = modal.querySelector('.response-modal-overlay');
        
        const closeModal = () => {
            modal.remove();
        };
        
        closeBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);
        
        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }
    
    /**
     * Render a single action item
     */
    renderActionItem(action) {
        const responsesHtml = action.responses.length > 0 ? `
            <div class="action-item-responses">
                ${action.responses.map((response, index) => `
                    <div class="action-response ${response.isError ? 'error' : ''}" data-response-id="${action.id}-${index}">
                        <button class="action-response-timestamp" data-response-clickable="${action.id}-${index}" title="Click to view response">
                            ${this.formatTime(response.timestamp)}
                        </button>
                        <button class="action-response-delete" data-response-delete="${action.id}-${index}" title="Delete response">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                `).join('')}
            </div>
        ` : '';
        
        return `
            <div class="action-item">
                <div class="action-item-header">
                    <div class="action-item-prompt">${this.escapeHtml(action.title || action.prompt)}</div>
                    <button class="action-item-edit" data-action-edit="${action.id}" title="Edit action">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L4.667 14H2v-2.667L11.333 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="action-item-delete" data-action-delete="${action.id}" title="Delete action">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
                <div class="action-item-schedule">${this.escapeHtml(action.scheduleText)}</div>
                ${responsesHtml}
            </div>
        `;
    }

    // ========== ACTION OVERLAY ==========

    /**
     * Convert 24h "HH:MM" to "h:MMam/pm" for scheduleText
     */
    _to12h(timeValue) {
        const [hStr, mStr] = timeValue.split(':');
        let h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        const meridiem = h >= 12 ? 'pm' : 'am';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        return m === 0 ? `${h}${meridiem}` : `${h}:${mStr}${meridiem}`;
    }

    /**
     * Convert "h:MMam/pm" back to "HH:MM" for the time input
     */
    _to24h(scheduleTime) {
        const m = scheduleTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
        if (!m) return '09:00';
        let h = parseInt(m[1], 10);
        const min = m[2] ? m[2] : '00';
        const mer = m[3].toLowerCase();
        if (mer === 'pm' && h !== 12) h += 12;
        else if (mer === 'am' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${min}`;
    }

    /**
     * Open the New/Edit Action overlay.
     * Pass an actionId to pre-fill for editing, or omit for a new action.
     */
    openActionOverlay(actionId) {
        const overlay = document.getElementById('newActionOverlay');
        if (!overlay) return;

        const titleEl     = document.getElementById('actionOverlayTitle');
        const editIdInput = document.getElementById('actionEditId');
        const promptInput = document.getElementById('actionPromptInput');
        const timeInput   = document.getElementById('actionTimeInput');
        const dayBoxes    = overlay.querySelectorAll('input[name="actionDay"]');

        const titleInput  = document.getElementById('actionTitleInput');

        // Reset form
        dayBoxes.forEach(cb => cb.checked = false);
        if (titleInput) titleInput.value = '';
        promptInput.value = '';
        timeInput.value   = '09:00';
        editIdInput.value = '';
        titleEl.textContent = 'New Action';

        if (actionId) {
            const action = this.storage.getScheduledAction(actionId);
            if (action) {
                titleEl.textContent  = 'Edit Action';
                editIdInput.value    = actionId;
                if (titleInput) titleInput.value = action.title || '';
                promptInput.value    = action.prompt;

                const st = action.scheduleText.toLowerCase();
                // Restore time
                const tMatch = st.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
                if (tMatch) timeInput.value = this._to24h(tMatch[1]);

                // Restore days
                if (st.includes('daily') || st.includes('every day') || st.includes('each day')) {
                    dayBoxes.forEach(cb => cb.checked = true);
                } else {
                    dayBoxes.forEach(cb => {
                        cb.checked = st.includes(cb.value);
                    });
                }
            }
        }

        overlay.classList.remove('hidden');
        const ti = document.getElementById('actionTitleInput');
        if (ti) ti.focus(); else promptInput.focus();
    }

    /**
     * Close the Action overlay
     */
    closeActionOverlay() {
        const overlay = document.getElementById('newActionOverlay');
        if (overlay) overlay.classList.add('hidden');
    }

    /**
     * Save action from the overlay form
     */
    saveActionFromOverlay() {
        const overlay   = document.getElementById('newActionOverlay');
        const editId    = (document.getElementById('actionEditId').value || '').trim();
        const title     = (document.getElementById('actionTitleInput')?.value || '').trim();
        const prompt    = (document.getElementById('actionPromptInput').value || '').trim();
        const timeValue = document.getElementById('actionTimeInput').value;
        const dayBoxes  = overlay.querySelectorAll('input[name="actionDay"]:checked');

        if (!prompt) {
            document.getElementById('actionPromptInput').focus();
            return;
        }
        if (!timeValue) {
            document.getElementById('actionTimeInput').focus();
            return;
        }
        if (dayBoxes.length === 0) {
            // Highlight day picker area
            overlay.querySelector('.action-day-picker').style.outline = '1px solid var(--error-color, red)';
            setTimeout(() => { overlay.querySelector('.action-day-picker').style.outline = ''; }, 1500);
            return;
        }

        const timeStr    = this._to12h(timeValue);
        const selectedDays = Array.from(dayBoxes).map(cb => cb.value);
        const allDays    = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const isDaily    = selectedDays.length === 7 && allDays.every(d => selectedDays.includes(d));
        const scheduleText = isDaily
            ? `run daily at ${timeStr}`
            : `run ${selectedDays.join(' ')} at ${timeStr}`;

        if (editId) {
            // Update existing action
            const action = this.storage.getScheduledAction(editId);
            if (action) {
                this.stopActionTimer(editId);
                action.title        = title;
                action.prompt       = prompt;
                action.scheduleText = scheduleText;
                this.storage.updateScheduledAction(action);
                this.startActionTimer(editId, false);
            }
        } else {
            // Create new action
            this.addAction(prompt, scheduleText, title);
        }

        this.renderActions();
        this.closeActionOverlay();
    }

    /**
     * Wire up the Action overlay buttons and keyboard shortcuts
     */
    setupActionOverlay() {
        const overlay    = document.getElementById('newActionOverlay');
        const saveBtn    = document.getElementById('saveActionBtn');
        const cancelBtn  = document.getElementById('cancelActionBtn');
        const weekdaysBtn = document.getElementById('actionDayWeekdays');
        const weekendBtn  = document.getElementById('actionDayWeekend');
        const everyBtn    = document.getElementById('actionDayEvery');

        if (!overlay) return;

        if (saveBtn)   saveBtn.addEventListener('click',   () => this.saveActionFromOverlay());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeActionOverlay());

        // Shortcut buttons
        if (weekdaysBtn) weekdaysBtn.addEventListener('click', () => {
            overlay.querySelectorAll('input[name="actionDay"]').forEach(cb => {
                cb.checked = ['mon','tue','wed','thu','fri'].includes(cb.value);
            });
        });
        if (weekendBtn) weekendBtn.addEventListener('click', () => {
            overlay.querySelectorAll('input[name="actionDay"]').forEach(cb => {
                cb.checked = ['sat','sun'].includes(cb.value);
            });
        });
        if (everyBtn) everyBtn.addEventListener('click', () => {
            overlay.querySelectorAll('input[name="actionDay"]').forEach(cb => { cb.checked = true; });
        });

        // Close on backdrop click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeActionOverlay();
        });

        // Keyboard shortcuts
        const promptInput = document.getElementById('actionPromptInput');
        if (promptInput) {
            promptInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.closeActionOverlay();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
                this.closeActionOverlay();
            }
        });
    }

    /**
     * Format timestamp for display
     */
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        const timeStr = date.toLocaleTimeString('en-US', { 
            hour: 'numeric',
            minute: '2-digit',
            hour12: true 
        });
        
        if (messageDate.getTime() === today.getTime()) {
            return timeStr;
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + timeStr;
        }
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use in other modules
window.Scheduler = Scheduler;
