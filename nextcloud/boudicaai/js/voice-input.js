/**
 * Voice Input Module
 * Handles speech recognition for voice input
 */

class VoiceInput {
    constructor(targetElement) {
        this.targetElement = targetElement;
        this.recognition = null;
        this.isListening = false;
        this.button = null;
        this.hasTranscript = false;  // Track if we received a transcript
        this.manualStop = false;  // Track if user manually stopped
        
        this.initializeRecognition();
    }

    /**
     * Initialize Speech Recognition
     */
    initializeRecognition() {
        // Check for browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.warn('Speech recognition not supported in this browser');
            return;
        }

        this.recognition = new SpeechRecognition();
        
        // Configure recognition
        this.recognition.continuous = false;  // Stop after one result
        this.recognition.interimResults = true;  // Show interim results
        this.recognition.lang = 'en-US';  // Default language
        this.recognition.maxAlternatives = 1;

        // Set up event handlers
        this.recognition.onstart = () => this.handleStart();
        this.recognition.onresult = (event) => this.handleResult(event);
        this.recognition.onerror = (event) => this.handleError(event);
        this.recognition.onend = () => this.handleEnd();
    }

    /**
     * Check if voice recognition is supported
     */
    isSupported() {
        return this.recognition !== null;
    }

    /**
     * Start listening
     */
    start(button) {
        if (!this.recognition) {
            alert('Voice recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
            return;
        }

        if (this.isListening) {
            // If already listening, stop
            this.manualStop = true;
            this.stop();
            return;
        }

        this.button = button;
        this.hasTranscript = false;  // Reset transcript flag
        this.manualStop = false;  // Reset manual stop flag
        
        try {
            this.recognition.start();
        } catch (error) {
            console.error('Error starting recognition:', error);
            this.updateButtonState('error');
            setTimeout(() => this.updateButtonState('idle'), 2000);
        }
    }

    /**
     * Stop listening
     */
    stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }

    /**
     * Handle recognition start
     */
    handleStart() {
        console.log('Voice recognition started');
        this.isListening = true;
        this.updateButtonState('listening');
    }

    /**
     * Handle recognition result
     */
    handleResult(event) {
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript;
        const isFinal = result.isFinal;

        console.log('Transcript:', transcript, 'Final:', isFinal);

        if (isFinal) {
            // Append the final transcript to the input
            const currentValue = this.targetElement.value;
            
            // Add space if there's existing text
            const separator = currentValue && !currentValue.endsWith(' ') ? ' ' : '';
            
            this.targetElement.value = currentValue + separator + transcript;
            
            // Trigger input event to update UI (char count, send button state, etc.)
            this.targetElement.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Focus the input
            this.targetElement.focus();
            
            // Mark that we have a transcript to send
            this.hasTranscript = true;
            
            // Update button state
            this.updateButtonState('processing');
        }
    }

    /**
     * Handle recognition error
     */
    handleError(event) {
        console.error('Voice recognition error:', event.error);
        
        // Reset transcript flags on error
        this.hasTranscript = false;
        this.manualStop = false;
        
        let errorMessage = 'Voice recognition error';
        
        switch(event.error) {
            case 'no-speech':
                errorMessage = 'No speech detected. Please try again.';
                break;
            case 'audio-capture':
                errorMessage = 'No microphone found or microphone access denied.';
                break;
            case 'not-allowed':
                errorMessage = 'Microphone access denied. Please allow microphone access.';
                break;
            case 'network':
                errorMessage = 'Network error occurred during voice recognition.';
                break;
            case 'aborted':
                // User stopped recording, not really an error
                return;
            default:
                errorMessage = `Voice recognition error: ${event.error}`;
        }

        // Show error temporarily
        if (this.button) {
            const originalTitle = this.button.title;
            this.button.title = errorMessage;
            setTimeout(() => {
                this.button.title = originalTitle;
            }, 3000);
        }
        
        this.updateButtonState('error');
    }

    /**
     * Handle recognition end
     */
    handleEnd() {
        console.log('Voice recognition ended');
        this.isListening = false;
        
        // If we received a transcript and it wasn't a manual stop, automatically submit
        if (this.hasTranscript && !this.manualStop && this.targetElement.value.trim()) {
            console.log('Auto-submitting voice input...');
            
            // Find and click the send button
            const sendBtn = document.getElementById('sendBtn');
            if (sendBtn && !sendBtn.disabled) {
                // Small delay to ensure UI is updated
                setTimeout(() => {
                    sendBtn.click();
                    this.updateButtonState('idle');
                }, 300);
            } else {
                // Reset button state if can't send
                setTimeout(() => {
                    this.updateButtonState('idle');
                }, 500);
            }
            
            // Reset flags
            this.hasTranscript = false;
            this.manualStop = false;
        } else {
            // Reset button state after a short delay
            setTimeout(() => {
                this.updateButtonState('idle');
            }, 500);
            
            // Reset flags
            this.hasTranscript = false;
            this.manualStop = false;
        }
    }

    /**
     * Update button visual state
     */
    updateButtonState(state) {
        if (!this.button) return;

        // Remove all state classes
        this.button.classList.remove('listening', 'processing', 'error');

        switch(state) {
            case 'listening':
                this.button.classList.add('listening');
                this.button.title = 'Listening... (click to stop)';
                break;
            case 'processing':
                this.button.classList.add('processing');
                this.button.title = 'Processing...';
                break;
            case 'error':
                this.button.classList.add('error');
                // Title will be set by error handler
                break;
            case 'idle':
            default:
                this.button.title = 'Voice input (speak and it will auto-send)';
                break;
        }
    }

    /**
     * Clean up
     */
    destroy() {
        if (this.recognition) {
            this.recognition.stop();
            this.recognition = null;
        }
    }
}

// Initialize voice input when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const chatInput = document.getElementById('chatInput');
    const voiceBtn = document.getElementById('voiceBtn');
    
    if (!chatInput || !voiceBtn) {
        console.warn('Voice input elements not found');
        return;
    }

    // Create voice input instance
    const voiceInput = new VoiceInput(chatInput);
    
    // Hide button if not supported
    if (!voiceInput.isSupported()) {
        voiceBtn.style.display = 'none';
        return;
    }

    // Attach click handler
    voiceBtn.addEventListener('click', () => {
        voiceInput.start(voiceBtn);
    });

    // Store instance globally for potential cleanup
    window.voiceInput = voiceInput;
});
