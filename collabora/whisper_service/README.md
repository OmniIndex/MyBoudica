# Local Whisper Transcription Service

A self-hosted, sandboxed speech-to-text service for Boudica AI's Nextcloud Talk integration.

## Features

✅ **100% Local** - No external API calls, all processing on your infrastructure  
✅ **Privacy** - Audio files never leave your network  
✅ **Open Source** - Uses OpenAI's Whisper model  
✅ **Multi-language** - Supports 99+ languages  
✅ **REST API** - Simple HTTP endpoints for transcription  
✅ **Multiple Models** - tiny, base, small, medium, large (quality vs speed)

## Quick Start

### 1. Build and Start the Service

```bash
cd /home/sibain/Boudica/collabora/whisper_service
docker-compose up -d
```

This will:
- Build the Whisper Docker image
- Start the service on port 5000
- Download the "base" model (~140MB, ~10 min accuracy)
- Create persistent volumes for models and uploads

### 2. Verify Service is Running

```bash
docker logs nextcloud-whisper
```

Look for: `* Running on http://0.0.0.0:5000`

Test health:
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{"status":"healthy","model":"base"}
```

### 3. Configure Nextcloud App

Go to Nextcloud **Admin Settings** → **Boudica AI** → **Transcription**:
- **Whisper Service URL**: `http://nextcloud-whisper:5000`
- Save

Or set via command line:
```bash
docker exec -it nextcloud php occ config:app:set boudicaai whisper_service_url --value="http://nextcloud-whisper:5000"
```

### 4. Test Transcription in Talk

1. Upload an audio file (`.wav`, `.mp3`, `.m4a`, etc.) to a Talk chat
2. Say: `@boudica transcribe this call`
3. Wait for processing
4. Say: `@boudica call summary` to see results

## Supported Audio Formats

- ✅ WAV (.wav)
- ✅ MP3 (.mp3)
- ✅ M4A (.m4a)
- ✅ OGG (.ogg)
- ✅ FLAC (.flac)
- ✅ AAC (.aac)
- ✅ WebM (.webm)
- ✅ Opus (.opus)

## Model Selection

Choose based on your needs:

| Model | Size | Speed | Accuracy | Use Case |
|-------|------|-------|----------|----------|
| **tiny** | 39MB | ⚡⚡⚡ Fast | Fair | Real-time, low-resource |
| **base** | 140MB | ⚡⚡ Good | Good | **Recommended** |
| **small** | 466MB | ⚡ Moderate | Very Good | High accuracy needed |
| **medium** | 1.5GB | 🐢 Slow | Excellent | Maximum accuracy |
| **large** | 2.9GB | 🐢🐢 Very Slow | Best | Production use |

### Change Model

Edit `docker-compose.yml`:
```yaml
environment:
  - WHISPER_MODEL=small  # Change this
```

Then rebuild:
```bash
docker-compose down
docker-compose up -d
```

## API Endpoints

### `/health` - Health Check
```bash
curl http://localhost:5000/health
```

### `/transcribe` - Transcribe Audio
```bash
curl -F "audio=@call.wav" http://localhost:5000/transcribe
```

Response:
```json
{
  "status": "success",
  "transcript": "Hello, this is a test transcription...",
  "language": "en",
  "file_id": "abc123...",
  "segments": 5
}
```

### `/transcribe/segments` - Transcribe with Timestamps
```bash
curl -F "audio=@call.wav" http://localhost:5000/transcribe/segments
```

Returns detailed segments with start/end times and confidence.

### `/status` - Service Status
```bash
curl http://localhost:5000/status
```

### `/models` - Available Models
```bash
curl http://localhost:5000/models
```

## Performance Tips

### GPU Acceleration (NVIDIA)

If you have an NVIDIA GPU, modify `Dockerfile`:

```dockerfile
RUN pip install torch==2.0.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

And update `docker-compose.yml`:
```yaml
services:
  whisper-transcription:
    runtime: nvidia
    environment:
      - CUDA_VISIBLE_DEVICES=0
```

### Reduce Model Size on Low-Resource Systems

Use the "tiny" model:
```yaml
environment:
  - WHISPER_MODEL=tiny
```

### Adjust Timeout for Large Files

Edit `TranscriptionService.php`:
```php
$this->httpClient = new Client(['timeout' => 600]); // Increase from 600
```

## Troubleshooting

### Service won't start
```bash
docker logs nextcloud-whisper
docker inspect nextcloud-whisper
```

### Connection refused from Nextcloud
Verify the URL is correct:
```bash
docker exec nextcloud-whisper curl http://localhost:5000/health
docker exec nextcloud curl http://nextcloud-whisper:5000/health
```

### Out of memory
Reduce model size or add swap:
```bash
docker update --memory=4g nextcloud-whisper
```

### Slow transcription
- Use smaller model (tiny/base)
- Enable GPU if available
- Check disk I/O

## Networking

The Whisper service runs on the default Docker `bridge` network, the same as your Nextcloud container.

**Internal communication** (Nextcloud → Whisper):
- `http://nextcloud-whisper:5000`
- No external proxy needed

**External access** (not recommended):
- The service listens on `0.0.0.0:5000`
- Do NOT expose to the internet
- Transcription files would be uploaded externally

## Storage

Volumes:
- `whisper_models` - Downloaded Whisper models (~140MB-3GB depending on model)
- `whisper_uploads` - Temporary audio files (auto-cleaned after transcription)

To clean up:
```bash
docker volume prune
```

## Maintenance

### Check Logs
```bash
docker logs -f nextcloud-whisper
```

### Restart Service
```bash
docker-compose restart whisper-transcription
```

### Update to Latest Whisper
```bash
docker-compose down
docker rmi nextcloud-whisper:latest
docker-compose up -d --build
```

## Security Considerations

✅ **Sandboxed** - Runs in isolated container  
✅ **No internet** - No external API calls  
✅ **No credentials** - No API keys stored  
✅ **Data stays local** - Audio files in container only  
✅ **Temporary files** - Auto-cleaned after processing

⚠️ **Not exposed externally** - Service only accessible on internal Docker network

## Integration with Boudica

The `TranscriptionService` PHP class in Nextcloud:

```php
// Transcribe a file
$transcript = $this->transcriptionService->transcribeFile('/path/to/audio.wav');

// With language hint
$transcript = $this->transcriptionService->transcribeFile('/path/to/audio.wav', 'en');

// Get detailed segments with timestamps
$result = $this->transcriptionService->transcribeFileWithSegments('/path/to/audio.wav');
```

The TalkBotInvokeListener automatically:
1. Detects uploaded audio files
2. Triggers transcription on demand
3. Stores results in database
4. Makes transcripts available for summarization

## Language Support

Specify language with ISO-639-1 codes:
- `en` - English
- `de` - German
- `fr` - French
- `es` - Spanish
- `it` - Italian
- etc. (99+ languages supported)

Example:
```bash
curl -F "audio=@call.wav" -F "language=de" http://localhost:5000/transcribe
```

## Development

Modify `whisper_service/whisper_service.py` to:
- Add custom preprocessing
- Implement voice activity detection
- Add speaker diarization
- Integrate with other tools

Then rebuild:
```bash
docker-compose up -d --build
```

## License

- **Whisper** - MIT (OpenAI)
- **Boudica integration** - See parent project
