/**
 * Audio Upload UI Module
 * Provides UI for audio file upload and transcription display
 */

class AudioUploadUI {
    constructor(containerId, audioTranscription) {
        this.container = document.getElementById(containerId);
        this.audioTranscription = audioTranscription;
        this.isTranscribing = false;
        this.currentFileId = null;
        
        if (!this.container) {
            console.error(`Container with ID "${containerId}" not found`);
            return;
        }

        this.init();
    }

    /**
     * Initialize the UI
     */
    init() {
        this.createUI();
        this.attachEventListeners();
    }

    /**
     * Create the HTML structure
     */
    createUI() {
        this.container.innerHTML = `
            <div class="audio-transcription-panel">
                <h2>Audio Transcription</h2>
                
                <div class="audio-upload-section">
                    <div class="upload-area" id="audioUploadArea">
                        <div class="upload-icon">🎤</div>
                        <p>Drag and drop audio file here</p>
                        <p class="upload-hint">or click to browse</p>
                        <input type="file" id="audioFileInput" accept=".wav,.mp3,.m4a,.ogg,.flac,.aac,.webm,.opus" style="display: none;">
                    </div>
                    
                    <div class="supported-formats">
                        <strong>Supported formats:</strong> WAV, MP3, M4A, OGG, FLAC, AAC, WebM, Opus<br>
                        <strong>Max size:</strong> 500MB
                    </div>
                </div>

                <div class="transcription-section" style="display: none;" id="transcriptionSection">
                    <div class="transcription-controls">
                        <button id="transcribeBtn" class="btn btn-primary" style="display: none;">
                            Transcribe Now
                        </button>
                        <button id="clearBtn" class="btn btn-secondary" style="display: none;">
                            Clear
                        </button>
                    </div>

                    <div id="selectedFile" class="selected-file" style="display: none;">
                        <strong>Selected file:</strong> <span id="fileName"></span>
                        <span id="fileSize"></span>
                    </div>

                    <div id="progressContainer" class="progress-container" style="display: none;">
                        <div class="progress-bar">
                            <div id="progressFill" class="progress-fill"></div>
                        </div>
                        <div id="progressText" class="progress-text">Uploading...</div>
                    </div>

                    <div id="transcriptOutput" class="transcript-output" style="display: none;">
                        <h3>Transcript</h3>
                        <div id="transcriptText" class="transcript-text"></div>
                        <div id="transcriptMeta" class="transcript-meta"></div>
                    </div>

                    <div id="errorContainer" class="error-message" style="display: none;">
                        <strong>Error:</strong> <span id="errorText"></span>
                    </div>
                </div>
            </div>
        `;

        this.addStyles();
    }

    /**
     * Add CSS styles
     */
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .audio-transcription-panel {
                padding: 20px;
                background: #f9f9f9;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            .audio-transcription-panel h2 {
                margin-top: 0;
                color: #333;
            }

            .audio-upload-section {
                margin-bottom: 20px;
            }

            .upload-area {
                border: 2px dashed #B8860B;
                border-radius: 8px;
                padding: 40px;
                text-align: center;
                cursor: pointer;
                background: #fafaf8;
                transition: all 0.3s ease;
            }

            .upload-area:hover {
                background: #f5f0e8;
                border-color: #d4a017;
            }

            .upload-area.dragover {
                background: #ede6d3;
                border-color: #8b6914;
            }

            .upload-icon {
                font-size: 48px;
                margin-bottom: 10px;
            }

            .upload-area p {
                margin: 8px 0;
                color: #666;
            }

            .upload-area .upload-hint {
                font-size: 14px;
                color: #999;
            }

            .supported-formats {
                font-size: 12px;
                color: #666;
                margin-top: 15px;
                padding: 10px;
                background: #f0f0f0;
                border-radius: 4px;
            }

            .transcription-section {
                margin-top: 20px;
            }

            .transcription-controls {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }

            .btn {
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
            }

            .btn-primary {
                background: linear-gradient(135deg, #B8860B 0%, #8b6914 100%);
                color: white;
            }

            .btn-primary:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(184, 134, 11, 0.3);
            }

            .btn-primary:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .btn-secondary {
                background: #e0e0e0;
                color: #333;
            }

            .btn-secondary:hover {
                background: #d0d0d0;
            }

            .selected-file {
                padding: 12px;
                background: #e3f2fd;
                border-radius: 4px;
                color: #1976d2;
                font-size: 14px;
                margin-bottom: 15px;
            }

