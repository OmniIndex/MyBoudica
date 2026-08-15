# Automatic Call Transcription & Email Notifications

Complete guide to the automatic call transcription system with participant email notifications.

## Overview

When users upload audio files to Nextcloud Talk:
1. **Participants are automatically captured** - Room members stored in database
2. **Transcription is triggered** - Either manually via `@boudica transcribe` or automatically via cron
3. **Participants are emailed** - HTML email with full transcript sent to all call attendees

## Quick Start

### Prerequisites
- Nextcloud 20+ with Talk app enabled
- Whisper microservice running (`docker-compose up -d` in `/root/whisper_service/`)
- Nextcloud configured with SMTP for email notifications
- Boudica app installed with latest migrations

### Enable Automatic Transcription

1. **Run database migrations:**
   ```bash
   docker exec nextcloud php occ upgrade
   ```
   This creates `boudicaai_call_participants` table and adds email tracking columns to `boudicaai_call_transcripts`.

2. **Set up scheduled cron job:**

   **Option A: System crontab (recommended)**
   ```bash
   # Add to crontab -e
   */5 * * * * docker exec nextcloud php occ boudicaai:transcribe-calls >> /var/log/transcribe-calls.log 2>&1
   ```
   This runs transcription check every 5 minutes.

   **Option B: Nextcloud cron settings**
   - Admin Panel → Settings → Cron Settings
   - Set cron mode to "Cron (recommended)"
   - Nextcloud's built-in cron will execute the command

### Configure Email

Nextcloud must have SMTP configured. Set up in Nextcloud admin panel:

**Admin Panel → Settings → Email Settings**
```
Mail Server: [your-smtp-host]
Port: 587 or 465
Encryption: TLS or SSL
Username: [your-email]
Password: [your-password]
"From" Address: transcripts@boudica.local (or your domain)
```

## How It Works

### Workflow 1: Manual Transcription (User-Triggered)

```
User uploads audio file
↓
TalkBotInvokeListener detects audio file
↓
Participants captured & stored in DB
↓
User says "@boudica transcribe this call"
↓
Whisper service transcribes audio
↓
Transcript stored in database
↓
Email automatically sent to all participants
↓
email_sent_at timestamp recorded
```

### Workflow 2: Automatic Transcription (Background Job)

```
Audio file uploaded, waiting for transcription
↓
Cron job runs: php occ boudicaai:transcribe-calls
↓
Command finds all pending calls (status='pending')
↓
For each call:
  - Transcribe via Whisper
  - Store transcript in database
  - Email all participants
  - Update email_sent_at timestamp
↓
Up to 10 calls processed per run
```

## Database Schema

### `boudicaai_call_participants`
Tracks who was in the room when recording started.

```sql
CREATE TABLE boudicaai_call_participants (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  call_transcript_id BIGINT NOT NULL,  -- Foreign key to call_transcripts
  participant_user_id VARCHAR(255),    -- Nextcloud user ID
  participant_display_name VARCHAR(255), -- User's display name
  participant_email VARCHAR(255),      -- User's email (may be NULL for guests)
  joined_at INT,                       -- Timestamp when participant joined
  left_at INT,                         -- Timestamp when participant left (NULL if still in call)
  
  INDEX(call_transcript_id),
  INDEX(participant_user_id)
);
```

### Enhanced `boudicaai_call_transcripts` Columns

| Column | Type | Purpose |
|--------|------|---------|
| `participants_captured` | BOOLEAN | Whether participants list was captured |
| `email_sent_at` | INT (timestamp) | When transcript email was sent |
| `email_recipients` | TEXT | Comma-separated email list that was notified |

## Usage Examples

### Example 1: Manual Transcription in Talk

1. **Upload audio to Talk room**
   - Click file/media button in Talk
   - Select audio file (WAV, MP3, M4A, OGG, FLAC, AAC, WebM, Opus)
   - Send message

2. **Ask bot to transcribe**
   ```
   @boudica transcribe this call
   ```

3. **Wait for processing**
   - Bot responds: "🎤 Processing transcription of: audio.wav..."
   - Transcription may take 30 seconds to 2 minutes depending on file size

4. **Participants receive email**
   - All room members get HTML email with transcript
   - Email includes call date, duration, participant count
   - Full transcript text in email body

### Example 2: Monitor Automatic Transcription

Check logs:
```bash
# Watch cron job execution
tail -f /var/log/transcribe-calls.log

# Manual test run
docker exec nextcloud php occ boudicaai:transcribe-calls
```

Output shows:
```
Starting automatic call transcription process...
Found 2 pending calls to transcribe
Processing: meeting-2026-08-05.wav
✓ Transcribed successfully
Processing: call-with-john.m4a
✓ Transcribed successfully

Completed: 2 transcribed, 0 failed
```

### Example 3: Query Results

Check that participants were captured:
```bash
# See participants for a specific call
docker exec nextcloud mysql boudicaai -e \
  "SELECT participant_display_name, participant_email FROM oc_boudicaai_call_participants WHERE call_transcript_id = 1;"
```

Output:
```
+--------------------------+---------------------+
| participant_display_name | participant_email   |
+--------------------------+---------------------+
| Alice Smith              | alice@example.com   |
| Bob Johnson              | bob@example.com     |
| Carol White              | carol@example.com   |
+--------------------------+---------------------+
```

Check email was sent:
```bash
docker exec nextcloud mysql boudicaai -e \
  "SELECT file_name, email_sent_at, email_recipients FROM oc_boudicaai_call_transcripts WHERE id = 1;"
```

