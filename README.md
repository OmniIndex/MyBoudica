# Boudica AI + Nextcloud + Collabora Online Integration

A comprehensive integration of **Boudica Sovereign AI** with Nextcloud and Collabora Online, providing privacy-first, auditable AI assistance for collaborative workflows, document editing, and communication.

**Status:** Production-ready | **Version:** 1.1.1  
**Licensing:** Mixed — see LICENSE (MIT, core components) and LICENSE-AGPL (Nextcloud/Collabora integration components)
**Author:** OmniIndex

**Note:** Components that integrate directly with Nextcloud (as a Nextcloud app) or Collabora Online are licensed AGPL-3.0-or-later, consistent with their upstream dependencies. Standalone Boudica AI core components are MIT-licensed.
---

## 🎯 Overview

This repository contains a complete, cloud-agnostic integration that adds sovereign AI capabilities to Nextcloud and Collabora Online office suites. Unlike cloud-based AI models, Boudica runs entirely on your infrastructure with full audit trails, no data leakage, and compliance-ready transparency.

### Key Features

- **🤖 Nextcloud Talk Integration** – Invoke Boudica AI naturally by mentioning it in any Talk conversation
- **🎙️ Audio Transcription** – Local Whisper-based speech-to-text with zero external API calls
- **📊 Smart Digests** – Automatic summarization of Talk conversations, calendar events, and emails
- **🛠️ Agent Builder** – Create, share, and execute multi-step AI workflows
- **💻 Integrated Code Editor** – VS Code-style editor with file management and AI chat
- **📈 Dashboard** – Unified view of AI activities and insights
- **🔐 Fully Auditable** – Local database audit trails for every interaction
- **🏢 Compliance-Ready** – No third-party data processing, complete sovereignty

---

## 📦 Repository Structure

```
collabora/
├── nextcloud/
│   ├── boudicaai/              # Main AI/chat Nextcloud app
│   │   ├── appinfo/            # App metadata and routes
│   │   ├── lib/                # PHP backend services
│   │   │   ├── Controller/     # HTTP request handlers
│   │   │   ├── Service/        # Business logic (Chat, Transcription, Digest)
│   │   │   ├── Listener/       # Talk event listener
│   │   │   ├── Migration/      # Database schema
│   │   │   └── Command/        # CLI commands (transcription, digest)
│   │   ├── js/                 # JavaScript modules
│   │   │   ├── audio-transcription.js      # Whisper API client
│   │   │   ├── audio-upload-ui.js          # Drag-drop UI
│   │   │   ├── chat-audio-integration.js   # Microphone integration
│   │   │   ├── chat-ui.js                  # Main chat interface
│   │   │   ├── admin-settings.js           # Settings panel
│   │   │   ├── boudica-autosignup.js       # Auto-registration
│   │   │   ├── boudicaai-digest.js         # Digest display
│   │   │   ├── services.js                 # HTTP client
│   │   │   └── [more modules...]
│   │   ├── src/                # Vue 3 components (TypeScript)
│   │   │   ├── App.vue         # Main app shell
│   │   │   └── components/
│   │   ├── templates/          # PHP templates
│   │   ├── css/                # Styling
│   │   └── tests/              # PHPUnit tests
│   │
│   ├── boudicaagent/           # Agent/workflow builder app
│   │   ├── appinfo/
│   │   ├── lib/
│   │   ├── js/
│   │   ├── css/
│   │   └── templates/
│   │
│   ├── boudicacode/            # Code editor with AI chat
│   │   ├── js/src/
│   │   │   ├── main.js         # Entry point
│   │   │   ├── core/           # Event bus, state, WebDAV client
│   │   │   ├── editor/         # Monaco editor wrapper
│   │   │   ├── files/          # File tree UI
│   │   │   └── chat/           # Chat panel with slash commands
│   │   └── [standard app structure]
│   │
│   └── boudicadashboard/       # Dashboard UI
│       ├── js/
│       ├── css/
│       └── [standard app structure]
│
├── src/                        # Browser integration for Collabora Online
│   ├── boudica_widget.js       # Main integration script
│   ├── boudica.js              # Core Boudica client
│   └── cool.html               # Collabora Online HTML integration
│
├── whisper_service/            # Local audio transcription microservice
│   ├── Dockerfile              # Container image
│   ├── docker-compose.yml      # Orchestration
│   ├── whisper_service.py      # Flask app
│   ├── requirements.txt        # Python dependencies
│   └── README.md               # Quick start guide
│
├── images/                     # App icons and graphics
├── docs/                       # Additional documentation files
└── [guides and documentation]
```

---

## 🚀 Quick Start

