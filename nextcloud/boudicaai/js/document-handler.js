/**
 * Document Handler
 * Handles document file queuing for server-side processing
 * 
 * Flow:
 * 1. User selects file -> addFile() stores File object locally (no upload)
 * 2. User can add more files (multiple files supported)
 * 3. User types prompt
 * 4. User clicks send -> files sent WITH prompt to inference server
 * 5. Server extracts text using text_extractor.cpp and processes
 * 
 * NOTE: JavaScript does NOT extract text. Server handles all extraction.
 */

class DocumentHandler {
    constructor() {
        this.queuedFiles = [];  // File objects waiting to be processed
        this.maxFileSize = 50 * 1024 * 1024; // 10MB
        this.apiBase = localStorage.getItem('boudica_api_url') || '/api/boudica';
        
        // Supported formats (matches text_extractor.cpp + vision-capable images)
        this.supportedFormats = [
            'txt', 'md', 'log', 'text',
            'pdf',
            'docx', 'doc',
            'xlsx', 'xls', 'csv',
            'pptx', 'ppt',
            'odt', 'ods', 'odp',
            'rtf', 'cpp','c++','h','hpp','cu','java','js','py','rb','go','rs','swift','kt','php',
            'json', 'xml', 'html', 'htm','wav','mp3','mp4','avi','mov','mkv','m4a','flac','ogg','webm',
            // Images — sent as base64 to vision model, not OCR'd
            'jpg', 'jpeg', 'png', 'gif', 'webp'
        ];
        this.imageFormats = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
    }
    
    /**
     * Add file to queue (does NOT upload yet)
     */
    addFile(file) {
        // Validate file
        if (!file) {
            throw new Error('No file selected');
        }
        
        if (file.size > this.maxFileSize) {
            throw new Error(`File too large. Maximum size: ${this.maxFileSize / (1024*1024)}MB`);
        }
        
        if (!this.isSupportedFile(file.name)) {
            const supportedList = this.supportedFormats.join(', ');
            throw new Error(`Unsupported file format. Supported: ${supportedList}`);
        }
        
        // Check for duplicates
        if (this.queuedFiles.some(f => f.name === file.name && f.size === file.size)) {
            throw new Error('This file is already added');
        }
        
        // Add to queue with unique ID
        const fileItem = {
            id: Date.now(),
            file: file,
            name: file.name,
            size: file.size
        };
        
        this.queuedFiles.push(fileItem);
        return fileItem;
    }
    
    /**
     * Check if file is supported
     */
    isSupportedFile(filename) {
        const ext = this.getFileExtension(filename);
        return this.supportedFormats.includes(ext);
    }

    /**
     * Check if file is an image (sent to vision model, not OCR'd)
     */
    isImageFile(filename) {
        return this.imageFormats.has(this.getFileExtension(filename));
    }
    
    /**
     * Get file extension
     */
    getFileExtension(filename) {
        const parts = filename.toLowerCase().split('.');
        return parts.length > 1 ? parts[parts.length - 1] : '';
    }
    
    /**
     * Get files ready to send to server
     * Files should be sent with the prompt to the inference endpoint
     * Server will handle extraction via text_extractor.cpp
     */
    getFilesForUpload() {
        return this.queuedFiles.map(item => ({
            id: item.id,
            file: item.file,
            name: item.name,
            size: item.size
        }));
    }
    
    /**
     * Build FormData with files for sending to server
     * Server will extract text and build context
     */
    buildFormDataWithFiles(prompt, otherParams = {}) {
        const formData = new FormData();
        
        // Add prompt and parameters
        formData.append('message', prompt);
        for (const [key, value] of Object.entries(otherParams)) {
            formData.append(key, value);
        }
        
        // Add all queued files
        this.queuedFiles.forEach((item, index) => {
            formData.append(`document_${index}`, item.file);
            formData.append(`filename_${index}`, item.name);
        });
        
        // Add file count
        formData.append('document_count', this.queuedFiles.length.toString());
        
        return formData;
    }
    
    /**
     * Clear files after sending (call this after successful send)
     */
    clearAfterSend() {
        this.queuedFiles = [];
    }
    
    /**
     * Remove file from queue by ID
     */
    removeFile(fileId) {
        this.queuedFiles = this.queuedFiles.filter(f => f.id !== fileId);
    }
    
    /**
     * Get all queued files
     */
    getQueuedFiles() {
        return this.queuedFiles;
    }
    
    /**
     * Clear all queued files
     */
    clearQueue() {
        this.queuedFiles = [];
    }
    
