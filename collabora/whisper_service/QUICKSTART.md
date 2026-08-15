# Whisper Transcription Setup - Quick Start Guide

This guide walks you through setting up the completely sandboxed, local Whisper transcription service for Boudica AI.

## What You're Setting Up

✅ **Local Whisper Service** - Standalone Docker container  
✅ **PHP TranscriptionService** - Nextcloud integration  
✅ **TalkBotInvokeListener** - Automatic call transcription  

**No external APIs, no internet calls, 100% sandboxed.**

---

## Step 1: Build and Start Whisper Service

Navigate to the whisper_service directory:

```bash
cd /home/sibain/Boudica/collabora/whisper_service
```

Build and start the container (this will take 5-10 minutes the first time):

```bash
docker-compose up -d
```

**What this does:**
- Builds a Python Docker image with Whisper
- Downloads the "base" Whisper model (~140MB)
- Starts the service on port 5000
- Creates persistent volumes for models and uploads

Check the build progress:

```bash
docker logs -f nextcloud-whisper
```

Wait for this message:
```
* Running on http://0.0.0.0:5000
Whisper model loaded successfully
```

Then press `Ctrl+C` to exit logs.

---

## Step 2: Verify Service is Working

Test the health endpoint:

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{"status":"healthy","model":"base"}
```

Get service status:

```bash
curl http://localhost:5000/status
```

---

## Step 3: Configure Nextcloud

Tell Nextcloud where the Whisper service is:

```bash
docker exec -it nextcloud php occ config:app:set boudicaai whisper_service_url --value="http://nextcloud-whisper:5000"
```

Verify it was set:

```bash
docker exec -it nextcloud php occ config:app:get boudicaai whisper_service_url
```

Should output: `http://nextcloud-whisper:5000`

---

## Step 4: Test in Nextcloud Talk

1. Open Nextcloud Talk in your browser
2. Go to any conversation
3. **Upload an audio file** (`.wav`, `.mp3`, `.m4a`, `.ogg`, etc.) by:
   - Clicking the attachment button
   - Selecting an audio file
   - Sending it to the chat

4. Say in the chat:
```
@boudica transcribe this call
```

5. Wait for processing (time depends on file size and chosen model)

6. Then ask:
```
@boudica call summary
```

You should see the transcription!

---

## File Locations

- **Whisper Service**: `/home/sibain/Boudica/collabora/whisper_service/`
- **Docker Compose**: `/home/sibain/Boudica/collabora/whisper_service/docker-compose.yml`
- **PHP Service**: `/home/sibain/Boudica/collabora/nextcloud/boudicaai/lib/Service/TranscriptionService.php`
- **PHP Listener Updates**: `/home/sibain/Boudica/collabora/nextcloud/boudicaai/lib/Listener/TalkBotInvokeListener.php`

---

## Supported Audio Formats

- WAV (.wav) - ✅
- MP3 (.mp3) - ✅
- M4A (.m4a) - ✅
- OGG (.ogg) - ✅
- FLAC (.flac) - ✅
- AAC (.aac) - ✅
- WebM (.webm) - ✅
- Opus (.opus) - ✅

---

## Performance Tuning

### Whisper Models

The default "base" model is balanced for speed and accuracy. Options:

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| tiny | 39MB | ⚡⚡⚡ Fastest | Fair |
| **base** | 140MB | ⚡⚡ Good | **Good (default)** |
| small | 466MB | ⚡ Moderate | Very Good |
| medium | 1.5GB | 🐢 Slow | Excellent |
| large | 2.9GB | 🐢🐢 Very Slow | Best |

To change the model, edit `/home/sibain/Boudica/collabora/whisper_service/docker-compose.yml`:

```yaml
environment:
  - WHISPER_MODEL=small  # Change to: tiny, base, small, medium, large
```

Then rebuild:

```bash
cd /home/sibain/Boudica/collabora/whisper_service
docker-compose down
docker-compose up -d
```

### GPU Acceleration (NVIDIA)

If you have an NVIDIA GPU:

1. Install NVIDIA Docker runtime: https://github.com/NVIDIA/nvidia-docker

2. Edit `/home/sibain/Boudica/collabora/whisper_service/docker-compose.yml`:

```yaml
services:
  whisper-transcription:
    runtime: nvidia
    environment:
      - CUDA_VISIBLE_DEVICES=0
```

3. Rebuild:

```bash
docker-compose down
docker-compose up -d
```

GPU acceleration can make transcription **10-100x faster**.

---

## Monitoring

### View Logs

```bash
docker logs nextcloud-whisper
```

### Watch Real-time Logs

```bash
docker logs -f nextcloud-whisper
```

### Check Container Status

```bash
docker ps | grep whisper
```

### Container Resource Usage

```bash
docker stats nextcloud-whisper
```

---

## Troubleshooting

### Service won't start

Check the logs:
```bash
docker logs nextcloud-whisper
```

Common issues:
- **"Out of memory"** - Reduce model size (use "tiny")
- **"Port 5000 already in use"** - Change port in docker-compose.yml
- **"Model download failed"** - Check internet connection (first build only)

### Transcription fails

1. Verify service is running:
```bash
curl http://localhost:5000/health
```

2. Check Nextcloud can reach it:
```bash
docker exec nextcloud curl http://nextcloud-whisper:5000/health
```

3. Look at Nextcloud logs:
```bash
docker logs nextcloud
```

### Slow transcription

- Use smaller model (tiny/base instead of medium/large)
- Enable GPU if available
- Check disk I/O: `docker stats nextcloud-whisper`

### High CPU/Memory Usage

- Reduce model size
- Set CPU limits in docker-compose.yml:
```yaml
services:
  whisper-transcription:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

---

## Maintenance

### Restart Service

```bash
docker-compose -f /home/sibain/Boudica/collabora/whisper_service/docker-compose.yml restart
```

### Stop Service

```bash
cd /home/sibain/Boudica/collabora/whisper_service
docker-compose down
```

### Cleanup Old Models (free disk space)

```bash
docker volume ls | grep whisper
docker volume rm whisper_service_whisper_models
```

This will delete downloaded models (they'll be re-downloaded on next start).

### Update to Latest Whisper

```bash
cd /home/sibain/Boudica/collabora/whisper_service
docker-compose down
docker rmi nextcloud-whisper
docker-compose up -d
```

---

## Database Migrations

When you run Nextcloud, it will automatically apply migrations:

```bash
docker exec nextcloud php occ upgrade
```

This creates/updates:
- `boudicaai_call_transcripts` table
- File tracking columns
- Transcription status tracking

---

## Security Notes

✅ **Everything is local** - No internet calls, no API keys  
✅ **No data leakage** - Audio stays in Docker container  
✅ **Internal network** - Service only accessible within Docker  
✅ **No logging** - Audio files not logged or monitored  

⚠️ **Important**: Do NOT expose port 5000 to the internet. This service should only be accessible internally.

---

## Next Steps

1. ✅ Whisper service is running locally
2. ✅ Nextcloud is configured to use it
3. ✅ TalkBotInvokeListener will transcribe calls automatically
4. Test with: `@boudica transcribe this call`

Then:
- Upload call recordings to Talk
- Boudica will transcribe them automatically
- Summarize with: `@boudica call summary`
- Track important sessions with: `@boudica track this chat`

---

## Questions?

Check the detailed README:
```bash
cat /home/sibain/Boudica/collabora/whisper_service/README.md
```

View service logs:
```bash
docker logs -f nextcloud-whisper
```

Test the API directly:
```bash
curl -F "audio=@yourfile.wav" http://localhost:5000/transcribe
```