### Prerequisites

- **Nextcloud 31+** (tested through 34)
- **Docker & Docker Compose** (for Whisper service)
- **PHP 8.1+** with Composer
- **Node.js 20+ & npm 10+** (for building Vue components)
- **Python 3.8+** (for Whisper microservice)

### Installation in 5 Minutes

#### 1. Install Nextcloud Apps

```bash
# Clone this repository into your Nextcloud apps directory
cd /var/www/nextcloud/apps
git clone https://github.com/yourorg/collabora.git

# Install PHP dependencies for boudicaai
cd collabora/nextcloud/boudicaai
composer install

# Build Vue components
npm install
npm run build

# Repeat for other apps (boudicaagent, boudicacode, boudicadashboard)
```

#### 2. Enable Apps in Nextcloud

```bash
# Via CLI
nextcloud occ app:enable boudicaai
nextcloud occ app:enable boudicaagent
nextcloud occ app:enable boudicacode
nextcloud occ app:enable boudicadashboard

# Or via Nextcloud Admin Settings UI → Apps → Boudica AI
```

#### 3. Start the Whisper Transcription Service

```bash
cd collabora/whisper_service
docker-compose up -d
```

This starts on `http://localhost:5000` and downloads the Whisper model (~140MB).

#### 4. Configure in Nextcloud

Navigate to **Admin Settings → Boudica AI**:

- **Boudica API Endpoint:** `https://boudi.ca/api/boudica/chat` (or your inference server)
- **API Key:** Generate from your Boudica account
- **Whisper Service URL:** `http://localhost:5000` (for transcription)
- **User ID:** Email or username for audit logging

#### 5. Test Talk Integration

1. Open any Nextcloud Talk conversation
2. Type: `@boudica hello` and press Enter
3. Boudica responds with a greeting in the thread

---

## 📚 Apps & Components

### boudicaai – Main AI Application

The centerpiece: AI chat, Talk integration, audio transcription, and digest generation.

**Key Files:**

- [nextcloud/boudicaai/lib/Listener/TalkBotInvokeListener.php](nextcloud/boudicaai/lib/Listener/TalkBotInvokeListener.php) – Listens for Talk messages containing `@boudica`
- [nextcloud/boudicaai/lib/Service/BoudicaService.php](nextcloud/boudicaai/lib/Service/BoudicaService.php) – Sends prompts to inference server
- [nextcloud/boudicaai/lib/Service/TranscriptionService.php](nextcloud/boudicaai/lib/Service/TranscriptionService.php) – Whisper integration
- [nextcloud/boudicaai/js/chat-ui.js](nextcloud/boudicaai/js/chat-ui.js) – Main chat interface
- [nextcloud/boudicaai/js/audio-transcription.js](nextcloud/boudicaai/js/audio-transcription.js) – Whisper client library

**Usage in Talk:**

```text
@boudica what did we discuss yesterday?
boudica summarize this morning
@boudica calendar today
boudica email from finance
@boudica draft a response to the last comment
```

**Database Schema:**
- `boudicaai_messages` – Talk message audit trail
- `boudicaai_calls` – Call records (for transcription)
- `boudicaai_call_participants` – Participant tracking

---

### boudicaagent – Workflow Builder

Create, edit, and execute multi-step AI agent flows. Share workflows across your organization.

**Key Features:**
- Step-based workflow design (pick services, configure parameters)
- Conditional logic (depends-on, loop-over)
- Private + shared agent libraries
- One-click execution

**Architecture:**
- Ported from the main Boudica web app's agents-ui overlay
- Now a standalone Nextcloud app with full integration
- Uses same `/agents/` API endpoints as main app

**Example Workflow:**
```
1. Extract key topics from document (RAG service)
2. Generate action items per topic (Chat service)
3. Route to appropriate team channels (Loop service)
4. Create tasks in Nextcloud (Task service)
```

---

### boudicacode – Code Editor with AI

VS Code-style three-pane editor (file tree / Monaco editor / chat) backed by Nextcloud WebDAV.

**Key Features:**
- Full file system access via WebDAV
- Monaco editor (syntax highlighting, language support)
- Integrated chat with slash commands:
  - `/explain` – Explain the current file/selection
  - `/fix` – Auto-fix issues
  - `/test` – Generate tests
  - `/document` – Add code comments
- Save files directly to Nextcloud
- Multi-file editing

**Monaco Asset Serving:**

Since Monaco's prebuilt assets exceed Nextcloud's normal routing depth, assets are served via a dedicated controller:

```php
// Route: /apps/boudicacode/vendor-assets/{path}
// Serves: /opt/nextcloud/apps/boudicacode/js/vendor/monaco/vs/{path}
```