Output:
```
+-----------+---------------------------+-----------------------------------------+
| file_name | email_sent_at             | email_recipients                        |
+-----------+---------------------------+-----------------------------------------+
| call.wav  | 1722876543 (2026-08-05)   | alice@example.com,bob@example.com,...   |
+-----------+---------------------------+-----------------------------------------+
```

## Troubleshooting

### "No email recipients found for call"
**Cause**: No participants were captured when audio was uploaded
**Fix**: 
- Ensure audio file was uploaded while participants were in the room
- Check `boudicaai_call_participants` table is populated
- Verify Talk room has active members

### "Transcription service unavailable"
**Cause**: Whisper microservice not running
**Fix**:
```bash
# Check if container is running
docker ps | grep nextcloud-whisper

# Start if needed
cd /root/whisper_service/
docker-compose up -d

# Test health
curl http://localhost:5000/health
```

### "SMTP error - Failed to send email"
**Cause**: Nextcloud email not configured or SMTP unreachable
**Fix**:
- Admin Panel → Settings → Email Settings
- Test SMTP connection
- Check firewall allows port 587/465
- Verify credentials

### "Could not find a version that satisfies the requirement openai-whisper"
**Cause**: Wrong Whisper version in Dockerfile
**Fix**: Use version 20231117 (confirmed working)
```bash
# Edit Dockerfile
nano /home/sibain/Boudica/collabora/whisper_service/Dockerfile

# Change this line:
# FROM line with openai-whisper==20231117

# Rebuild
docker-compose down && docker rmi nextcloud-whisper && docker-compose up -d --build
```

### Email not sent despite "Completed" status
**Cause 1**: Participant has no email address
- Check `participant_email` column - may be NULL for guests
- Only users with email addresses receive notifications

**Cause 2**: SMTP configured but not working
```bash
# Test email manually
docker exec nextcloud php -r "
\$mailer = \OC::$server->getMailer();
\$msg = \$mailer->createMessage();
\$msg->setTo(['test@example.com']);
\$msg->setSubject('Test');
\$msg->setPlainTextBody('Test email');
\$mailer->send(\$msg);
echo 'Email sent';
"
```

## Advanced Configuration

### Change Cron Interval
To check for pending calls every 10 minutes instead of 5:

```bash
# In system crontab
*/10 * * * * docker exec nextcloud php occ boudicaai:transcribe-calls
```

### Limit Processed Calls Per Run
Default is 10 calls per run. To process more/fewer, edit `TranscribeCallsCommand.php`:
```php
// Line with setMaxResults(10)
->setMaxResults(5);  // Process only 5 calls per run
```

### Send AI-Summarized Transcripts Instead of Raw Text

Modify `TranscribeCallsCommand.php` to feed transcript through Boudica:

```php
// After transcription, before email:
$summary = $this->boudicaService->ask(
    "Summarize this call transcript concisely:\n\n" . $transcript,
    $callId . '-summary'
);
$this->sendTranscriptEmailToParticipants($callId, $fileName, $summary, $call['call_started_at']);
```

This sends an AI-generated summary instead of raw transcript.

### Change Email Sender Name/Address

Edit `TranscriptEmailService.php`:
```php
// In constructor
$this->fromAddress = 'noreply@your-domain.com';
$this->fromName = 'Your Company Transcription Service';
```

Or set in Nextcloud admin settings (Settings → Email Settings).

## Console Commands

### Run Transcription Job Manually
```bash
docker exec nextcloud php occ boudicaai:transcribe-calls
```

**Options:**
```
--help              Show help message
```

**Output:**
```
Starting automatic call transcription process...
Found X pending calls to transcribe
Processing: filename.wav
✓ Transcribed successfully
...
Completed: X transcribed, Y failed
```

### View Pending Calls
```bash
docker exec nextcloud mysql boudicaai -e \
  "SELECT id, file_name, transcription_status FROM oc_boudicaai_call_transcripts WHERE transcription_status='pending';"
```

### Clear Failed Transcriptions (retry)
```bash
docker exec nextcloud mysql boudicaai -e \
  "UPDATE oc_boudicaai_call_transcripts SET transcription_status='pending' WHERE transcription_status='failed';"
```

## Email Template

Participants receive HTML email formatted like:

```
Subject: Call Transcript: meeting-2026-08-05.wav - Tuesday, August 5, 2026 at 2:30 PM

---

Call Transcript

Room: meeting-2026-08-05.wav
Date & Time: Tuesday, August 5, 2026 at 2:30 PM
Participants: 3

---

Transcript

[Full transcript text here...]

---

This transcript was automatically generated by Boudica AI.
Nextcloud Instance: boudi.ca
```

## Performance Notes

- **Transcription speed**: Depends on Whisper model and file size
  - Base model (140MB): ~30 seconds per 5 min audio
  - Small model (466MB): ~15 seconds per 5 min audio
- **Email sending**: Usually instant if SMTP is configured
- **Database queries**: Minimal overhead, indexes on call_transcript_id and participant_user_id
- **Cron job resource use**: Low - processes 10 files sequentially

## Support

For issues or questions:
1. Check logs: `/var/log/transcribe-calls.log`
2. Check Nextcloud logs: `docker logs nextcloud | grep boudicaai`
3. Check database for pending/failed calls
4. Test Whisper health: `curl http://localhost:5000/health`
5. Test email: Use Nextcloud admin email test tool
