# Audio Transcription - Quick Start Guide

**5-minute integration of audio transcription into your Boudica app**

## Prerequisites
- Whisper microservice running on `http://localhost:5000` (or accessible URL)
- HTML template file to add scripts to
- Basic JavaScript knowledge

## Option 1: Add Audio Panel to Any Page (30 seconds)

### 1. Add HTML Container
```html
<div id="audioPanel"></div>
```

### 2. Add Script Tags
```html
<script src="js/audio-transcription.js"></script>
<script src="js/audio-upload-ui.js"></script>
```

### 3. Initialize
```html
<script>
    const audio = new AudioTranscription();
    const ui = new AudioUploadUI('audioPanel', audio);
</script>
```

**Result:** Complete drag-and-drop audio upload interface appears on your page.

---

## Option 2: Add Microphone Button to Chat (45 seconds)

### 1. Add Script Tags
```html
<script src="js/audio-transcription.js"></script>
<script src="js/chat-audio-integration.js"></script>
```

### 2. Initialize
```html
<script>
    const audio = new AudioTranscription();
    new ChatWithAudioTranscription('chatContainerID', audio);
</script>
```

**Result:** Microphone button appears in chat toolbar. Click to upload and transcribe audio, insert into chat.

---

## Option 3: Use Talk Bot (Already Works!)

### In any Talk room:
```
@boudica transcribe
```

**What happens:**
1. Bot finds recent audio recordings in the room
2. Transcribes them via Whisper service
3. Emails transcript to all room participants
4. Shows confirmation in the chat

---

## Verify Whisper Service is Running

```bash
# Check if container is running
docker ps | grep whisper

# Test service
curl http://localhost:5000/health

# Should see: {"status":"healthy"}
```

---

## Custom Whisper Service URL

If your Whisper service isn't on localhost:5000:

```javascript
const audio = new AudioTranscription('https://your-server.com:5000');
```

Or change after creation:
```javascript
audio.setServiceUrl('https://your-server.com:5000');
```

---

## Test Live Demo

Open in browser:
```
AUDIO_TRANSCRIPTION_DEMO.html
```

This demonstrates all three integration methods with a working example.

---

## Troubleshooting

### "Whisper service is not available"
```bash
# 1. Check container
docker ps | grep whisper

# 2. Restart if needed
docker restart nextcloud-whisper

# 3. Test health
curl http://localhost:5000/health
```

### JavaScript not loading
- Check browser console (F12)
- Verify script paths are correct
- Ensure files are in `/nextcloud/boudicaai/js/`

### Transcription stuck
- Check server CPU/memory: `docker stats`
- Try smaller audio file
- Check browser console for network errors

---

## Next Steps

1. **For details:** Read `AUDIO_TRANSCRIPTION_INTEGRATION.md`
2. **For architecture:** Read `AUDIO_TRANSCRIPTION_SYSTEM.md`
3. **For examples:** Open `AUDIO_TRANSCRIPTION_DEMO.html`
4. **For Talk Bot:** See `AUTOMATIC_TRANSCRIPTION_GUIDE.md`

---

## All JavaScript Methods

### AudioTranscription Class
```javascript
const audio = new AudioTranscription(serviceUrl);

// Main methods
await audio.transcribeFile(file, onProgress, language);
await audio.transcribeFileWithSegments(file, onProgress, language);
audio.validateFile(file);
await audio.isServiceAvailable();

// Configuration
audio.setServiceUrl(url);
audio.setMaxFileSize(mb);

// Info
audio.getSupportedFormats();
await audio.getServiceInfo();
await audio.getAvailableModels();

// Caching
audio.getTranscription(fileId);
audio.getUploadStatus(fileId);
audio.clearCache(fileId);
audio.clearAllCache();
```

### AudioUploadUI Class
```javascript
const ui = new AudioUploadUI(containerId, audioTranscription);

// Methods
ui.transcribeFile();
ui.showError(message);
ui.clearError();
ui.clear();
```

### ChatWithAudioTranscription Class
```javascript
const chat = new ChatWithAudioTranscription(chatContainerId, audioTranscription);

// Just initialize - rest is automatic
```

---

## Supported Audio Formats

✓ WAV • MP3 • M4A • OGG • FLAC • AAC • WebM • Opus

Maximum file size: 500MB (configurable)

---

## Performance Expectations

- **Upload:** Fast (depends on connection)
- **Transcription:** 30 seconds to 2 minutes for 5-minute audio
- **Language:** Auto-detects or specify with language code
- **Quality:** ~94% accuracy for clear audio

---

## Common Customizations

### Change max file size
```javascript
audio.setMaxFileSize(1000); // 1GB
```

### Specify language
```javascript
await audio.transcribeFile(file, onProgress, 'es'); // Spanish
```

### Get detailed segments
```javascript
const result = await audio.transcribeFileWithSegments(file);
// result.segments contains timing info
```

### Custom progress handling
```javascript
await audio.transcribeFile(file, (message, percent) => {
    console.log(`${message} - ${percent}%`);
    myProgressBar.style.width = percent + '%';
});
```

---

## Production Checklist

- [ ] Whisper service running and healthy
- [ ] Script files in `/nextcloud/boudicaai/js/`
- [ ] Script tags added to HTML template
- [ ] Initialization code added
- [ ] Tested with demo page
- [ ] Tested with real audio file
- [ ] Service URL verified (localhost vs remote)
- [ ] File size limit appropriate
- [ ] Error handling tested
- [ ] Mobile display tested

---

**That's it! You now have audio transcription integrated into your Boudica app.**

For questions, see the full documentation in:
- `AUDIO_TRANSCRIPTION_INTEGRATION.md` (API reference)
- `AUDIO_TRANSCRIPTION_SYSTEM.md` (Full system overview)
- `AUDIO_TRANSCRIPTION_DEMO.html` (Working examples)