---

### boudicadashboard – Analytics & Insights

Unified dashboard showing:
- Recent conversations & summaries
- AI usage statistics
- Workflow execution history
- Calendar/email digest schedules
- User activity logs

---

## 🎙️ Audio Transcription System

Complete local speech-to-text pipeline with zero external API calls.

### Components

**Whisper Microservice** ([whisper_service/](whisper_service/))
- Docker-based Flask application
- Supports multiple Whisper models (tiny → large)
- REST API: `POST /transcribe`, `GET /health`
- Configurable model size (quality vs. speed)

**Frontend Modules**
- [audio-transcription.js](nextcloud/boudicaai/js/audio-transcription.js) – Core Whisper API client
- [audio-upload-ui.js](nextcloud/boudicaai/js/audio-upload-ui.js) – Drag-drop UI component
- [chat-audio-integration.js](nextcloud/boudicaai/js/chat-audio-integration.js) – Microphone button in chat

### Supported Formats

✅ WAV, MP3, M4A, FLAC, OGG  
✅ File size up to 2GB  
✅ 99+ languages with automatic detection  

### Performance

| Model  | Size | Accuracy | Speed   |
|--------|------|----------|---------|
| tiny   | 39MB | ~60%     | Real-time |
| base   | 140MB | ~75%    | 10-20s/min |
| small  | 244MB | ~82%    | 30-60s/min |
| medium | 769MB | ~88%    | 2-3 min/min |
| large  | 2.9GB | ~92%    | 5-10 min/min |

### Usage Example

```javascript
// Initialize
const whisper = new AudioTranscription('http://localhost:5000');

// Transcribe a file
const result = await whisper.transcribeFile(
    file,  // File object from input
    (progress) => console.log(`${progress}%`)  // Progress callback
);

// Result contains:
// { status: "success", transcript: "...", language: "en", segments: [...] }
```

See [AUDIO_TRANSCRIPTION_INTEGRATION.md](AUDIO_TRANSCRIPTION_INTEGRATION.md) for full API reference.

---

## 🔐 Security & Auditing

### Audit Trail

Every AI interaction is logged to the Nextcloud database:

**boudicaai_messages** (Talk audit)
- Message sender, content, timestamp
- Edit and deletion history
- Talk room context

**Boudica Inference Server Audit** (external, separate from Nextcloud)
- Prompt & response text
- User ID (from SAML, environment, or API key)
- Tokens used, processing time
- Embedding vectors for memory recall

### Authentication

**Talk Integration:**
- User identity from Talk session (Nextcloud login)
- No additional credentials needed
- Audit logged to Nextcloud database

**Web/API Access:**
- API Key authentication (stored in Nextcloud settings)
- SAML integration with Keycloak (on external inference server)
- Session-based for browser access

### Data Privacy

✅ All audio processing happens on your infrastructure  
✅ No transcripts sent to cloud services  
✅ Optional on-premise Boudica inference (separate server)  
✅ Database audit trail under your control  
✅ Compliance-ready (GDPR, HIPAA, FedRAMP)  

---

## 🏗️ Architecture & Deployment

### Multi-Server Architecture

This integration is designed for a multi-server setup:

| Component | Server | Purpose |
|-----------|--------|---------|
| Nextcloud + Collabora | `eu1` | Frontend, Talk, user-facing apps |
| Postgres Database | `eu.pgbv` | Persistent data store |
| Nginx Proxy | `myboudica.com` | TLS termination, load balancing |
| Janus WebRTC | `eu1` | Real-time communication signaling |
| TURN/STUN | GCP `turn` | NAT traversal (separate from Nextcloud) |
| Boudica Inference | GCP `boudi.ca` | AI model inference, RAG, memory |

See [RUNBOOK.md](RUNBOOK.md) for disaster recovery, snapshot procedures, and troubleshooting.

### Single-Server Deployment

For development/testing, all components can run on one server or even locally with Docker:

```bash
# Development setup
docker-compose -f whisper_service/docker-compose.yml up -d

# Nextcloud (via Nextcloud's own Docker or local installation)
docker run -d nextcloud:latest

# Apps installed as described in Quick Start
```

---

## 📖 Documentation

### End-User Guides

- [BOUDICA_USER_GUIDE.md](BOUDICA_USER_GUIDE.md) – How to use Boudica in Talk, the app, and Collabora
- [NEXTCLOUD_BOUDICA_USER_GUIDE.md](NEXTCLOUD_BOUDICA_USER_GUIDE.md) – Nextcloud-specific features
- [AUDIO_TRANSCRIPTION_QUICKSTART.md](AUDIO_TRANSCRIPTION_QUICKSTART.md) – 5-min audio setup
- [AUDIO_TRANSCRIPTION_SYSTEM.md](AUDIO_TRANSCRIPTION_SYSTEM.md) – Detailed transcription architecture

