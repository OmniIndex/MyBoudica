/**
 * Chat API Module
 * Handles communication with Boudica Torc API
 */

class ChatAPI {
    constructor(auth) {
        this.auth = auth;
        
        // API Configuration: ALWAYS use direct CGI endpoint via Apache FastCGI
        // SAML authentication is handled separately by Flask on port 5000
        // All chat messages go directly to Apache CGI at /api/boudica
        const defaultConfig = {
            apiBase: 'https://boudi.ca/api/boudica',  // Apache  endpoint
            useCGI: true,              // Always use direct CGI
            mode: 'cgi'                // CGI mode (not SAML proxy)
        };
        
        // Allow override via localStorage (for testing/debugging only)
        this.apiBase = localStorage.getItem('boudica_api_url') || defaultConfig.apiBase;
        this.useCGI = localStorage.getItem('boudica_use_cgi') === 'true' || defaultConfig.useCGI;
        this.mode = localStorage.getItem('boudica_mode') || defaultConfig.mode;
        
        console.log(`Chat API initialized:`, {
            apiBase: this.apiBase,
            mode: this.mode,
            useCGI: this.useCGI
        });

        // Tracks the current isolated session ID per shared chat room.
        // Key: chatId, Value: { sessionId, active: bool }
        // When a user sends a "No Memory" message we reuse the same isolated
        // session for follow-up messages so Boudica retains context within the
        // current working session (e.g. iterative document editing).
        // A new isolated session is only started when the user was previously
        // in normal (non-isolated) mode — i.e. they explicitly want a clean slate.
        this._sharedIsolatedSessions = new Map();
    }

    shouldIsolateSession(messageText, useRagEnabled) {
        const lower = (messageText || '').toLowerCase();
        const hasNoMemory =
            lower.includes('no memory') ||
            lower.includes('disable memory') ||
            lower.includes('without memory') ||
            lower.includes("don't use memory") ||
            lower.includes('do not use memory') ||
            lower.includes('skip memory') ||
            lower.includes('ignore memory');

        const hasUseRagPhrase =
            lower.includes('use rag') ||
            lower.includes('with rag') ||
            lower.includes('enable rag') ||
            lower.includes('use retrieval');

        return hasNoMemory || (useRagEnabled && hasUseRagPhrase);
    }

