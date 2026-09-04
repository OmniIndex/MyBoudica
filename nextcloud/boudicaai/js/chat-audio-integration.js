/**
 * Chat + Audio Transcription Integration
 * Example of how to integrate audio transcription into the Boudica chat UI
 * 
 * This file shows the pattern for adding audio upload/transcription
 * directly into the chat message area.
 */

class ChatWithAudioTranscription {
    constructor(chatContainerId, audioTranscription) {
        this.chatContainer = document.getElementById(chatContainerId);
        this.audioTranscription = audioTranscription;
        this.chatInput = null;
        this.attachAudioButton = null;
        this.init();
    }

    /**
     * Initialize integration
     */
    init() {
        // Find or create chat input area
        this.setupAudioInputButton();
        this.attachEventListeners();
    }

    /**
     * Setup audio input button in chat toolbar
     */
    setupAudioInputButton() {
        // Look for existing chat input area
        const chatToolbar = this.chatContainer.querySelector('.chat-input-toolbar') ||
                           this.chatContainer.querySelector('.message-input-controls') ||
                           this.chatContainer.querySelector('.chat-controls');

        if (!chatToolbar) {
            console.warn('Could not find chat toolbar element');
            return;
        }

        // Create audio attachment button
        this.attachAudioButton = document.createElement('button');
        this.attachAudioButton.id = 'audioAttachBtn';
        this.attachAudioButton.className = 'chat-audio-btn';
        this.attachAudioButton.title = 'Attach and transcribe audio';
        this.attachAudioButton.innerHTML = '🎤';

        // Add button styling
        this.addButtonStyles();

        // Create hidden file input
        this.audioFileInput = document.createElement('input');
        this.audioFileInput.type = 'file';
        this.audioFileInput.accept = '.wav,.mp3,.m4a,.ogg,.flac,.aac,.webm,.opus';
        this.audioFileInput.style.display = 'none';
        this.audioFileInput.id = 'chatAudioFileInput';

        // Insert into toolbar
        chatToolbar.appendChild(this.attachAudioButton);
        chatToolbar.appendChild(this.audioFileInput);
    }

    /**
     * Add CSS for audio button
     */
    addButtonStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .chat-audio-btn {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                padding: 8px 12px;
                border-radius: 4px;
                transition: all 0.2s;
            }

            .chat-audio-btn:hover {
                background: rgba(184, 134, 11, 0.1);
            }

            .chat-audio-btn.processing {
                opacity: 0.5;
                cursor: not-allowed;
                animation: pulse 1s infinite;
            }

            @keyframes pulse {
                0%, 100% { opacity: 0.5; }
                50% { opacity: 1; }
            }

            .audio-transcription-popup {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border-radius: 8px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                padding: 20px;
                max-width: 500px;
                z-index: 10000;
            }