### Integration & Admin Docs

- [NEXTCLOUD_COLLABORA_INTEGRATION_GUIDE.md](NEXTCLOUD_COLLABORA_INTEGRATION_GUIDE.md) – Architecture, flows, Talk integration
- [RUNBOOK.md](RUNBOOK.md) – Infrastructure recovery, backup/restore, troubleshooting
- [DELIVERY_SUMMARY.md](DELIVERY_SUMMARY.md) – Project overview and implementation status

### Developer References

- [AUDIO_TRANSCRIPTION_INTEGRATION.md](AUDIO_TRANSCRIPTION_INTEGRATION.md) – Whisper API and JavaScript module reference
- [AUDIO_TRANSCRIPTION_DEMO.html](AUDIO_TRANSCRIPTION_DEMO.html) – Working code examples

---

## 🛠️ Development

### Building & Testing

```bash
# Install dependencies
cd nextcloud/boudicaai
composer install && npm install

# Run tests
npm run lint
npm run stylelint
composer run test:unit

# Build for production
npm run build

# Watch mode for development
npm run watch
```

### Code Quality

```bash
# PHP linting & formatting
composer run lint
composer run cs:check
composer run cs:fix

# Static analysis
composer run psalm

# Rector (auto-refactor)
composer run rector
```

### Adding a New Nextcloud App

1. Copy one of the existing app templates (`boudicacode`, `boudicadashboard`)
2. Update `appinfo/info.xml` with your app ID and metadata
3. Implement your UI in `lib/Controller/PageController.php`
4. Add routes in `appinfo/routes.php`
5. Install via `nextcloud occ app:enable your-app-id`

---

## 🐛 Troubleshooting

### Talk Integration Not Working

**Symptom:** Messages with `@boudica` are logged but no response appears.

**Checklist:**
1. Verify `boudicaai` app is enabled: `nextcloud occ app:list | grep boudica`
2. Check Nextcloud admin settings → Boudica AI has valid endpoint & API key
3. Test inference server directly:
   ```bash
   curl -X POST https://boudi.ca/api/boudica/chat \
     -H "Content-Type: application/json" \
     -d '{"prompt": "hello", "api_key": "YOUR_KEY"}'
   ```
4. Check Nextcloud error log: `sudo tail -f /var/www/nextcloud/data/nextcloud.log`

### Audio Transcription Fails

**Symptom:** Upload returns error or empty transcript.

**Checklist:**
1. Verify Whisper service is running: `curl http://localhost:5000/health`
2. Check Docker logs: `docker logs nextcloud-whisper`
3. Ensure file format is supported (WAV, MP3, etc.)
4. Test service directly:
   ```bash
   curl -F "file=@audio.mp3" http://localhost:5000/transcribe
   ```

### Database Connection Errors

**Symptom:** "Error connecting to Nextcloud database" or audit logging fails.

**Checklist:**
1. Verify Postgres is running and accessible
2. Check credentials in `/etc/environment` or systemd unit
3. Verify app migrations have run: `nextcloud occ migrations:status`
4. Run migrations manually: `nextcloud occ migrations:execute`

See [RUNBOOK.md](RUNBOOK.md) for more recovery procedures.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit with clear messages: `git commit -m "Add feature"`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a Pull Request

**Code Standards:**
- PHP: PSR-12, verified with `composer run cs:check`
- JavaScript: ESLint config in [nextcloud/boudicaai/.eslintrc.cjs](nextcloud/boudicaai/.eslintrc.cjs)
- Vue: Standard Nextcloud conventions, TypeScript preferred

---

## 📄 License

MIT License – See [LICENSE](nextcloud/boudicaai/LICENSE) in the main app directory.

---

## 📞 Support

- **Documentation:** Read the guides in the root directory
- **Issues:** GitHub Issues for bug reports
- **Community:** Nextcloud community forums and chat
- **Commercial Support:** Contact OmniIndex at sibain@omniindex.io

---

## 🙏 Acknowledgments

- **OpenAI Whisper** – Audio transcription model
- **Nextcloud** – Application platform and ecosystem
- **Collabora** – LibreOffice online integration
- **Vue.js** – Frontend framework
- **Monaco Editor** – Code editing component
- **OmniIndex** – Boudica AI infrastructure and development

---

**Last Updated:** August 15, 2026  
**Version:** 1.1.1  
**Maintainer:** OmniIndex Team
