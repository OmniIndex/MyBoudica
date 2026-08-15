# Nextcloud + Collabora Online Boudica AI Integration User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Authentication & Setup](#authentication--setup)
3. [Chat Interface & Basic Usage](#chat-interface--basic-usage)
4. [Advanced Chat Features](#advanced-chat-features)
5. [File & Document Handling](#file--document-handling)
6. [Audio & Voice Features](#audio--voice-features)
7. [External Service Integration](#external-service-integration)
8. [Knowledge Base & RAG](#knowledge-base--rag)
9. [Scheduled Actions & Automation](#scheduled-actions--automation)
10. [Agent-Based AI](#agent-based-ai)
11. [Collaboration & Sharing](#collaboration--sharing)
12. [Settings & Customization](#settings--customization)
13. [Troubleshooting](#troubleshooting)

---

## Getting Started

### What is Boudica AI for Nextcloud?

Boudica AI is an integrated artificial intelligence assistant within Nextcloud and Collabora Online that provides:
- Conversational AI chat with memory and context awareness
- Document analysis and processing (PDF, Word, Excel, code files, etc.)
- Audio transcription via Whisper
- Voice input for hands-free interaction
- Integration with external services (Google, Microsoft, Slack, etc.)
- Scheduled automated prompts
- Custom AI agents for specialized tasks
- Retrieval-Augmented Generation (RAG) for knowledge base queries

### System Requirements

- Nextcloud instance with Boudica AI app installed
- Modern web browser (Chrome, Edge, Safari, or Firefox)
- For audio features: microphone and speakers
- For voice input: WebRTC-capable browser (Chrome, Edge, Safari)

### First-Time Access

1. Open your Nextcloud instance and navigate to the Boudica AI application
2. On first load, the system will automatically attempt to create an account using your Nextcloud credentials
3. You'll be prompted to authenticate with your Nextcloud account
4. An API key will be generated and stored locally in your browser
5. The chat interface will load, and you're ready to start using Boudica AI

---

## Authentication & Setup

### How Authentication Works

Boudica uses a **Keycloak OpenID Connect (OIDC)** authentication system with these key features:

#### Session Management
- Your authentication session is stored in browser `localStorage` under the `boudica_session` key
- The session includes:
  - API token/key (required for all requests)
  - User email/ID
  - Session expiration time
  - Token refresh mechanism

#### Automatic Signup Flow
When you first access the app:
1. System detects your Nextcloud user identity
2. Calls the Boudica API beta signup endpoint: `https://boudi.ca/api/boudica/beta/signup`
3. If successful, an API key is generated and stored locally
4. If your email already has an account, you'll see an error message (this is normal - just proceed)

### Managing Your Session

#### Logout
Click the **Logout** button in the chat interface to:
- Clear your local session
- Remove your API key from localStorage
- End your authenticated session

#### Session Expiration
- Sessions are automatically monitored for expiration
- The system will prompt you to re-authenticate if your session expires
- Use the refresh mechanism to maintain continuous access without logging out

#### Multi-User Browser Sessions
Each browser user is kept separate using a unique identifier prefix in localStorage. If multiple people use the same browser:
1. Each login creates an isolated session namespace
2. Chat history, settings, and folders are kept separate per user
3. Logout before switching users to avoid cross-contamination

---

## Chat Interface & Basic Usage

### Main Chat Window

The chat interface consists of:

**Left Sidebar**
- Chat history organized by time
- Search functionality for past conversations
- Folder structure for organizing chats
- New Chat button to start a conversation
- Settings and administration options

**Main Chat Area**
- Message display with markdown rendering
- Syntax highlighting for code blocks
- User and assistant messages clearly distinguished

**Input Area**
- Text input field with auto-resize capability
- Character counter (real-time display of message length)
- Send button (or press Enter/Cmd+Enter)
- Attach button for file uploads

**Top Controls**
- User profile information
- Dark/Light mode toggle
- Additional navigation buttons

### Sending Messages

#### Basic Text Message
1. Click in the message input field
2. Type your message
3. Press `Enter` or `Cmd+Enter` (Mac) to send
4. Or click the Send button

#### Markdown Support
Messages support full GitHub Flavored Markdown (GFM):
- **Bold**: `**text**`
- *Italic*: `*text*`
- `Code`: `` `code` ``
- Code blocks: ` ``` language` ... ` ``` `
- Lists (ordered and unordered)
- Headers (# through ######)
- Links: `[text](url)`
- Tables, blockquotes, and more

#### Message History Navigation
- Use **Up/Down Arrow Keys** to navigate through your message history
- Bash-style history recall: press Up to go to previous messages
- Your typed text is saved while browsing history
- Press Down to return to your current draft

### Conversation Management

#### Create New Chat
Click the **"+ New Chat"** button to:
- Start a completely new conversation
- Create a fresh chat session with a unique ID
- Begin fresh context (Boudica remembers each chat independently)

#### View Chat History
- Chat history automatically displays in the left sidebar
- Conversations are grouped by approximate time
- Click any chat to switch to it and view previous messages
- Search functionality at the top to find specific chats

#### Switch Between Chats
- Click a chat in the left sidebar to switch to it
- Current chat is highlighted
- Chat context and messages load instantly
- Your place in each conversation is preserved

### Understanding Response Types

#### Standard Response
- Text-based AI-generated answers
- May include formatting, code blocks, or structured data

#### Streaming Response
- Responses are streamed in real-time as the model generates them
- You see text appearing as it's produced (faster feedback)
- The message will have a loading indicator while still streaming

#### Thought Process (Hidden)
- The model may include internal thinking (marked with `<thought>` or `<thinking>` tags)
- These are automatically stripped from display for cleaner output
- You see only the final, clean response

---

## Advanced Chat Features

### Message Actions

Each message in the chat has action buttons:

#### Copy
- Copies the entire message to your clipboard
- Useful for pasting into documents or other applications

#### Edit (User Messages Only)
- Click to modify your original message
- The response regenerates based on your edit

#### Delete
- Remove messages from the conversation
- Useful for cleaning up chat history

#### Like/Dislike (Rating)
- Rate responses to help train the system
- Thumbs up (👍) for good responses
- Thumbs down (👎) for poor responses
- Your feedback helps improve the AI

### Context & Memory Management

#### How Memory Works
- Boudica maintains context within a single chat
- Previous messages in the same conversation inform responses
- Each new chat has fresh context
- Some advanced prompts can control memory behavior

#### "No Memory" Mode
When you want responses without previous context, include these phrases in your prompt:
- "no memory"
- "disable memory"
- "without memory"
- "don't use memory"
- "skip memory"

Example: *"No memory: What is the capital of France?"*

This creates an **isolated session** within your chat while keeping follow-up messages in context for that session.

#### "Use RAG" Mode
To enable knowledge base retrieval:
- Include phrases like "use rag", "with rag", "enable rag", or "use retrieval"
- Boudica searches your knowledge base for relevant documents
- Responses are grounded in your uploaded documents

Example: *"With RAG: What are our company policies?"*

### Message Streaming & Performance

- Responses render progressively as they're generated
- The UI throttles rendering to prevent performance issues
- Long responses don't cause UI lag
- Syntax highlighting applies automatically to code blocks

---

## File & Document Handling

### Supported File Types

Boudica can process a wide variety of file formats:

**Documents**
- Text: `.txt`, `.md`, `.log`
- Microsoft Office: `.docx`, `.doc`, `.xlsx`, `.xls`, `.csv`, `.pptx`, `.ppt`
- OpenOffice: `.odt`, `.ods`, `.odp`
- PDF: `.pdf`
- Rich Text: `.rtf`

**Code Files**
- C/C++: `.cpp`, `.c`, `.h`, `.hpp`, `.cu`
- Java: `.java`
- JavaScript: `.js`
- Python: `.py`
- Ruby: `.rb`, `.go`
- Rust: `.rs`
- Swift: `.swift`
- Kotlin: `.kt`
- PHP: `.php`
- Data: `.json`, `.xml`, `.html`, `.htm`

**Audio/Video**
- Audio: `.wav`, `.mp3`, `.m4a`, `.flac`, `.ogg`, `.webm`
- Video: `.mp4`, `.avi`, `.mov`, `.mkv`
- (Sends to transcription service; videos are converted to audio)

**Images**
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Sent to vision model for analysis
- Not OCR'd, but interpreted visually

### Attaching Files

#### Upload a File
1. Click the **Attach** button (📎) in the message input area
2. Select one or more files from your computer
3. Files appear as "queued" in the interface
4. Type your prompt message
5. Click Send

#### Multiple File Attachment
- You can attach multiple files in a single message
- All files are processed together with your prompt
- Useful for comparing documents or cross-referencing data

#### File Size Limits
- Maximum file size: **50 MB**
- Larger files will be rejected with an error message
- For very large files, consider splitting them or compressing first

### How Files Are Processed

**Server-Side Extraction**
- JavaScript does NOT extract file content
- Files are sent to the backend server
- Server uses `text_extractor.cpp` to handle extraction
- Supports all formats listed above

**Processing Steps**
1. Your prompt and files are sent together
2. Server identifies file types
3. Appropriate extractor is applied:
   - PDFs → PDF parser
   - Documents (Word, Excel) → Office format parser
   - Code files → source code reader
   - Images → vision model
   - Audio → transcription service
4. Extracted text/content is combined with your prompt
5. AI processes everything together

**Results Depend On**
- File quality and readability
- File format and encoding
- Content complexity
- Your specific questions or instructions

### Example Usage

#### Analyze a PDF
*"Summarize the key points from this PDF document"*
- Attach: `report.pdf`

#### Compare Spreadsheets
*"Find the differences between these two Excel files"*
- Attach: `2023_data.xlsx` and `2024_data.xlsx`

#### Debug Code
*"Review this code for bugs and suggest improvements"*
- Attach: `app.py` (your Python file)

#### Extract Information
*"Pull out all email addresses and phone numbers from this document"*
- Attach: `contacts.docx`

---

## Audio & Voice Features

### Audio Transcription Service

Boudica integrates with a local **Whisper transcription service** for converting audio to text.

#### How It Works
1. You upload an audio file with your message
2. The file is sent to the Whisper service: `https://myboudica.com/whisper`
3. Audio is transcribed to text
4. Transcription is included with your prompt for processing

#### Supported Audio Formats
- `.wav` - Waveform Audio File
- `.mp3` - MPEG-3 Audio
- `.m4a` - MPEG-4 Audio
- `.flac` - Free Lossless Audio Codec
- `.ogg` - Ogg Vorbis
- `.webm` - WebM Audio
- `.opus` - Opus Audio Codec
- `.aac` - Advanced Audio Coding

#### Maximum File Size
- **500 MB** for audio files

#### Using Audio Transcription
1. Click **Attach** button
2. Select an audio file
3. Include a prompt (e.g., "Transcribe this meeting and summarize action items")
4. Click Send
5. Whisper transcribes the audio
6. AI processes the transcription with your prompt

#### Example Usage
- Meeting recordings → "Transcribe this meeting and list decisions made"
- Voice notes → "Convert this voice note to a written summary"
- Interview recordings → "Extract key quotes and themes from this interview"
- Podcast segments → "Summarize the key points from this podcast"

### Voice Input (Browser Speech Recognition)

For hands-free input using your browser's speech recognition:

#### Browser Support
- ✅ Chrome/Chromium
- ✅ Microsoft Edge
- ✅ Safari (Mac/iOS)
- ❌ Firefox (not supported natively)

#### Starting Voice Input
1. Look for the **microphone button** 🎤 in the input area
2. Click to start listening
3. Speak clearly into your microphone
4. A transcript will appear in the text field as you speak
5. Click again or wait for automatic stop
6. Edit the text as needed
7. Send your message

#### Features
- **Interim Results**: You see text appearing as you speak
- **Auto-Stop**: Recognition stops after you finish speaking
- **Error Handling**: Browser shows warnings if microphone access is denied
- **Language Support**: Default is English-US (customizable in code)
- **Fallback**: If not supported, an alert suggests using Chrome, Edge, or Safari

#### Tips for Best Results
- Minimize background noise
- Speak clearly and at a normal pace
- Allow pauses between sentences
- Review transcribed text for accuracy before sending
- Correct errors by clicking in the text and editing

---

## External Service Integration

### Connected Services Overview

Boudica can integrate with many external services to enhance functionality:

#### Available Services
- **Microsoft**: Office 365, Teams, Outlook, SharePoint, OneDrive
- **Google**: Gmail, Drive, Calendar, Workspace
- **Communication**: Slack, Discord
- **Development**: GitHub, GitLab, Bitbucket
- **CRM/Business**: Salesforce, HubSpot, Pipedrive, Zoho
- **Accounting**: QuickBooks, Xero
- **Data/Analytics**: Snowflake, Tableau
- **File Storage**: Dropbox, Box, OneDrive
- **Project Management**: Asana, Monday.com, Linear
- **Social**: LinkedIn, Twitter/X, TikTok

### Connecting a Service

#### Open Services Panel
1. Click the **Connected Services** button (🔌/plug icon) in the top header
2. An overlay panel opens showing available services
3. Services are divided into:
   - **Shared Services**: Available to all users
   - **My Services**: Services you've personally connected

#### Connect a Service
1. Find the service you want to connect
2. Click the **Connect** button
3. A popup window opens with the service's OAuth login
4. Log in with your credentials for that service
5. Grant permissions when prompted
6. The popup closes automatically
7. Service status updates to "Connected"

#### Disconnect a Service
1. Open the Connected Services panel
2. Find the connected service
3. Click the **Disconnect** button
4. Service access is revoked immediately

### Using Connected Services in Prompts

After connecting a service, you can reference it in your prompts:

**Syntax**: `@service_name` or `:service_name:`

**Examples**:
- *"What's on my calendar this week?" (with Google Calendar connected)*
- *"Show me open HubSpot deals" (with HubSpot connected)*
- *"Draft a Slack message about the Q3 roadmap"*
- *"List my recent commits on GitHub"*

### Service Connection Status

- **Green/Connected**: You have an active session with this service
- **Yellow/Pending**: Connection in progress
- **Red/Disconnected**: Service is not currently connected
- **Error**: Connection failed; try again or check permissions

### Privacy & Security

- Service connections are stored securely
- OAuth tokens are encrypted
- Boudica never stores your passwords
- You can disconnect anytime to revoke access
- Each service has independent connection status

---

## Knowledge Base & RAG

### What is RAG?

**Retrieval-Augmented Generation (RAG)** enhances AI responses by searching your personal knowledge base before generating answers. This ensures responses are grounded in your actual documents and data.

### Knowledge Base Overview

Your knowledge base is a **domain-isolated corpus folder** where you upload documents:
- Storage location: `/mnt/boudica/corpus/<your_domain>/public/`
- Only you (and your domain) can access your documents
- Documents are indexed for fast searching
- Supports organizing documents in folders

### Accessing the Knowledge Base

#### Open Knowledge Base Panel
1. Click the **Knowledge Base** button (📚/book icon) in the sidebar or header
2. An overlay panel opens showing your corpus structure
3. You can navigate folders, upload files, or delete documents

#### Navigation
- View current folder contents (files and subfolders)
- Click folder names to navigate into them
- Use "Back" button to go up one level
- Breadcrumb trail shows current location

### Uploading Documents

#### File Upload Process
1. Open the Knowledge Base panel
2. Click **Upload Files** or drag files into the panel
3. Select one or more files from your computer
4. Files are uploaded to the current folder
5. Upload progress shows percentage complete
6. File appears in the folder once complete

#### Supported File Types for RAG
- Documents: PDF, Word, Excel, PowerPoint, OpenOffice
- Text: TXT, Markdown, code files
- Data: JSON, CSV, XML
- Images: JPG, PNG, GIF, WebP (will be OCR'd)

#### File Size & Limits
- Maximum individual file: **100 MB**
- Total storage: Domain-dependent quota
- Upload errors show clear messages

### Organizing Documents

#### Create Folders
- Right-click or use a menu option to create folders
- Organize by project, department, date, or topic
- Nested folders supported (folders within folders)

#### Naming Conventions
- Use clear, descriptive names
- Include dates for time-sensitive documents
- Example structure:
  ```
  /public/
    ├── /2024_Q3_Reports/
    ├── /Company_Policies/
    ├── /Project_Alpha/
    └── /Meeting_Notes/
  ```

#### Move & Copy Files
- Some versions support drag-and-drop between folders
- Or delete and re-upload in the correct location

### Using RAG in Prompts

#### Enable RAG for a Query
Include one of these phrases in your prompt:
- "use rag"
- "with rag"
- "enable rag"
- "use retrieval"
- "search knowledge base"

**Examples**:
- *"With RAG: What are our product return policies?"*
- *"Use retrieval to find information about the 2024 budget"*
- *"Search knowledge base for competitor analysis documents"*

#### How RAG Works Behind the Scenes
1. Your prompt is converted to a semantic vector
2. Knowledge base is searched for similar documents
3. Top relevant documents are retrieved
4. Retrieved content is included with your prompt
5. AI generates response based on retrieved documents + your question
6. Response is grounded in your actual data

#### RAG Search Quality
- Distance threshold: Documents with >80% semantic similarity retrieved
- Minimum prompt length: Queries must be at least 15 characters
- Keyword matching: Important topic words must appear in retrieved documents
- Top results: Usually 5-10 most relevant documents returned

### Example RAG Workflows

#### Compliance Check
1. Upload relevant compliance documents to `/Company_Policies`
2. Ask: *"Use RAG: Are we compliant with the latest GDPR requirements?"*
3. AI searches documents and answers based on your policies

#### Project Research
1. Upload project background documents
2. Ask: *"With RAG: What were the original project goals and budget?"*
3. Get accurate, document-backed answers

#### Meeting Preparation
1. Upload previous meeting notes
2. Ask: *"Enable RAG: What were the action items from the last meeting?"*
3. AI retrieves and summarizes previous decisions

#### Document Analysis
1. Upload multiple related documents
2. Ask: *"Use retrieval: Identify inconsistencies between these documents"*
3. AI compares and reports discrepancies

### Managing Your Knowledge Base

#### Delete Files
1. Open Knowledge Base panel
2. Find the file you want to remove
3. Click the delete button (🗑️) or right-click
4. Confirm deletion
5. File is immediately removed from corpus

#### Delete Folders
1. Folders can be deleted if empty
2. Or you can delete all contents first
3. Deletion is permanent

#### Updating Documents
- Delete the old version
- Upload the new version with the same or new name
- You can keep multiple versions if needed

#### Storage Management
- Monitor total storage usage shown in panel
- Remove outdated documents to free space
- Archive old documents by moving to a date-stamped folder

---

## Scheduled Actions & Automation

### What Are Scheduled Actions?

Scheduled actions let you run prompts automatically on a schedule without having to manually type them each time.

### Detecting Scheduling Syntax

Boudica detects scheduling instructions in your natural language:

**Time-Based Patterns**
- "run at 9am" or "run @ 3:00pm"
- "run every day at 10am"
- "run daily at noon"

**Interval-Based Patterns**
- "run every 2 hours"
- "run every 30 minutes"
- "run each hour"

**Day-Based Patterns**
- "run Monday-Friday at 9am"
- "run Mon-Wed at 8am"
- "run Saturday at 5pm"

### Creating a Scheduled Action

#### Step 1: Write Your Prompt with Schedule
1. Type your prompt (the actual task you want to automate)
2. Include scheduling instructions
3. Example: *"Send a daily summary report every weekday at 9am"*

#### Step 2: Send the Message
1. Click Send
2. Boudica detects the scheduling instruction
3. Displays a prompt to save as a scheduled action

#### Step 3: Review & Save
1. System shows the extracted prompt and schedule
2. You can add a title for the action
3. Click "Save as Scheduled Action"
4. Action is created and timer starts

### Managing Scheduled Actions

#### View All Actions
1. Click the **Actions** button in the sidebar
2. See all your scheduled prompts
3. Each action shows:
   - Title
   - Original prompt
   - Schedule
   - Created date
   - Previous responses

#### Edit Actions
1. Open the Actions panel
2. Find the action you want to modify
3. Click the edit button (✏️)
4. Change the prompt, schedule, or title
5. Save changes

#### Delete Actions
1. Open the Actions panel
2. Find the action to remove
3. Click the delete button (🗑️)
4. Confirm deletion
5. Action stops running immediately

#### View Response History
1. Each action tracks all past responses
2. Expand an action to see previous results
3. Delete individual responses if needed

### Examples of Scheduled Actions

#### Daily Summary
*"Every morning at 9am, summarize my calendar for the day"*

#### Weekly Report
*"Every Friday at 5pm, generate a project status report"*

#### Recurring Reminder
*"Every weekday at 2pm, remind me to check urgent emails"*

#### Data Extraction
*"Every Monday at 8am, pull latest sales numbers"*

#### Content Generation
*"Daily at 10am, generate three article ideas for our blog"*

### How Automation Works

1. Action is saved with schedule and prompt
2. Timer starts tracking when action should run
3. At scheduled time, action executes automatically
4. Prompt is sent to Boudica backend
5. Response is captured and stored
6. Next scheduled execution is calculated
7. Timer waits for next occurrence

### Timezone Considerations

- Times are interpreted in your browser's local timezone
- Displayed times are in your timezone
- Actions execute at your specified local time
- No timezone selection interface (uses system timezone)

---

## Agent-Based AI

### What Are Agents?

AI agents are specialized AI personalities or services designed to handle specific types of tasks. They can:
- Use different AI models (Boudica local model, reasoning engines, etc.)
- Access specific services (Google Drive, Slack, databases, etc.)
- Have custom instructions and behavior
- Be shared across your organization or kept private

### Accessing Agents

#### Open Agents Panel
1. Click the **Agents** button (🤖/robot icon) in the header
2. An overlay shows available agents
3. Agents are organized into two sections:
   - **Shared Agents**: Created by admins, available to all
   - **My Agents**: Your private agents + Create New button

### Agent Types

#### Shared Agents (Admin-Created)
- Available to all users
- Read-only (you cannot edit)
- Examples:
  - "Code Reviewer" (code analysis)
  - "Research Assistant" (internet search)
  - "Data Analyst" (database queries)
  - "Content Writer" (document drafting)

#### Personal/Private Agents
- Only you can see and use
- You can create, edit, and delete
- Ideal for your unique workflows
- Can be kept personal or promoted to shared later

### Using an Agent

#### Method 1: Click to Invoke
1. Open Agents panel
2. Find and click on the agent you want
3. Agent opens in a chat interface
4. Chat with agent, which uses its specialized capabilities

#### Method 2: Mention in Prompt
1. Type a message in chat
2. Reference the agent in your prompt
3. Example: *"@ResearchAssistant, find information about AI trends"*

### Creating a Custom Agent

#### Open Agent Builder
1. Click Agents button
2. In "My Agents" section, click **Create New Agent**
3. Builder form slides in to replace tile view

#### Configure Agent
- **Agent Name**: Unique identifier
- **Display Name**: How it appears to users
- **Description**: What it does
- **Base Service**: Which AI/service powers it:
  - `boudica` - Local Boudica model
  - `reasoning` - Reasoning/bare LLM
  - `db:name` - ODBC database connection
  - `gmail` - Gmail integration
  - `gdrive` - Google Drive
  - `gcalendar` - Google Calendar
  - `hubspot` - HubSpot CRM
  - `sharepoint` - SharePoint
  - `outlook` - Outlook/Exchange
  - `teams` - Microsoft Teams
  - `slack` - Slack
  - `salesforce` - Salesforce
  - `custom` - Custom service key

#### Set Instructions
- Provide system instructions for the agent
- These guide its behavior and responses
- Example: *"You are a product manager. Answer questions about our roadmap and features."*

#### Capabilities
- Select which features the agent should have access to
- May include: memory, RAG, file handling, voice, etc.

#### Save Agent
1. Fill all required fields
2. Click **Save**
3. Agent appears in your agents list
4. Timer starts for agent availability
5. You can immediately start using it

### Editing Agents

#### Modify Your Agent
1. Open Agents panel
2. Find your agent in "My Agents"
3. Click the **Edit** button (✏️)
4. Builder form re-opens with current settings
5. Make changes as needed
6. Save to apply

#### Delete Agent
1. Open Agents panel
2. Find your agent
3. Click **Delete** button (🗑️)
4. Confirm deletion
5. Agent is permanently removed

### Agent Use Cases

#### Code Reviewer Agent
- Service: Boudica
- Instructions: "Review code for quality, security, and best practices"
- Used by: Development teams

#### Customer Support Agent
- Service: Salesforce + Slack
- Instructions: "Answer customer questions using our knowledge base and CRM data"
- Used by: Support teams

#### Data Analyst Agent
- Service: Database (`db:analytics`)
- Instructions: "Query and analyze business metrics from the database"
- Used by: Analytics team

#### Content Creator Agent
- Service: Google Drive
- Instructions: "Draft marketing content and manage documents"
- Used by: Marketing team

---

## Collaboration & Sharing

### Chat Sharing

#### Share a Chat
- Open a chat you want to share
- Click **Share** button
- Generate a shareable link
- Select who can access (public/link/specific users)

#### Accept Shared Chats
- Others can share chats with you
- Shared chats appear in a "Shared Chats" section
- You can view but permissions may restrict editing
- Invitation notifications appear in the interface

#### Collaboration on Chats
- Multiple users can participate in the same chat
- Messages show which user sent them
- Real-time updates as others type
- Threaded discussions on specific messages

### Folder Organization

#### Creating Folders
- Organize chats into folders by topic or project
- Create nested folder structures
- Drag chats to organize

#### Shared Folders
- Can be shared with teams or individuals
- Others see the folder and contents
- Permissions control viewing/editing

### User Mentions

- Type `@username` to mention someone in a chat
- Mentioned users get notifications
- Useful for asking specific people in a chat

---

## Settings & Customization

### User Profile

#### Edit Profile
- Click your profile icon/initials
- View/edit:
  - Display name
  - Email address
  - Profile picture
  - Preferences

#### User Email & ID
- Your email is used as your unique identifier
- Important for:
  - Service connections
  - RAG corpus isolation
  - Audit logging
  - Sharing permissions

### Chat Settings

#### API Configuration (Advanced)
- Open browser console or settings
- Override default API endpoint: `localStorage.setItem('boudica_api_url', 'your_url')`
- Default: `https://boudi.ca/api/boudica`

#### Storage Settings
- Chats and settings are stored locally in browser
- Clear browser data to reset (careful: loses chat history)
- Settings sync to server if enabled

### Appearance

#### Dark Mode
- Click the **Dark Mode Toggle** button
- Switches between light and dark themes
- Preference is saved to localStorage
- Applies across all chat interfaces

#### Sidebar Collapse
- Click the **Sidebar Toggle** button (≡)
- Sidebar collapses to icons for more space
- State is saved in localStorage
- Click again to expand

### Privacy & Data

#### Data Storage
- Your chats are stored locally in browser localStorage
- Also synced to server if enabled
- You can export your chat history
- You can delete individual chats or all chats

#### Session Data
- API key stored in localStorage (browser only)
- Not transmitted except to Boudica API
- Cleared on logout
- Use private/incognito mode for temporary sessions

#### What Gets Logged
- Your prompts and Boudica's responses
- File names (not contents) of uploaded documents
- Audio transcription text (not raw audio)
- User identity for audit purposes
- Timestamps of interactions

#### Clearing Data
- Click **Logout** to clear session
- Clear browser localStorage to clear all local data
- Logout doesn't affect server-side audit logs
- Deletion requests can be submitted to admin

---

## Troubleshooting

### Authentication Issues

#### "No Boudica API key found"
**Symptom**: Alert on first load or after logout
**Cause**: Session not initialized or signup failed
**Solution**:
1. Close the browser tab
2. Open Nextcloud again
3. If persists, clear localStorage: `localStorage.clear()` in console
4. Refresh and try again

#### "Email already registered"
**Symptom**: Signup error with code `EMAIL_EXISTS`
**Cause**: Your email already has a Boudica account
**Solution**:
1. This is normal - just proceed
2. Your existing API key will be used
3. If you need a new account, contact admin

#### "Authentication failed"
**Symptom**: Login loop or persistent auth errors
**Cause**: Keycloak connection issue or expired tokens
**Solution**:
1. Clear localStorage: Open DevTools → Application → Clear Storage
2. Refresh page
3. Check that `https://auth.boudi.ca` is accessible
4. Try in incognito mode to rule out cache issues

### Chat & Message Issues

#### Messages not sending
**Symptom**: Send button does nothing or shows loading forever
**Cause**: Network issue, backend down, or file too large
**Solution**:
1. Check browser console for errors (F12)
2. Verify internet connection
3. Reduce file sizes if attaching files
4. Try a simpler message to test
5. Refresh page and retry

#### Chat won't load
**Symptom**: Blank chat area or loading spinner stuck
**Cause**: Browser storage full, corrupted data, or network
**Solution**:
1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear browser cache and try again
3. Try in a different browser
4. Contact admin if persists

#### Messages don't appear after sending
**Symptom**: You send a message but it doesn't show in chat
**Cause**: Race condition, browser offline, or backend delay
**Solution**:
1. Wait a few seconds and refresh
2. Check browser console for errors
3. Verify you're still authenticated
4. Try sending again

### File Upload Issues

#### "File too large. Maximum size: 50MB"
**Cause**: Uploaded file exceeds 50MB limit
**Solution**:
1. Compress the file (ZIP, 7Z, etc.)
2. Or split into multiple smaller files
3. Upload each part separately

#### "Unsupported file format"
**Cause**: File type not in supported list
**Solution**:
1. Convert to supported format:
   - .doc → .docx
   - .jpg → .png or .webp
   - .mov → .mp4
2. Or save code files with proper extension (.py for Python, etc.)

#### File uploads hang
**Cause**: Large file, slow connection, or server issue
**Solution**:
1. Wait up to 5 minutes for upload to complete
2. Try smaller file first to test connection
3. Check if backend service is running
4. Use wired connection instead of WiFi if possible

#### "Unsupported file format" for code files
**Cause**: File may not have recognized extension
**Solution**:
1. Add proper extension: `.py`, `.js`, `.cpp`, etc.
2. Ensure file extension matches actual language
3. Text content will be extracted correctly once uploaded

### Audio & Voice Issues

#### Microphone button not appearing
**Symptom**: No 🎤 icon for voice input
**Cause**: Browser doesn't support Web Speech API
**Solution**:
1. Use Chrome, Edge, or Safari instead
2. Or type messages manually
3. Firefox users can enable experimental flags but not officially supported

#### "Voice recognition not supported in your browser"
**Cause**: Browser is Firefox or other non-supported browser
**Solution**:
1. Switch to Chrome, Chromium, Edge, or Safari
2. Or use manual text input
3. Or upload audio files for transcription instead

#### Voice transcript is garbled or incomplete
**Cause**: Background noise, unclear speech, or microphone issues
**Solution**:
1. Move to quieter location
2. Speak more clearly and slowly
3. Check microphone is working (test in Windows/Mac settings)
4. Try shorter phrases instead of long sentences
5. Manually correct transcript before sending

#### Whisper transcription service unavailable
**Symptom**: "Whisper service not available" error
**Cause**: Backend transcription service not running
**Solution**:
1. Contact your Nextcloud admin
2. Check that `https://myboudica.com/whisper` is accessible
3. May need to start the transcription service
4. Try again after service is restarted

### Knowledge Base (RAG) Issues

#### "No results found" when using RAG
**Cause**: No relevant documents in knowledge base, or poor semantic match
**Solution**:
1. Verify documents are uploaded to Knowledge Base
2. Try simpler, more specific prompts
3. Use keywords from your documents
4. Check document formatting (corrupted files won't index)

#### Can't upload files to Knowledge Base
**Symptom**: Upload button doesn't work or shows errors
**Cause**: Permissions issue, quota exceeded, or corrupted file
**Solution**:
1. Verify you have write permissions
2. Check available storage quota
3. Try a different file format
4. Ensure file isn't corrupted or zero-size

#### File in Knowledge Base but not appearing in RAG results
**Cause**: File not yet indexed, or semantic relevance too low
**Solution**:
1. Wait a few minutes for indexing to complete
2. Use more relevant keywords
3. Try re-uploading the file
4. Ensure RAG is enabled in prompt ("use RAG")

### Service Connection Issues

#### OAuth connection fails
**Symptom**: Popup closes with "connection failed"
**Cause**: Invalid credentials, service down, or permission denied
**Solution**:
1. Verify your credentials for that service
2. Check if the service is online/accessible
3. Try again and carefully review permission prompts
4. Check if your account has required permissions

#### "Service disconnected" error
**Cause**: Token expired, permissions revoked, or service account changed
**Solution**:
1. Disconnect and reconnect the service
2. Re-authenticate with current credentials
3. Check service hasn't revoked permissions
4. Try logging into service directly to verify access

#### Service returns errors when used
**Cause**: Insufficient permissions, quota exceeded, or data issue
**Solution**:
1. Check service account has necessary permissions
2. Verify no quota limits (storage, API calls)
3. Contact service provider if errors persist
4. Try different prompts or actions

### Performance Issues

#### Chat is slow or laggy
**Cause**: Large chat history, browser memory issues, or weak internet
**Solution**:
1. Start a new chat (keeps history lightweight)
2. Clear browser cache/cookies
3. Close other browser tabs
4. Upgrade internet connection
5. Try different browser

#### Long responses cause UI lag
**Cause**: Large amount of text rendering
**Solution**:
1. Wait for response to fully complete
2. This is normal and usually resolves quickly
3. Refresh if UI becomes unresponsive

### Getting Help

#### Check System Status
- Contact your Nextcloud administrator
- Verify the Boudica AI app is properly installed
- Check backend services (inference server, Whisper) are running

#### Collect Debug Information
- Browser console errors (F12 → Console tab)
- Recent chat history showing the problem
- File names and types you were trying to upload
- Steps to reproduce the issue

#### Common Admin Checks
- Verify API endpoint is accessible: `curl https://boudi.ca/api/boudica`
- Check inference server is running
- Verify Whisper service is available (if using audio)
- Review server logs for errors
- Ensure database connections are active

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Cmd/Ctrl + Enter` | Send message (alternative) |
| `Up Arrow` | Previous message in history |
| `Down Arrow` | Next message in history |
| `Escape` | Close overlays or cancel |
| `Tab` | Focus navigation |
| `Cmd/Ctrl + N` | New chat |

---

## Tips & Best Practices

### Effective Prompting
1. **Be specific**: Include context and what you want
   - ❌ "Fix this code"
   - ✅ "Fix this Python function to handle edge cases for empty lists"

2. **Use examples**: Show what you mean
   - Include sample input/output
   - Reference similar tasks done before

3. **Break complex tasks**: Simplify into steps
   - Instead of one huge prompt, ask multiple questions
   - Use follow-up messages to refine

4. **Leverage context**: Use what Boudica already knows
   - Reference previous messages in conversation
   - Mention documents you've uploaded
   - Build on previous responses

### File Management
1. **Organize Knowledge Base**: Keep documents structured
   - Use dated folders
   - Group by project or topic
   - Delete outdated versions

2. **Use meaningful names**: Help RAG find documents
   - "2024_Q3_Sales_Report.pdf" not "Report (1).pdf"
   - Include keywords in names

3. **Keep files current**: Update Knowledge Base regularly
   - Replace old versions
   - Remove irrelevant documents
   - Archive instead of delete if uncertain

### Security
1. **Logout when switching users**: Multi-user browsers need care
   - Click Logout before switching users
   - Prevents cross-user data leakage

2. **Don't share API keys**: Keep your token private
   - Never paste in public chats
   - Don't share browser localStorage contents
   - Use service connections for shared access instead

3. **Use RAG for sensitive data**: Better than embedding in prompts
   - Upload to Knowledge Base (domain-isolated)
   - Use "with RAG" to query safely
   - Avoid pasting sensitive data directly

### Performance
1. **Start new chats periodically**: Prevents slowdown
   - Each chat history takes memory
   - New chat keeps UI responsive
   - Old chats still accessible in history

2. **Clear browser cache**: If experiencing issues
   - Frees up memory and storage
   - Fixes corrupted cache issues
   - Safe - doesn't delete chat history

3. **Use modern browser**: Chrome/Edge for best performance
   - Better WebRTC support for voice
   - Faster message rendering
   - More compatible with all features

---

## Further Resources

### Getting Help
- **Admin Contact**: Reach out to your Nextcloud administrator
- **Boudica Support**: Visit `https://boudi.ca`
- **Nextcloud Docs**: `https://nextcloud.com/developers/`

### Learning More
- Experiment with different prompts
- Try each feature individually
- Combine features for powerful workflows
- Explore agent capabilities for specialized tasks

### Feedback
- Report issues to your administrator
- Suggest new features you'd like
- Share successful workflows with colleagues

---

## Glossary

| Term | Definition |
|------|-----------|
| **Agent** | Specialized AI personality for specific tasks |
| **API Key** | Unique token identifying you to the Boudica API |
| **RAG** | Retrieval-Augmented Generation; searching knowledge base before responding |
| **Whisper** | Audio transcription service powered by OpenAI's Whisper model |
| **OAuth** | Secure service connection protocol |
| **SAML/OIDC** | Authentication protocols for single sign-on |
| **Knowledge Base** | Your personal corpus of uploaded documents for RAG queries |
| **Session** | Active login state in your browser |
| **Streaming** | Real-time response generation (text appears as it's produced) |
| **Markdown** | Text formatting syntax (bold, italic, code, etc.) |
| **Web Speech API** | Browser's built-in speech recognition |

---

**Last Updated**: August 8, 2026  
**Version**: 1.0 (Based on Nextcloud Boudica AI Integration Source Code)

