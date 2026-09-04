/**
 * Audio Transcription Module
 * Handles audio file uploads and transcription via local Whisper service
 */

class AudioTranscription {
    constructor(apiBase = 'https://myboudica.com/whisper') {
        this.whisperServiceUrl = apiBase;
        this.supportedFormats = ['wav', 'mp3', 'm4a', 'ogg', 'flac', 'aac', 'webm', 'opus'];
        this.maxFileSizeMB = 500;
        this.transcriptions = new Map(); // Cache transcriptions by file ID
        this.activeUploads = new Map();  // Track in-progress uploads
    }

    /**
     * Check if Whisper service is available
     * @returns {Promise<boolean>}
     */
    async isServiceAvailable() {
        try {
            const response = await fetch(`${this.whisperServiceUrl}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            return response.ok;
        } catch (error) {
            console.warn('Whisper service not available:', error);
            return false;
        }
    }

    /**
     * Get supported audio formats
     * @returns {string[]}
     */
    getSupportedFormats() {
        return this.supportedFormats;
    }

    /**
     * Validate audio file before upload
     * @param {File} file
     * @returns {Object} { valid: boolean, error: string|null }
     */
    validateFile(file) {
        if (!file) {
            return { valid: false, error: 'No file provided' };
        }

        // Check file extension
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!this.supportedFormats.includes(ext)) {
            return {
                valid: false,
                error: `Unsupported format: ${ext}. Supported: ${this.supportedFormats.join(', ')}`
            };
        }

        // Check file size (convert MB to bytes)
        const maxBytes = this.maxFileSizeMB * 1024 * 1024;
        if (file.size > maxBytes) {
            return {
                valid: false,
                error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max: ${this.maxFileSizeMB}MB`
            };
        }

        return { valid: true, error: null };
    }

    /**
     * Upload and transcribe an audio file
     * @param {File} file - Audio file to transcribe
     * @param {Function} onProgress - Callback for progress updates (optional)
     * @param {string} language - ISO 639-1 language code (optional, default: null = auto-detect)
     * @returns {Promise<{status: string, transcript: string, language: string, file_id: string}>}
     */
    async transcribeFile(file, onProgress = null, language = null) {
        // Validate file
        const validation = this.validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Check service availability
        const available = await this.isServiceAvailable();
        if (!available) {
            throw new Error('Whisper transcription service is not available. Please try again later.');
        }

        // Create unique file ID for tracking
        const fileId = 'audio-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        this.activeUploads.set(fileId, { file, status: 'uploading' });

        try {
            if (onProgress) onProgress('Uploading audio file...', 0);

            // Create FormData for multipart upload
            const formData = new FormData();
            formData.append('audio', file);
            if (language) {
                formData.append('language', language);
            }

            if (onProgress) onProgress('Sending to transcription service...', 25);

            // Send to Whisper service
            const response = await fetch(`${this.whisperServiceUrl}/transcribe`, {
                method: 'POST',
                body: formData,
                // Note: Don't set Content-Type header - browser will set it with boundary
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Transcription failed: ${response.statusText}`);
            }

            if (onProgress) onProgress('Processing transcription...', 75);

            const result = await response.json();

            if (result.status !== 'success') {
                throw new Error(result.error || 'Transcription failed');
            }

            if (onProgress) onProgress('Transcription complete!', 100);

            // Cache the result
            this.transcriptions.set(fileId, result);
            this.activeUploads.set(fileId, { file, status: 'completed', result });

            return {
                status: 'success',
                transcript: result.transcript,
                language: result.language,
                file_id: fileId,
                segments: result.segments || null
            };

        } catch (error) {
            this.activeUploads.set(fileId, { file, status: 'failed', error: error.message });
            throw error;
        }
    }

    /**
     * Transcribe with detailed segment information
     * @param {File} file - Audio file to transcribe
     * @param {Function} onProgress - Callback for progress updates (optional)
     * @param {string} language - ISO 639-1 language code (optional)
     * @returns {Promise<{status: string, transcript: string, segments: Array, language: string, file_id: string}>}
     */
    async transcribeFileWithSegments(file, onProgress = null, language = null) {
        // Validate file
        const validation = this.validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Check service availability
        const available = await this.isServiceAvailable();
        if (!available) {
            throw new Error('Whisper transcription service is not available.');
        }

        const fileId = 'audio-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        this.activeUploads.set(fileId, { file, status: 'uploading' });

        try {
            if (onProgress) onProgress('Uploading audio file...', 0);

            const formData = new FormData();
            formData.append('audio', file);
            if (language) {
                formData.append('language', language);
            }

            if (onProgress) onProgress('Processing transcription...', 50);

            // Use /transcribe/segments endpoint
            const response = await fetch(`${this.whisperServiceUrl}/transcribe/segments`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Transcription failed: ${response.statusText}`);
            }

            if (onProgress) onProgress('Transcription complete!', 100);

            const result = await response.json();

            if (result.status !== 'success') {
                throw new Error(result.error || 'Transcription failed');
            }

            // Cache the result
            this.transcriptions.set(fileId, result);
            this.activeUploads.set(fileId, { file, status: 'completed', result });

            return {
                status: 'success',
                transcript: result.transcript,
                segments: result.segments || [],
                language: result.language,
                file_id: fileId
            };

        } catch (error) {
            this.activeUploads.set(fileId, { file, status: 'failed', error: error.message });
            throw error;
        }
    }

    /**
     * Get service information
     * @returns {Promise<Object>}
     */
    async getServiceInfo() {
        try {
            const response = await fetch(`${this.whisperServiceUrl}/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error('Failed to get service info');
            return await response.json();
        } catch (error) {
            console.error('Error getting service info:', error);
            return null;
        }
    }

    /**
     * Get available Whisper models
     * @returns {Promise<Array>}
     */
    async getAvailableModels() {
        try {
            const response = await fetch(`${this.whisperServiceUrl}/models`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error('Failed to get models');
            return await response.json();
        } catch (error) {
            console.error('Error getting models:', error);
            return [];
        }
    }

    /**
     * Get cached transcription result
     * @param {string} fileId - File ID returned from transcribeFile
     * @returns {Object|null}
     */
    getTranscription(fileId) {
        return this.transcriptions.get(fileId) || null;
    }

    /**
     * Get upload status
     * @param {string} fileId
     * @returns {Object|null}
     */
    getUploadStatus(fileId) {
        return this.activeUploads.get(fileId) || null;
    }

    /**
     * Clear cache for a file
     * @param {string} fileId
     */
    clearCache(fileId) {
        this.transcriptions.delete(fileId);
        this.activeUploads.delete(fileId);
    }

    /**
     * Clear all caches
     */
    clearAllCache() {
        this.transcriptions.clear();
        this.activeUploads.clear();
    }

    /**
     * Set custom Whisper service URL
     * @param {string} url
     */
    setServiceUrl(url) {
        this.whisperServiceUrl = url;
    }

    /**
     * Set max file size in MB
     * @param {number} mb
     */
    setMaxFileSize(mb) {
        this.maxFileSizeMB = mb;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioTranscription;
}
