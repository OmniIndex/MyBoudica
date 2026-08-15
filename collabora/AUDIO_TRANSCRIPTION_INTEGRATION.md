# Audio Transcription Integration Guide

This guide explains how to integrate the new audio transcription features into the Boudica main app.

## Overview

The audio transcription system consists of two main modules:

1. **AudioTranscription** (`audio-transcription.js`) - Core service that handles file validation and communication with the Whisper microservice
2. **AudioUploadUI** (`audio-upload-ui.js`) - UI component that provides file upload interface and displays transcription results

## Installation

### 1. Add Script Tags to HTML

Add these script tags to your HTML template (usually `templates/index.php` or `templates/admin.php`):

```html
<!-- Audio Transcription Modules -->
<script src="<?php echo \OCP\Util::linkTo('boudicaai', 'js/audio-transcription.js'); ?>"></script>
<script src="<?php echo \OCP\Util::linkTo('boudicaai', 'js/audio-upload-ui.js'); ?>"></script>
```

### 2. Create Container in HTML

Add a container element where you want the audio upload UI to appear:

```html
<div id="audioTranscriptionContainer"></div>
```

## Usage

### Initialize the Audio Transcription Service

```javascript
// Create instance of the transcription service
// Default: connects to http://localhost:5000
const audioTranscription = new AudioTranscription();

// Or specify a custom Whisper service URL
const audioTranscription = new AudioTranscription('https://your-whisper-service.com:5000');

// Check if service is available
audioTranscription.isServiceAvailable().then(available => {
    if (available) {
        console.log('Whisper service is ready');
    } else {
        console.log('Whisper service is not available');
    }
});
```

### Initialize the UI

```javascript
// Create UI component - attaches to the container
const audioUI = new AudioUploadUI('audioTranscriptionContainer', audioTranscription);
```

### Complete Integration Example

```html
<div id="audioTranscriptionContainer"></div>

<script>
    // Initialize audio transcription service
    const audioTranscription = new AudioTranscription('http://localhost:5000');
    
    // Initialize UI when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        const audioUI = new AudioUploadUI('audioTranscriptionContainer', audioTranscription);
    });
</script>
```

## Programmatic Usage (Without UI)

If you want to use the transcription service without the built-in UI:

```javascript
const audioTranscription = new AudioTranscription();

// Get file from input
const fileInput = document.getElementById('myAudioInput');
const file = fileInput.files[0];

// Transcribe with progress callback
try {
    const result = await audioTranscription.transcribeFile(
        file,
        (message, percent) => {
            console.log(`${message} - ${percent}%`);
        },
        'en' // Optional: language code
    );
    
    console.log('Transcript:', result.transcript);
    console.log('Language:', result.language);
    console.log('File ID:', result.file_id);
    
} catch (error) {
    console.error('Transcription failed:', error.message);
}
```

## API Reference

### AudioTranscription Class

#### Methods

**`isServiceAvailable(): Promise<boolean>`**
- Check if Whisper service is reachable
- Returns: Promise that resolves to boolean

**`validateFile(file: File): { valid: boolean, error: string | null }`**
- Validate audio file before upload
- Checks: file type, file size
- Returns: validation result object

**`transcribeFile(file: File, onProgress?: Function, language?: string): Promise<Object>`**
- Upload and transcribe an audio file
- Parameters:
  - `file`: Audio File object
  - `onProgress`: Optional callback function(message: string, percent: number)
  - `language`: Optional ISO 639-1 language code (e.g., 'en', 'es', 'fr')
- Returns: Promise resolving to:
  ```javascript
  {
    status: 'success',
    transcript: string,
    language: string,
    file_id: string,
    segments: Array | null
  }
  ```

**`transcribeFileWithSegments(file: File, onProgress?: Function, language?: string): Promise<Object>`**
- Transcribe with detailed segment information
- Returns: Same as `transcribeFile` but with populated `segments` array containing timing information

**`getServiceInfo(): Promise<Object>`**
- Get information about the Whisper service
- Returns: Service status and configuration

**`getAvailableModels(): Promise<Array>`**
- Get list of available Whisper models
- Returns: Array of model names

**`getTranscription(fileId: string): Object | null`**
- Retrieve cached transcription result
- Parameters: `fileId` returned from `transcribeFile()`
- Returns: Cached result or null if not found

**`getSupportedFormats(): string[]`**
- Get array of supported audio formats
- Returns: ['wav', 'mp3', 'm4a', 'ogg', 'flac', 'aac', 'webm', 'opus']