            .selected-file #fileName {
                font-weight: 600;
                word-break: break-all;
            }

            .selected-file #fileSize {
                color: #999;
                font-size: 12px;
                margin-left: 10px;
            }

            .progress-container {
                margin-bottom: 15px;
            }

            .progress-bar {
                background: #e0e0e0;
                height: 8px;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 8px;
            }

            .progress-fill {
                background: linear-gradient(90deg, #B8860B 0%, #d4a017 100%);
                height: 100%;
                width: 0;
                transition: width 0.3s ease;
            }

            .progress-text {
                font-size: 12px;
                color: #666;
                text-align: center;
            }

            .transcript-output {
                margin-top: 20px;
                padding: 15px;
                background: white;
                border-radius: 8px;
                border-left: 4px solid #B8860B;
            }

            .transcript-output h3 {
                margin-top: 0;
                color: #333;
            }

            .transcript-text {
                background: #f9f9f9;
                padding: 15px;
                border-radius: 4px;
                line-height: 1.6;
                color: #333;
                white-space: pre-wrap;
                word-wrap: break-word;
                max-height: 400px;
                overflow-y: auto;
                margin-bottom: 10px;
            }

            .transcript-meta {
                font-size: 12px;
                color: #999;
                padding-top: 10px;
                border-top: 1px solid #eee;
            }

            .error-message {
                padding: 12px;
                background: #ffebee;
                border-radius: 4px;
                color: #c62828;
                font-size: 14px;
                margin-top: 15px;
            }

            .error-message strong {
                display: block;
                margin-bottom: 5px;
            }
        `;

        if (!document.querySelector('style[data-audio-ui]')) {
            style.setAttribute('data-audio-ui', 'true');
            document.head.appendChild(style);
        }
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        const uploadArea = this.container.querySelector('#audioUploadArea');
        const fileInput = this.container.querySelector('#audioFileInput');
        const transcribeBtn = this.container.querySelector('#transcribeBtn');
        const clearBtn = this.container.querySelector('#clearBtn');

        // File input click
        uploadArea.addEventListener('click', () => fileInput.click());

        // File selection
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            this.handleFileSelect(file);
        });

        // Transcribe button
        transcribeBtn.addEventListener('click', () => this.transcribeFile());

        // Clear button
        clearBtn.addEventListener('click', () => this.clear());
    }

    /**
     * Handle file selection
     * @param {File} file
     */
    handleFileSelect(file) {
        if (!file) return;

        // Validate file
        const validation = this.audioTranscription.validateFile(file);
        if (!validation.valid) {
            this.showError(validation.error);
            return;
        }

        this.clearError();
        this.currentFile = file;

        // Show file info
        const section = this.container.querySelector('#transcriptionSection');
        const selectedFile = this.container.querySelector('#selectedFile');
        const fileName = this.container.querySelector('#fileName');
        const fileSize = this.container.querySelector('#fileSize');
        const transcribeBtn = this.container.querySelector('#transcribeBtn');

        section.style.display = 'block';
        selectedFile.style.display = 'block';
        transcribeBtn.style.display = 'inline-block';

        fileName.textContent = file.name;
        fileSize.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;

        // Reset transcript display
        this.container.querySelector('#transcriptOutput').style.display = 'none';
    }

    /**
     * Transcribe the selected file
     */
    async transcribeFile() {
        if (!this.currentFile) {
            this.showError('Please select a file first');
            return;
        }

        if (this.isTranscribing) return;

        this.isTranscribing = true;
        const progressContainer = this.container.querySelector('#progressContainer');
        const transcribeBtn = this.container.querySelector('#transcribeBtn');

        transcribeBtn.disabled = true;
        progressContainer.style.display = 'block';

        try {
            const result = await this.audioTranscription.transcribeFile(
                this.currentFile,
                (message, percent) => this.updateProgress(message, percent)
            );

            this.displayTranscript(result);
            this.clearError();

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.isTranscribing = false;
            transcribeBtn.disabled = false;
            progressContainer.style.display = 'none';
        }
    }

    /**
     * Update progress indicator
     * @param {string} message
     * @param {number} percent
     */
    updateProgress(message, percent) {
        const progressFill = this.container.querySelector('#progressFill');
        const progressText = this.container.querySelector('#progressText');

        progressFill.style.width = percent + '%';
        progressText.textContent = message;
    }

    /**
     * Display transcript result
     * @param {Object} result
     */
    displayTranscript(result) {
        const output = this.container.querySelector('#transcriptOutput');
        const text = this.container.querySelector('#transcriptText');
        const meta = this.container.querySelector('#transcriptMeta');

        text.textContent = result.transcript;

        let metaText = `Language: ${result.language || 'Unknown'}`;
        if (result.segments) {
            metaText += ` | Segments: ${result.segments.length}`;
        }
        meta.textContent = metaText;

        output.style.display = 'block';
    }

    /**
     * Show error message
     * @param {string} message
     */
    showError(message) {
        const errorContainer = this.container.querySelector('#errorContainer');
        const errorText = this.container.querySelector('#errorText');

        errorText.textContent = message;
        errorContainer.style.display = 'block';
    }

    /**
     * Clear error message
     */
    clearError() {
        const errorContainer = this.container.querySelector('#errorContainer');
        errorContainer.style.display = 'none';
    }

    /**
     * Clear all UI
     */
    clear() {
        this.currentFile = null;
        this.currentFileId = null;
        this.container.querySelector('#audioFileInput').value = '';
        this.container.querySelector('#selectedFile').style.display = 'none';
        this.container.querySelector('#transcriptOutput').style.display = 'none';
        this.container.querySelector('#progressContainer').style.display = 'none';
        this.clearError();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioUploadUI;
}