            .audio-transcription-popup .popup-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }

            .audio-transcription-popup .popup-header h3 {
                margin: 0;
            }

            .audio-transcription-popup .close-btn {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #999;
            }

            .audio-transcription-popup .close-btn:hover {
                color: #333;
            }

            .audio-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
            }
        `;

        if (!document.querySelector('style[data-chat-audio]')) {
            style.setAttribute('data-chat-audio', 'true');
            document.head.appendChild(style);
        }
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        this.attachAudioButton.addEventListener('click', () => this.openAudioModal());
        this.audioFileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
    }

    /**
     * Open audio transcription modal
     */
    openAudioModal() {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'audio-overlay';

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'audio-transcription-popup';
        modal.innerHTML = `
            <div class="popup-header">
                <h3>Transcribe Audio</h3>
                <button class="close-btn">&times;</button>
            </div>

            <div class="audio-modal-content">
                <div class="upload-area-modal" id="audioUploadAreaModal">
                    <div class="upload-icon">🎤</div>
                    <p>Drag and drop or click to select audio file</p>
                    <p class="upload-hint">Supported: WAV, MP3, M4A, OGG, FLAC, AAC, WebM, Opus</p>
                </div>

                <div id="transcriptionProgress" class="transcription-progress" style="display: none;">
                    <div class="progress-bar">
                        <div id="progressFill" class="progress-fill"></div>
                    </div>
                    <div id="progressText" class="progress-text">Uploading...</div>
                </div>

                <div id="transcriptionResult" class="transcription-result" style="display: none;">
                    <h4>Transcript:</h4>
                    <div id="resultText" class="result-text"></div>
                    <div class="result-actions">
                        <button id="insertTranscriptBtn" class="btn-primary">Insert into chat</button>
                        <button id="copyTranscriptBtn" class="btn-secondary">Copy to clipboard</button>
                    </div>
                </div>

                <div id="transcriptionError" class="transcription-error" style="display: none;">
                    <p id="errorMessage"></p>
                </div>
            </div>
        `;

        // Add modal styles
        const modalStyle = `
            <style>
                .upload-area-modal {
                    border: 2px dashed #B8860B;
                    border-radius: 8px;
                    padding: 30px;
                    text-align: center;
                    cursor: pointer;
                    background: #fafaf8;
                    transition: all 0.3s;
                }

                .upload-area-modal:hover {
                    background: #f5f0e8;
                }

                .upload-area-modal.dragover {
                    background: #ede6d3;
                    border-color: #8b6914;
                }

                .upload-icon {
                    font-size: 48px;
                    margin-bottom: 10px;
                }

                .transcription-progress {
                    margin: 15px 0;
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
                    transition: width 0.3s;
                }

                .progress-text {
                    font-size: 12px;
                    color: #666;
                    text-align: center;
                }

                .transcription-result {
                    margin: 15px 0;
                }

                .result-text {
                    background: #f9f9f9;
                    padding: 12px;
                    border-radius: 4px;
                    margin: 10px 0;
                    max-height: 200px;
                    overflow-y: auto;
                    border-left: 4px solid #B8860B;
                }

                .result-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 15px;
                }

                .btn-primary {
                    flex: 1;
                    padding: 10px;
                    background: linear-gradient(135deg, #B8860B 0%, #8b6914 100%);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 600;
                }

                .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(184, 134, 11, 0.3);
                }

                .btn-secondary {
                    flex: 1;
                    padding: 10px;
                    background: #e0e0e0;
                    color: #333;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 600;
                }

                .btn-secondary:hover {
                    background: #d0d0d0;
                }

                .transcription-error {
                    background: #ffebee;
                    border-left: 4px solid #c62828;
                    padding: 12px;
                    border-radius: 4px;
                    color: #c62828;
                    margin: 15px 0;
                }

                .transcription-error p {
                    margin: 0;
                }
            </style>
        `;

        // Append styles and elements
        document.body.insertAdjacentHTML('beforeend', modalStyle);
        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        // Setup modal handlers
        this.setupModalHandlers(modal, overlay);
    }

    /**
     * Setup modal event handlers
     */
    setupModalHandlers(modal, overlay) {
        const uploadArea = modal.querySelector('#audioUploadAreaModal');
        const closeBtn = modal.querySelector('.close-btn');
        const insertBtn = modal.querySelector('#insertTranscriptBtn');
        const copyBtn = modal.querySelector('#copyTranscriptBtn');

        let currentTranscript = '';

        // Close modal
        const closeModal = () => {
            modal.remove();
            overlay.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);

        // File selection
        uploadArea.addEventListener('click', () => {
            this.audioFileInput.click();
        });

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
            this.transcribeInModal(file, modal);
        });

        // Reattach file input handler for this modal
        const handleFileSelect = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.transcribeInModal(file, modal);
            }
            e.target.value = '';
        };

        this.audioFileInput.removeEventListener('change', this.fileSelectHandler);
        this.fileSelectHandler = handleFileSelect;
        this.audioFileInput.addEventListener('change', this.fileSelectHandler);

        // Insert transcript into chat
        insertBtn.addEventListener('click', () => {
            if (currentTranscript) {
                this.insertTranscriptToChat(currentTranscript);
                closeModal();
            }
        });

        // Copy transcript
        copyBtn.addEventListener('click', () => {
            if (currentTranscript) {
                navigator.clipboard.writeText(currentTranscript).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy to clipboard';
                    }, 2000);
                });
            }
        });

        // Store reference for transcript display
        modal._currentTranscript = { value: '' };
        Object.defineProperty(modal._currentTranscript, 'value', {
            set: (v) => { currentTranscript = v; }
        });
    }

    /**
     * Transcribe audio within modal
     */
    async transcribeInModal(file, modal) {
        const uploadArea = modal.querySelector('#audioUploadAreaModal');
        const progressDiv = modal.querySelector('#transcriptionProgress');
        const resultDiv = modal.querySelector('#transcriptionResult');
        const errorDiv = modal.querySelector('#transcriptionError');
        const resultText = modal.querySelector('#resultText');
        const errorMsg = modal.querySelector('#errorMessage');
        const progressText = modal.querySelector('#progressText');
        const progressFill = modal.querySelector('#progressFill');

        // Validate
        const validation = this.audioTranscription.validateFile(file);
        if (!validation.valid) {
            errorMsg.textContent = validation.error;
            errorDiv.style.display = 'block';
            resultDiv.style.display = 'none';
            return;
        }

        uploadArea.style.display = 'none';
        progressDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        resultDiv.style.display = 'none';
        this.attachAudioButton.classList.add('processing');

        try {
            const result = await this.audioTranscription.transcribeFile(
                file,
                (message, percent) => {
                    progressText.textContent = message;
                    progressFill.style.width = percent + '%';
                }
            );

            progressDiv.style.display = 'none';
            resultText.textContent = result.transcript;
            resultDiv.style.display = 'block';
            modal._currentTranscript.value = result.transcript;

        } catch (error) {
            errorMsg.textContent = error.message;
            errorDiv.style.display = 'block';
            progressDiv.style.display = 'none';
            uploadArea.style.display = 'block';
        } finally {
            this.attachAudioButton.classList.remove('processing');
        }
    }

    /**
     * Insert transcript into chat input
     */
    insertTranscriptToChat(transcript) {
        const chatInput = this.chatContainer.querySelector('textarea') ||
                         this.chatContainer.querySelector('input[type="text"]') ||
                         this.chatContainer.querySelector('[contenteditable="true"]');

        if (chatInput) {
            if (chatInput.tagName === 'TEXTAREA' || chatInput.tagName === 'INPUT') {
                chatInput.value = transcript;
                chatInput.focus();
            } else {
                // ContentEditable div
                chatInput.textContent = transcript;
                chatInput.focus();
            }

            // Trigger input event so chat app knows input changed
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatWithAudioTranscription;
}