    buildIsolatedSessionId(chatId) {
        return `${chatId}_isolated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    getCurrentUserId() {
        try {
            const sessionData = localStorage.getItem('boudica_session');
            if (!sessionData) {
                return 'anonymous';
            }

            const session = JSON.parse(sessionData);
            return session.user?.email || session.user?.username || session.user?.id || 'anonymous';
        } catch (error) {
            console.warn('Failed to resolve current user id:', error);
            return 'anonymous';
        }
    }
    
    /**
     * Strip <|channel>thought, <thought>…</thought>, and <channel|> markers from model output.
     */
    stripChannelThought(text) {
        // Format 1: XML-style paired tags  <thought>…</thought>  <thinking>…</thinking>
        // (case-insensitive, non-greedy, dotAll so newlines are matched)
        let result = text.replace(/<thought[\s>][\s\S]*?<\/thought>/gi, '');
        result = result.replace(/<thinking[\s>][\s\S]*?<\/thinking>/gi, '');

        // Format 2: orphaned open tag with no matching close tag — erase from tag to end
        result = result.replace(/<thought[\s>][\s\S]*/i, '');
        result = result.replace(/<thinking[\s>][\s\S]*/i, '');

        // Format 3: Gemma channel-style  <|channel>thought…<channel|>  or  <|channel>>thought…<channel|>
        result = result.replace(/<\|channel>>thought/g, '');
        result = result.replace(/<\|channel>thought/g, '');
        result = result.replace(/<\|channel>/g, '');
        result = result.replace(/<channel\|>/g, '');

        // Trim leading whitespace/newlines left over after tag removal
        result = result.replace(/^\s+/, '');
        return result;
    }

    /**
     * Set custom API endpoint and mode
     */
    setApiUrl(url, useCGI = false) {
        localStorage.setItem('boudica_api_url', url);
        localStorage.setItem('boudica_use_cgi', useCGI.toString());
        localStorage.setItem('boudica_mode', useCGI ? 'cgi' : 'saml');
        window.location.reload();
    }

    /**
     * Send a message and get response
     */
    async sendMessage(chatId, message, onStream = null, files = null, options = null) {
        try {
            const sessionToken = this.auth.getSessionToken();
            
            if (!sessionToken && !this.useCGI) {
                throw new Error('No valid session token');
            }

            // Start keepalive to prevent Keycloak session timeout during inference
            if (this.auth.startKeepalive) {
                this.auth.startKeepalive();
            }

            // Prepare request based on backend type
            if (this.useCGI) {
                return await this.sendMessageCGI(chatId, message, onStream, files, options);
            } else {
                return await this.sendMessageFlask(chatId, message, onStream, files);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        } finally {
            // Stop keepalive when request completes (success or failure)
            if (this.auth.stopKeepalive) {
                this.auth.stopKeepalive();
            }
        }
    }
    
    /**
     * Send message to CGI backend (Unix socket daemon) with optional file uploads
     */
    async sendMessageCGI(chatId, message, onStream = null, files = null, options = null) {
        // Get user session data for audit logging
        let userId = '';
        let userEmail = '';
        let apiKey = '';
        try {
            const sessionData = localStorage.getItem('boudica_session');
            if (sessionData) {
                const session = JSON.parse(sessionData);
                // Use email or username for audit logging, NOT UUID
                userId = session.user?.email || session.user?.username || session.user?.id || 'anonymous';
                userEmail = session.user?.email || '';
                apiKey = session.token || '';
            }
        } catch (e) {
            console.warn('Failed to get session data:', e);
        }
        
        // Handle both string messages and message objects
        const messageText = typeof message === 'string' ? message : (message.content || message);
        const useRagEnabled = (localStorage.getItem('boudica_use_rag') || 'true') === 'true';
        const effectiveSessionId = this.shouldIsolateSession(messageText, useRagEnabled)
            ? this.buildIsolatedSessionId(chatId)
            : chatId;
        
        // CGI expects POST to /chat endpoint
        const url = `${this.apiBase}/chat`;
        
        console.log(`Calling CGI endpoint: ${url}`);
        
        // Check if files are provided
        if (files && files.length > 0) {
            // All files (documents AND images) go via multipart.
            // The CGI handles the split: images are base64-encoded for the vision model;
            // documents are OCR'd into text context by TextExtractor.
            const formData = new FormData();
            formData.append('message', messageText);
            formData.append('session_id', effectiveSessionId);
            formData.append('user_id', userId);
            formData.append('user_email', userEmail);
            formData.append('stream', onStream ? 'true' : 'false');
            formData.append('api_key', apiKey);
            formData.append('temperature', localStorage.getItem('boudica_temperature') || '0.8');
            formData.append('max_tokens', localStorage.getItem('boudica_max_tokens') || '45000');
            formData.append('use_rag', localStorage.getItem('boudica_use_rag') || 'true');

            files.forEach((fileItem, index) => {
                formData.append(`document_${index}`, fileItem.file);
                formData.append(`filename_${index}`, fileItem.name);
            });
            formData.append('document_count', files.length.toString());

            console.log(`Sending ${files.length} file(s) with message`);

            if (onStream) {
                return await this.handleStreamingResponse(url, formData, onStream, true);
            }

            const response = await fetch(url, {
                method: 'POST',
                body: formData // browser sets Content-Type with boundary
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'API request failed' }));
                throw new Error(error.error || 'API request failed');
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // PDF document: trigger browser download
            if (data.pdf_base64) {
                this.triggerPdfDownload(data.pdf_base64, data.pdf_filename || 'document.pdf');
                return {
                    role: 'assistant',
                    content: '📄 PDF document generated and downloaded: **' + (data.pdf_filename || 'document.pdf') + '**',
                    metadata: {
                        tokens: data.tokens_generated || 0,
                        time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                        model: data.model || 'Boudica',
                        pdf: true
                    }
                };
            }

            // PPTX presentation: trigger browser download
            if (data.pptx_base64) {
                this.triggerPptxDownload(data.pptx_base64, data.pptx_filename || 'presentation.pptx');
                return {
                    role: 'assistant',
                    content: '📊 Presentation generated and downloaded: **' + (data.pptx_filename || 'presentation.pptx') + '**',
                    metadata: {
                        tokens: data.tokens_generated || 0,
                        time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                        model: data.model || 'Boudica',
                        pptx: true
                    }
                };
            }

            // DOCX document: trigger browser download
            if (data.docx_base64) {
                this.triggerDocxDownload(data.docx_base64, data.docx_filename || 'document.docx');
                return {
                    role: 'assistant',
                    content: '📘 Word document generated and downloaded: **' + (data.docx_filename || 'document.docx') + '**',
                    metadata: {
                        tokens: data.tokens_generated || 0,
                        time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                        model: data.model || 'Boudica',
                        docx: true
                    }
                };
            }

            // XLSX spreadsheet: trigger browser download
            if (data.xlsx_base64) {
                this.triggerXlsxDownload(data.xlsx_base64, data.xlsx_filename || 'spreadsheet.xlsx');
                return {
                    role: 'assistant',
                    content: '📊 Spreadsheet generated and downloaded: **' + (data.xlsx_filename || 'spreadsheet.xlsx') + '**',
                    metadata: {
                        tokens: data.tokens_generated || 0,
                        time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                        model: data.model || 'Boudica',
                        xlsx: true
                    }
                };
            }

            // EPUB ebook: trigger browser download
            if (data.epub_base64) {
                this.triggerEpubDownload(data.epub_base64, data.epub_filename || 'ebook.epub');
                return {
                    role: 'assistant',
                    content: '📖 Ebook generated and downloaded: **' + (data.epub_filename || 'ebook.epub') + '**',
                    metadata: {
                        tokens: data.tokens_generated || 0,
                        time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                        model: data.model || 'Boudica',
                        epub: true
                    }
                };
            }

            // Dashboard: open interactive HTML in a new tab
            if (data.dashboard_base64) {
                this.triggerDashboardOpen(data.dashboard_base64, data.dashboard_filename || 'dashboard.html');
                return {
                    role: 'assistant',
                    content: '📈 Interactive dashboard generated and opened in a new tab: **' + (data.dashboard_filename || 'dashboard.html') + '**',
                    metadata: {
                        tokens: data.tokens_generated || 0,
                        time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                        model: data.model || 'Boudica',
                        dashboard: true
                    }
                };
            }

            return {
                role: 'assistant',
                content: this.stripChannelThought(data.response || data.text || ''),
                metadata: {
                    tokens: data.tokens_generated || 0,
                    time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                    model: data.model || 'Boudica'
                }
            };
        }

        // No files - send JSON as before
        const requestBody = {
            prompt: messageText,
            session_id: effectiveSessionId,
            user_id: userId,
            user_email: userEmail,
            stream: onStream ? true : false,
            api_key: apiKey || localStorage.getItem('boudica_api_key') || '',
            temperature: parseFloat(localStorage.getItem('boudica_temperature') || '0.8'),
            max_tokens: parseInt(localStorage.getItem('boudica_max_tokens') || '35000'),
            use_rag: useRagEnabled,
            verbatim_rag: options?.verbatim_rag || false
        };
        
        // Auto-set rag_source_type=system_log for log/syslog analysis queries
        const logQueryPattern = /\b(log|logs|syslog|system log|error log|access log|audit log|journal|journald)\b/i;
        if (requestBody.use_rag && logQueryPattern.test(messageText)) {
            requestBody.rag_source_type = 'system_log';
        }
        
        console.log('Request:', requestBody);
        
        // Enable streaming for responses
        if (onStream) {
            return await this.handleStreamingResponse(url, requestBody, onStream);
        }
        
        // Standard non-streaming request
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'API request failed' }));
            throw new Error(error.error || 'API request failed');
        }
        
        const data = await response.json();
        
        // Check for error in successful response
        if (data.error) {
            throw new Error(data.error);
        }
        
        // PDF document: trigger browser download
        if (data.pdf_base64) {
            this.triggerPdfDownload(data.pdf_base64, data.pdf_filename || 'document.pdf');
            return {
                role: 'assistant',
                content: '📄 PDF document generated and downloaded: **' + (data.pdf_filename || 'document.pdf') + '**',
                metadata: {
                    tokens: data.tokens_generated || 0,
                    time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                    model: data.model || 'Boudica',
                    pdf: true
                }
            };
        }

        // PPTX presentation: trigger browser download
        if (data.pptx_base64) {
            this.triggerPptxDownload(data.pptx_base64, data.pptx_filename || 'presentation.pptx');
            return {
                role: 'assistant',
                content: '📊 Presentation generated and downloaded: **' + (data.pptx_filename || 'presentation.pptx') + '**',
                metadata: {
                    tokens: data.tokens_generated || 0,
                    time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                    model: data.model || 'Boudica',
                    pptx: true
                }
            };
        }

        // DOCX document: trigger browser download
        if (data.docx_base64) {
            this.triggerDocxDownload(data.docx_base64, data.docx_filename || 'document.docx');
            return {
                role: 'assistant',
                content: '📘 Word document generated and downloaded: **' + (data.docx_filename || 'document.docx') + '**',
                metadata: {
                    tokens: data.tokens_generated || 0,
                    time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                    model: data.model || 'Boudica',
                    docx: true
                }
            };
        }

        // XLSX spreadsheet: trigger browser download
        if (data.xlsx_base64) {
            this.triggerXlsxDownload(data.xlsx_base64, data.xlsx_filename || 'spreadsheet.xlsx');
            return {
                role: 'assistant',
                content: '📊 Spreadsheet generated and downloaded: **' + (data.xlsx_filename || 'spreadsheet.xlsx') + '**',
                metadata: {
                    tokens: data.tokens_generated || 0,
                    time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                    model: data.model || 'Boudica',
                    xlsx: true
                }
            };
        }

        // EPUB ebook: trigger browser download
        if (data.epub_base64) {
            this.triggerEpubDownload(data.epub_base64, data.epub_filename || 'ebook.epub');
            return {
                role: 'assistant',
                content: '📖 Ebook generated and downloaded: **' + (data.epub_filename || 'ebook.epub') + '**',
                metadata: {
                    tokens: data.tokens_generated || 0,
                    time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                    model: data.model || 'Boudica',
                    epub: true
                }
            };
        }

        // Dashboard: open interactive HTML in new tab
        if (data.dashboard_base64) {
            this.triggerDashboardOpen(data.dashboard_base64, data.dashboard_filename || 'dashboard.html');
            return {
                role: 'assistant',
                content: '📈 Interactive dashboard generated and opened in a new tab: **' + (data.dashboard_filename || 'dashboard.html') + '**',
                metadata: {
                    tokens: data.tokens_generated || 0,
                    time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                    model: data.model || 'Boudica',
                    dashboard: true
                }
            };
        }

        return {
            role: 'assistant',
            content: this.stripChannelThought(data.response || data.text || ''),
            metadata: {
                tokens: data.tokens_generated || 0,
                time: data.processing_time_ms ? data.processing_time_ms / 1000 : 0,
                model: data.model || 'Boudica'
            }
        };
    }

    /**
     * Trigger a browser download for a base64-encoded PDF.
     * @param {string} base64Data  - Raw base64 string (no data: URI prefix)
     * @param {string} filename    - Suggested filename for the download
     */
    triggerPdfDownload(base64Data, filename) {
        try {
            const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (err) {
            console.error('PDF download failed:', err);
        }
    }

    triggerPptxDownload(base64Data, filename) {
        try {
            const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (err) {
            console.error('PPTX download failed:', err);
        }
    }

    triggerDocxDownload(base64Data, filename) {
        try {
            const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (err) {
            console.error('DOCX download failed:', err);
        }
    }

    triggerXlsxDownload(base64Data, filename) {
        try {
            const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (err) {
            console.error('XLSX download failed:', err);
        }
    }

    triggerEpubDownload(base64Data, filename) {
        try {
            const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/epub+zip' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (err) {
            console.error('EPUB download failed:', err);
        }
    }

    triggerDashboardOpen(base64Data, filename) {
        try {
            const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const tab = window.open(url, '_blank');
            if (!tab) {
                // Popup blocked — fall back to download
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
            console.error('Dashboard open failed:', err);
        }
    }
    async handleStreamingResponse(url, requestBody, onStream, isMultipart = false) {
        const fetchOptions = {
            method: 'POST'
        };
        
        if (isMultipart) {
            // FormData - browser sets Content-Type with boundary
            fetchOptions.body = requestBody;
        } else {
            // JSON
            fetchOptions.headers = {
                'Content-Type': 'application/json'
            };
            fetchOptions.body = JSON.stringify(requestBody);
        }
        
        const response = await fetch(url, fetchOptions);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'API request failed' }));
            throw new Error(error.error || 'API request failed');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let tokensGenerated = 0;
        let lastChunk = null;  // Track last chunk for audit_id
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                // Keep last incomplete line in buffer
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    
                    try {
                        const chunk = JSON.parse(line);
                        lastChunk = chunk;  // Track for audit_id
                        
                        // Check for error in chunk
                        if (chunk.error) {
                            throw new Error(chunk.error);
                        }
                        
                        if (chunk.type === 'start') {
                            continue;
                        }
                        
                        if (chunk.type === 'token') {
                            const token = chunk.token;

                            // Tokens from the server already include proper spacing from the tokenizer
                            // (e.g. BPE tokens have leading spaces when appropriate)
                            fullContent += token;
                            tokensGenerated++;
                            // Call streaming callback with partial content
                            onStream(this.stripChannelThought(fullContent), false, null);
                        }
                        
                        // Final response (no type field)
                        if (chunk.response !== undefined) {
                            // PDF generation: trigger browser download instead of showing text
                            if (chunk.pdf_base64) {
                                this.triggerPdfDownload(chunk.pdf_base64, chunk.pdf_filename || 'document.pdf');
                                fullContent = '📄 PDF document generated and downloaded: **' + (chunk.pdf_filename || 'document.pdf') + '**';
                                onStream(fullContent, true, chunk.audit_id || null);
                                return { role: 'assistant', content: fullContent,
                                         metadata: { tokens: chunk.tokens_generated || 0, model: 'Boudica', pdf: true } };
                            }
                            // PPTX generation: trigger browser download
                            if (chunk.pptx_base64) {
                                this.triggerPptxDownload(chunk.pptx_base64, chunk.pptx_filename || 'presentation.pptx');
                                fullContent = '📊 Presentation generated and downloaded: **' + (chunk.pptx_filename || 'presentation.pptx') + '**';
                                onStream(fullContent, true, chunk.audit_id || null);
                                return { role: 'assistant', content: fullContent,
                                         metadata: { tokens: chunk.tokens_generated || 0, model: 'Boudica', pptx: true } };
                            }
                            // DOCX generation: trigger browser download
                            if (chunk.docx_base64) {
                                this.triggerDocxDownload(chunk.docx_base64, chunk.docx_filename || 'document.docx');
                                fullContent = '📘 Word document generated and downloaded: **' + (chunk.docx_filename || 'document.docx') + '**';
                                onStream(fullContent, true, chunk.audit_id || null);
                                return { role: 'assistant', content: fullContent,
                                         metadata: { tokens: chunk.tokens_generated || 0, model: 'Boudica', docx: true } };
                            }
                            // XLSX generation: trigger browser download
                            if (chunk.xlsx_base64) {
                                this.triggerXlsxDownload(chunk.xlsx_base64, chunk.xlsx_filename || 'spreadsheet.xlsx');
                                fullContent = '📊 Spreadsheet generated and downloaded: **' + (chunk.xlsx_filename || 'spreadsheet.xlsx') + '**';
                                onStream(fullContent, true, chunk.audit_id || null);
                                return { role: 'assistant', content: fullContent,
                                         metadata: { tokens: chunk.tokens_generated || 0, model: 'Boudica', xlsx: true } };
                            }
                            // EPUB ebook: trigger browser download
                            if (chunk.epub_base64) {
                                this.triggerEpubDownload(chunk.epub_base64, chunk.epub_filename || 'ebook.epub');
                                fullContent = '📖 Ebook generated and downloaded: **' + (chunk.epub_filename || 'ebook.epub') + '**';
                                onStream(fullContent, true, chunk.audit_id || null);
                                return { role: 'assistant', content: fullContent,
                                         metadata: { tokens: chunk.tokens_generated || 0, model: 'Boudica', epub: true } };
                            }
                            // Dashboard: open interactive HTML in new tab
                            if (chunk.dashboard_base64) {
                                this.triggerDashboardOpen(chunk.dashboard_base64, chunk.dashboard_filename || 'dashboard.html');
                                fullContent = '📈 Interactive dashboard generated and opened in a new tab: **' + (chunk.dashboard_filename || 'dashboard.html') + '**';
                                onStream(fullContent, true, chunk.audit_id || null);
                                return { role: 'assistant', content: fullContent,
                                         metadata: { tokens: chunk.tokens_generated || 0, model: 'Boudica', dashboard: true } };
                            }
                            // Extract memory note from final response if present and append to streamed content
                            const memoryNoteMatch = chunk.response.match(/\n\n\*\[I have pulled the context, from a conversation we had previously:.*?\]\*/);
                            if (memoryNoteMatch) {
                                // Append memory note to streamed content (which has proper spacing)
                                fullContent += memoryNoteMatch[0];
                            } else if (chunk.response !== fullContent) {
                                // Fallback: use final response if no memory note and content differs
                                fullContent = chunk.response;
                            }
                            tokensGenerated = chunk.tokens_generated || tokensGenerated;
                            // Signal completion with audit_id
                            onStream(this.stripChannelThought(fullContent), true, chunk.audit_id || null);
                        }
                    } catch (e) {
                        // Re-throw all API errors (content safety, domain validation, etc.)
                        // Only catch actual JSON parsing errors
                        if (e.message && !e.message.includes('JSON')) {
                            throw e;
                        }
                        console.warn('Failed to parse stream chunk:', line, e);
                    }
                }
            }
            
            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const chunk = JSON.parse(buffer);
                    
                    // Check for error in final chunk
                    if (chunk.error) {
                        throw new Error(chunk.error);
                    }
                    
                    if (chunk.response !== undefined) {
                        // PDF document: trigger browser download
                        if (chunk.pdf_base64) {
                            this.triggerPdfDownload(chunk.pdf_base64, chunk.pdf_filename || 'document.pdf');
                            fullContent = '📄 PDF document generated and downloaded: **' + (chunk.pdf_filename || 'document.pdf') + '**';
                            onStream && onStream(fullContent, true, chunk.audit_id || null);
                            return { role: 'assistant', content: fullContent,
                                     metadata: { tokens: chunk.tokens_generated || 0, model: chunk.model || 'Boudica', pdf: true } };
                        }
                        // PPTX presentation: trigger browser download
                        if (chunk.pptx_base64) {
                            this.triggerPptxDownload(chunk.pptx_base64, chunk.pptx_filename || 'presentation.pptx');
                            fullContent = '📊 Presentation generated and downloaded: **' + (chunk.pptx_filename || 'presentation.pptx') + '**';
                            onStream && onStream(fullContent, true, chunk.audit_id || null);
                            return { role: 'assistant', content: fullContent,
                                     metadata: { tokens: chunk.tokens_generated || 0, model: chunk.model || 'Boudica', pptx: true } };
                        }
                        // DOCX document: trigger browser download
                        if (chunk.docx_base64) {
                            this.triggerDocxDownload(chunk.docx_base64, chunk.docx_filename || 'document.docx');
                            fullContent = '📘 Word document generated and downloaded: **' + (chunk.docx_filename || 'document.docx') + '**';
                            onStream && onStream(fullContent, true, chunk.audit_id || null);
                            return { role: 'assistant', content: fullContent,
                                     metadata: { tokens: chunk.tokens_generated || 0, model: chunk.model || 'Boudica', docx: true } };
                        }
                        // XLSX spreadsheet: trigger browser download
                        if (chunk.xlsx_base64) {
                            this.triggerXlsxDownload(chunk.xlsx_base64, chunk.xlsx_filename || 'spreadsheet.xlsx');
                            fullContent = '📊 Spreadsheet generated and downloaded: **' + (chunk.xlsx_filename || 'spreadsheet.xlsx') + '**';
                            onStream && onStream(fullContent, true, chunk.audit_id || null);
                            return { role: 'assistant', content: fullContent,
                                     metadata: { tokens: chunk.tokens_generated || 0, model: chunk.model || 'Boudica', xlsx: true } };
                        }
                        // EPUB ebook: trigger browser download
                        if (chunk.epub_base64) {
                            this.triggerEpubDownload(chunk.epub_base64, chunk.epub_filename || 'ebook.epub');
                            fullContent = '📖 Ebook generated and downloaded: **' + (chunk.epub_filename || 'ebook.epub') + '**';
                            onStream && onStream(fullContent, true, chunk.audit_id || null);
                            return { role: 'assistant', content: fullContent,
                                     metadata: { tokens: chunk.tokens_generated || 0, model: chunk.model || 'Boudica', epub: true } };
                        }
                        // Dashboard: open interactive HTML in new tab
                        if (chunk.dashboard_base64) {
                            this.triggerDashboardOpen(chunk.dashboard_base64, chunk.dashboard_filename || 'dashboard.html');
                            fullContent = '📈 Interactive dashboard generated and opened in a new tab: **' + (chunk.dashboard_filename || 'dashboard.html') + '**';
                            onStream && onStream(fullContent, true, chunk.audit_id || null);
                            return { role: 'assistant', content: fullContent,
                                     metadata: { tokens: chunk.tokens_generated || 0, model: chunk.model || 'Boudica', dashboard: true } };
                        }
                        // Extract memory note from final response and append to streamed content
                        const memoryNoteMatch = chunk.response.match(/\n\n\*\[I have pulled the context, from a conversation we had previously:.*?\]\*/);
                        if (memoryNoteMatch) {
                            fullContent += memoryNoteMatch[0];
                        } else if (chunk.response !== fullContent) {
                            fullContent = chunk.response;
                        }
                        tokensGenerated = chunk.tokens_generated || tokensGenerated;
                    }
                } catch (e) {
                    // Re-throw all API errors (content safety, domain validation, etc.)
                    // Only catch actual JSON parsing errors
                    if (e.message && !e.message.includes('JSON')) {
                        throw e;
                    }
                    console.warn('Failed to parse final chunk:', buffer, e);
                }
            }
            
            return {
                role: 'assistant',
                content: this.stripChannelThought(fullContent),
                audit_id: lastChunk?.audit_id || null,  // Capture audit_id from backend
                metadata: {
                    tokens: tokensGenerated,
                    model: 'Boudica'
                }
            };
            
        } catch (error) {
            console.error('Streaming error:', error);
            throw error;
        }
    }
    
    /**
     * Send message to Flask/SAML backend (proxies to CGI)
     */
    async sendMessageFlask(chatId, message, onStream = null) {
        const sessionToken = this.auth.getSessionToken();

        // Handle both string messages and message objects
        const messageText = typeof message === 'string' ? message : (message.content || message);
        const timestamp = typeof message === 'object' ? message.timestamp : new Date().toISOString();
        const useRagEnabled = (localStorage.getItem('boudica_use_rag') || 'true') === 'true';
        const effectiveChatId = this.shouldIsolateSession(messageText, useRagEnabled)
            ? this.buildIsolatedSessionId(chatId)
            : chatId;

        // Prepare request
        const requestData = {
            chatId: effectiveChatId,
            message: messageText,
            timestamp: timestamp
        };

        // Use streaming if callback provided
        if (onStream) {
            return await this.streamResponse(requestData, onStream);
        } else {
            return await this.standardResponse(requestData);
        }
    }

    /**
     * Streaming response for CGI backend (Server-Sent Events)
     */
    async streamResponseCGI(url, onStream) {
        const response = await fetch(url, {
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error('Streaming request failed');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        const eventType = line.substring(7).trim();
                        continue;
                    }
                    
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        
                        try {
                            const parsed = JSON.parse(data);
                            
                            if (parsed.text) {
                                fullContent = parsed.text;
                                onStream(fullContent, false, null);
                            }
                            
                            if (parsed.tokens !== undefined) {
                                onStream(fullContent, true, parsed.audit_id || null);
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
        
        return {
            role: 'assistant',
            content: fullContent,
            metadata: {}
        };
    }


    /**
     * Standard (non-streaming) response from SAML backend
     */
    async standardResponse(requestData) {
        const sessionToken = this.auth.getSessionToken();
        
        const response = await fetch(`${this.apiBase}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${errorText}`);
        }

        const data = await response.json();
        return {
            role: 'assistant',
            content: data.response || data.text || '',
            metadata: {
                tokens: data.tokens_generated,
                time: data.time_seconds,
                model: data.model
            }
        };
    }

    /**
     * Streaming response from SAML backend
     */
    async streamResponse(requestData, onStream) {
        const sessionToken = this.auth.getSessionToken();
        
        const response = await fetch(`${this.apiBase}/api/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error('Streaming request failed');
        }