**`setServiceUrl(url: string): void`**
- Update Whisper service URL at runtime

**`setMaxFileSize(mb: number): void`**
- Update maximum file size limit (default: 500MB)

**`clearCache(fileId: string): void`**
- Remove cached result for a specific file

**`clearAllCache(): void`**
- Clear all cached results

### AudioUploadUI Class

#### Constructor
```javascript
new AudioUploadUI(containerId: string, audioTranscription: AudioTranscription)
```

#### Methods

**`transcribeFile(): Promise<void>`**
- Programmatically trigger transcription of currently selected file

**`clear(): void`**
- Clear all UI state and selected file

**`showError(message: string): void`**
- Display an error message to the user

**`clearError(): void`**
- Hide the error message

## Configuration

### Whisper Service URL

By default, the service expects Whisper to run on `http://localhost:5000`. You can change this:

```javascript
// During initialization
const audioTranscription = new AudioTranscription('https://your-domain.com:5000');

// Or after creation
audioTranscription.setServiceUrl('https://your-domain.com:5000');
```

### Maximum File Size

Default is 500MB. To change:

```javascript
audioTranscription.setMaxFileSize(1000); // 1000MB
```

### Supported Audio Formats

- WAV
- MP3
- M4A
- OGG
- FLAC
- AAC
- WebM
- Opus

## Whisper Service Setup

The Whisper microservice should be running at the specified URL with these endpoints:

### Endpoints

**GET `/health`**
- Health check endpoint
- Returns: `{ status: "healthy" }`

**POST `/transcribe`**
- Transcribe audio file
- Body: FormData with `audio` file and optional `language`
- Returns: `{ status: "success", transcript: string, language: string }`

**POST `/transcribe/segments`**
- Transcribe with segment information
- Body: FormData with `audio` file and optional `language`
- Returns: `{ status: "success", transcript: string, segments: [...], language: string }`

**GET `/status`**
- Get service status
- Returns: Service information object

**GET `/models`**
- Get available models
- Returns: Array of model names

## Integration with Talk Bot

When used with Talk Bot for call transcriptions, the flow is:

1. Audio file uploaded to Talk room
2. TalkBotInvokeListener captures call participants
3. User says `@boudica transcribe`
4. Bot calls `audioTranscription.transcribeFile()`
5. Transcript stored in database
6. Email sent to participants

See `AUTOMATIC_TRANSCRIPTION_GUIDE.md` for details.

## Error Handling

```javascript
try {
    const result = await audioTranscription.transcribeFile(file);
    console.log('Success:', result.transcript);
} catch (error) {
    // Error types:
    // - "Unsupported format: X" - Invalid file type
    // - "File too large: X MB" - File exceeds size limit
    // - "Whisper transcription service is not available" - Service offline
    // - "Transcription failed: X" - Processing error
    
    console.error('Error:', error.message);
}
```

## Browser Support

- Requires modern browser with Fetch API support
- Tested on Chrome, Firefox, Safari, Edge (last 2 versions)

## Performance Notes

- Upload speed depends on file size and network connection
- Transcription speed depends on:
  - Audio duration (typically real-time to 2x real-time for base model)
  - Whisper model size (base, small, medium, large)
  - Available CPU/GPU resources
- Typical 5-minute audio file: 30 seconds to 2 minutes processing time

## Example: Chat Integration

```javascript
// Add transcription UI to chat panel
const audioTranscription = new AudioTranscription('http://localhost:5000');
const audioUI = new AudioUploadUI('chatAudioSection', audioTranscription);

// Listen for transcription completion and insert into chat
document.addEventListener('transcriptionComplete', (e) => {
    const { transcript } = e.detail;
    document.getElementById('chatInput').value = transcript;
    document.getElementById('chatInput').focus();
});
```

## Troubleshooting

### "Whisper service is not available"
- Check if Whisper container is running: `docker ps | grep whisper`
- Check service health: `curl http://localhost:5000/health`
- Verify network connectivity to service URL

### "Unsupported format" error
- Ensure file extension matches one of: wav, mp3, m4a, ogg, flac, aac, webm, opus
- Some browsers may have additional codec requirements

### "File too large" error
- Default limit is 500MB
- Compress audio or split into smaller files
- Increase limit: `audioTranscription.setMaxFileSize(1000)`

### Slow transcription
- Check Whisper model size (base is fastest)
- Monitor server CPU/memory usage
- Consider using GPU acceleration if available