    /**
     * Check if any files are queued
     */
    hasFiles() {
        return this.queuedFiles.length > 0;
    }
    
    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    /**
     * Get supported formats as string
     */
    getSupportedFormatsString() {
        return this.supportedFormats.join(', ').toUpperCase();
    }

    /**
     * Convert a JSON file's content to a plain-text / CSV representation so
     * it is safe to embed in any context without ambiguity.
     *
     * Recognised structures:
     *  - Messaging thread  { participants, threadName, messages[] }
     *  - Array of objects  → CSV (headers from first row's keys)
     *  - Plain array       → one value per line
     *  - Plain object      → "key: value" pairs
     *  - Anything else     → JSON.stringify with 2-space indent (still text)
     *
     * Returns a new File with a .txt extension.
     */
    async convertJsonToText(file) {
        // Use FileReader for broadest browser compatibility
        const raw = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error(`Cannot read ${file.name}`));
            reader.readAsText(file, 'utf-8');
        });

        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            // Not valid JSON — return original file unchanged
            return file;
        }

        let text = '';

        // --- Messaging-thread structure ---
        if (data && typeof data === 'object' && !Array.isArray(data) &&
            Array.isArray(data.messages)) {

            const participants = Array.isArray(data.participants)
                ? data.participants.join(', ')
                : '';
            const thread = data.threadName || data.conversationName || '';

            const lines = [];
            if (thread)        lines.push(`Thread: ${thread}`);
            if (participants)  lines.push(`Participants: ${participants}`);
            lines.push('');
            lines.push('Timestamp,Sender,Type,Text');

            let rowCount = 0;
            for (const msg of data.messages) {
                // Guard against null/malformed entries
                if (!msg || typeof msg !== 'object') continue;
                // Only skip messages explicitly marked as unsent
                if (msg.isUnsent === true) continue;

                try {
                    const ts = msg.timestamp
                        ? new Date(msg.timestamp).toISOString()
                        : '';
                    const sender   = String(msg.senderName   ?? '').replace(/"/g, '""');
                    const type     = String(msg.type         ?? 'text').replace(/"/g, '""');
                    // Facebook exports use 'content' in some message types
                    const msgText  = String(msg.text ?? msg.content ?? '').replace(/"/g, '""');
                    lines.push(`"${ts}","${sender}","${type}","${msgText}"`);
                    rowCount++;
                } catch (rowErr) {
                    // Skip individual malformed rows, don't abort the whole loop
                    console.warn('Skipping malformed message row:', rowErr);
                }
            }

            if (rowCount === 0) {
                lines.push('"(no message rows found)","","",""');
            }

            text = lines.join('\n');

        // --- Array of objects → CSV ---
        } else if (Array.isArray(data) && data.length > 0 &&
                   typeof data[0] === 'object' && data[0] !== null) {

            const keys = Object.keys(data[0]);
            const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
            const rows = [keys.map(k => escape(k)).join(',')];
            for (const row of data) {
                rows.push(keys.map(k => escape(row[k])).join(','));
            }
            text = rows.join('\n');

        // --- Plain array → one item per line ---
        } else if (Array.isArray(data)) {
            text = data.map(v => String(v)).join('\n');

        // --- Plain object → key: value ---
        } else if (typeof data === 'object' && data !== null) {
            text = Object.entries(data)
                .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join('\n');

        // --- Scalar / other ---
        } else {
            text = String(data);
        }

        const baseName = file.name.replace(/\.json$/i, '');
        return new File([text], `${baseName}.txt`, { type: 'text/plain' });
    }

    /**
     * Prepare queued files for sending:
     *  - JSON files are converted to plain text and returned as a single
     *    inlineText string to be appended directly to the prompt — no file
     *    upload needed.
     *  - All other files are returned in the files array for normal multipart
     *    upload.
     *
     * @returns {Promise<{files: Array, inlineText: string}>}
     */
    async prepareUpload() {
        const files = [];
        const textParts = [];

        for (const item of this.queuedFiles) {
            if (this.getFileExtension(item.name) === 'json') {
                // Convert JSON → text and inline into prompt
                const converted = await this.convertJsonToText(item.file);
                const text = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result);
                    reader.onerror = () => reject(new Error(`Cannot read ${converted.name}`));
                    reader.readAsText(converted, 'utf-8');
                });
                textParts.push(`--- ${item.name} ---\n${text}`);
            } else {
                files.push(item);
            }
        }

        return {
            files,
            inlineText: textParts.join('\n\n')
        };
    }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocumentHandler;
}