        // Read stream (plain text output)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                fullContent += chunk;
                onStream(fullContent, false, null);
            }
            
            // Signal completion
            onStream(fullContent, true, null);
        } finally {
            reader.releaseLock();
        }

        return {
            role: 'assistant',
            content: fullContent,
            metadata: {}
        };
    }

    /**
     * Get chat suggestions/completions
     */
    async getSuggestions(context) {
        try {
            if (this.useCGI) {
                const params = new URLSearchParams({
                    api_key: localStorage.getItem('boudica_api_key') || ''
                });
                
                const response = await fetch(`${this.apiBase}/suggestions?${params.toString()}`, {
                    method: 'GET'
                });
                
                if (!response.ok) {
                    throw new Error('Failed to get suggestions');
                }
                
                const data = await response.json();
                return data.suggestions || [];
            } else {
                // Return default suggestions (Boudica API doesn't have suggestions endpoint)
                return [
                    "What is Boudica?",
                    "How does local AI work?",
                    "Tell me about neural networks",
                    "What can you help me with?"
                ];
            }
        } catch (error) {
            console.error('Error getting suggestions:', error);
            return [];
        }
    }

    /**
     * Get chat history from server
     */
    async getChatHistory() {
        try {
            if (this.useCGI) {
                // CGI stores history per session, return empty for now
                // In production, you'd query by user ID
                return [];
            } else {
                const sessionToken = this.auth.getSessionToken();
                
                const response = await fetch(this.apiBase + '/api/chat/history', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to get chat history');
                }

                const data = await response.json();
                return data.chats || [];
            }
        } catch (error) {
            console.error('Error getting chat history:', error);
            return [];
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            // Use appropriate health check endpoint based on mode
            const endpoint = this.useCGI 
                ? `${this.apiBase}/health`  // CGI health check endpoint
                : `${this.apiBase}/api/health`;  // SAML backend health check
            
            const response = await fetch(endpoint, {
                method: 'GET'
            });
            return response.ok;
        } catch (error) {
            console.error('Error checking health:', error);
            return false;
        }
    }

    async saveUserSettings(settingsObject, settingKey = 'ui_state') {
        if (!this.useCGI) {
            return false;
        }

        const userId = this.getCurrentUserId();
        if (!userId || userId === 'anonymous') {
            return false;
        }

        const formData = new FormData();
        formData.append('user_id', userId);
        formData.append('setting_key', settingKey);
        formData.append('settings_json', JSON.stringify(settingsObject || {}));

        const response = await fetch(`${this.apiBase}/user_settings`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to save user settings');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to save user settings');
        }

        return true;
    }

    async loadUserSettings(settingKey = 'ui_state') {
        if (!this.useCGI) {
            return null;
        }

        const userId = this.getCurrentUserId();
        if (!userId || userId === 'anonymous') {
            return null;
        }

        const query = new URLSearchParams({
            user_id: userId,
            setting_key: settingKey
        });

        const response = await fetch(`${this.apiBase}/user_settings?${query.toString()}`, {
            method: 'GET'
        });

        if (!response.ok) {
            throw new Error('Failed to load user settings');
        }

        const data = await response.json();
        if (!data.success || !data.found) {
            return null;
        }

        return data.setting_value || null;
    }

    async loadUsers() {
        if (!this.useCGI) {
            return [];
        }

        // Scope the request to the current user's domain so the server only
        // returns teammates — avoiding sending thousands of email addresses
        // to the browser unnecessarily.
        const currentUser = this.getCurrentUserId();
        const domain = currentUser.includes('@') ? currentUser.split('@')[1] : null;
        const url = domain
            ? `${this.apiBase}/users?domain=${encodeURIComponent(domain)}`
            : `${this.apiBase}/users`;

        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
            throw new Error('Failed to load users list');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to load users list');
        }

        return data.users || [];
    }

    async sendUserMessage(fromUserId, toUserIds, subject, messageBody) {
        const payload = JSON.stringify({
            from_user_id: fromUserId,
            to_user_ids: toUserIds,
            subject: subject,
            message_body: messageBody
        });

        const response = await fetch(`${this.apiBase}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        if (!response.ok) {
            throw new Error('Failed to send message');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to send message');
        }

        return data;
    }

    async loadUserMessages(userId, box = 'inbox') {
        const query = new URLSearchParams({ user_id: userId, box });
        const response = await fetch(`${this.apiBase}/messages?${query.toString()}`, {
            method: 'GET'
        });

        if (!response.ok) {
            throw new Error('Failed to load messages');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to load messages');
        }

        return data.messages || [];
    }

    async updateUserMessage(messageId, userId, action) {
        const payload = JSON.stringify({ action, message_id: Number(messageId), user_id: userId });
        const response = await fetch(`${this.apiBase}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        if (!response.ok) {
            throw new Error('updateUserMessage failed: ' + response.status);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to update message');
        }

        return data;
    }

    // ── Shared Chats ─────────────────────────────────────────────────────────

    async loadSharedChats(userId) {
        const response = await fetch(`${this.apiBase}/shared_chats?user_id=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error('loadSharedChats failed: ' + response.status);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to load shared chats');
        return data.chats || [];
    }

    async loadSharedChatMessages(chatId, userId, sinceId = 0) {
        const url = `${this.apiBase}/shared_chats?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(userId)}&since_id=${sinceId}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('loadSharedChatMessages failed: ' + response.status);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to load messages');
        return data.messages || [];
    }

    async createSharedChat(ownerUserId, title, participants) {
        const payload = JSON.stringify({ action: 'create', owner_id: ownerUserId, title, participants });
        const response = await fetch(`${this.apiBase}/shared_chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        if (!response.ok) throw new Error('createSharedChat failed: ' + response.status);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to create shared chat');
        return data;
    }

    async inviteToSharedChat(chatId, ownerUserId, inviteeUserId) {
        const payload = JSON.stringify({ action: 'invite', chat_id: Number(chatId), user_id: ownerUserId, invitee: inviteeUserId });
        const response = await fetch(`${this.apiBase}/shared_chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        if (!response.ok) throw new Error('inviteToSharedChat failed: ' + response.status);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to invite user');
        return data;
    }

    async sendSharedGroupMessage(chatId, authorId, content) {
        const payload = JSON.stringify({ action: 'group_message', chat_id: Number(chatId), author_id: authorId, content });
        const response = await fetch(`${this.apiBase}/shared_chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        if (!response.ok) throw new Error('sendSharedGroupMessage failed: ' + response.status);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to send group message');
        return data;
    }

    async deleteSharedChat(chatId, userId) {
        const payload = JSON.stringify({ action: 'delete', chat_id: Number(chatId), user_id: userId });
        const response = await fetch(`${this.apiBase}/shared_chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        if (!response.ok) throw new Error('deleteSharedChat failed: ' + response.status);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to delete shared chat');
        return data;
    }

    async sendSharedChatMessage(chatId, authorId, content, options = {}) {
        // Shared chats are always isolated from personal history.
        // Reuse the same isolated session for the lifetime of this working
        // session (panel open) so Boudica retains context across follow-up
        // messages (e.g. iterative document editing).
        // A new isolated session is started by calling resetSharedSession(chatId),
        // which openSharedChatPanel() does each time the panel is opened.
        const key = String(chatId);
        if (!this._sharedIsolatedSessions.has(key)) {
            this._sharedIsolatedSessions.set(key, this.buildIsolatedSessionId(chatId));
        }
        const sessionId = this._sharedIsolatedSessions.get(key);

        // Shared chats always use disable_memory:true — the backend CGI sends that
        // flag explicitly. Do NOT strip "No Memory" phrases here; leaving them in
        // the message text provides a redundant signal to the inference server and
        // honours the user's explicit instruction rather than silently ignoring it.

        const payload = JSON.stringify({
            action: 'message',
            chat_id: Number(chatId),
            author_id: authorId,
            session_id: sessionId,
            content: content + '\n\nOutput html',
            max_tokens: options.maxTokens || parseInt(localStorage.getItem('boudica_max_tokens') || '35000'),
            temperature: options.temperature || 0.8,
            use_rag: false
        });
        const response = await fetch(`${this.apiBase}/shared_chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        if (!response.ok) throw new Error('sendSharedChatMessage failed: ' + response.status);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to send message');
        return data;
    }

    // Call when opening a shared chat panel to start a fresh working session.
    resetSharedSession(chatId) {
        this._sharedIsolatedSessions.delete(String(chatId));
    }
}

// Export for use in other modules
window.ChatAPI = ChatAPI;
