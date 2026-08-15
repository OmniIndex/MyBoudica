# Boudica AI Nextcloud and Collabora Online Integration Guide

This guide explains how Boudica AI integrates with Nextcloud Talk, the Boudica AI Nextcloud app, and Collabora Online Office. It is written for administrators, integrators, support teams, and end users who need to understand how the pieces fit together and how to use them safely.

The implementation is split across three areas of this repository:

- Nextcloud Talk integration: implemented by the PHP app bootstrap, listener, service, settings, and migrations under `nextcloud/boudicaai/lib/`.
- Boudica Talk application for Nextcloud: implemented by the Nextcloud app under `nextcloud/boudicaai/`, including templates, JavaScript, Vue source, settings, and app metadata.
- Collabora Online Office integration: implemented by the browser-side integration files under `src/`, especially `src/boudica_widget.js`, `src/boudica.js`, and `src/cool.html`.

Note: the requested Talk integration path was `nextcloud/lib`. In this workspace, the active Nextcloud app code is under `nextcloud/boudicaai/lib`.

## 1. Nextcloud Talk Integration

### Purpose

The Talk integration lets users invoke Boudica AI from a Nextcloud Talk conversation and lets the app keep an auditable local transcript of Talk activity. Users interact naturally in Talk by mentioning Boudica in a room message, and the app routes the request to the Boudica inference endpoint configured in the Nextcloud app settings.

The integration supports three major behaviors:

- General assistant responses when a Talk message contains `boudica` or `@boudica`.
- Conversation summarization from stored Talk transcript rows.
- Calendar and email summaries based on the current Nextcloud user's stored calendar and mail data.

### Main Files

- `nextcloud/boudicaai/lib/AppInfo/Application.php`: registers the Talk event listener and adds the Boudica API host to the app content security policy.
- `nextcloud/boudicaai/lib/Listener/TalkBotInvokeListener.php`: receives Talk bot events, logs messages, detects intents, fetches Talk transcript/calendar/email data, and adds bot answers.
- `nextcloud/boudicaai/lib/Service/BoudicaService.php`: forwards prompts to the configured Boudica API endpoint.
- `nextcloud/boudicaai/lib/Migration/Version000002Date20260727120000.php`: creates the `boudicaai_messages` audit table.
- `nextcloud/boudicaai/lib/Migration/Version000003date20260727130000.php`: adds edit, delete, message id, system message, and edit-history fields.
- `nextcloud/boudicaai/lib/Settings/AdminSettings.php`: exposes app-level Boudica API configuration in admin settings.

### Runtime Flow

1. Nextcloud boots the `boudicaai` app.
2. `Application::register()` registers `TalkBotInvokeListener` for Talk `BotInvokeEvent` events.
3. When a Talk message arrives, the listener accepts only supported Talk activity types, currently `Activity` and `Create`.
4. The listener extracts the message content, sender name, Talk room token, and Talk message id.
5. If the message body contains encoded Talk parameters, placeholders such as file shares are replaced with readable text, for example `[shared file: report.docx]`.
6. The message is stored in the `boudicaai_messages` table for audit and later summarization.
7. System messages, edits, and deletes are audited but do not invoke the assistant.
8. If the visible message does not contain `boudica`, the listener stops after logging it.
9. If the message contains `boudica`, the trigger word is stripped and the remaining text becomes the prompt.
10. Intent-specific handlers run for summarize, calendar, and email requests. General prompts are sent to `BoudicaService::ask()`.
11. The listener returns the generated answer to Talk through `BotInvokeEvent::addAnswer()`.

### User Commands in Talk

Users do not need a separate command syntax. They invoke the assistant by mentioning Boudica in a Talk message.

Examples:

```text
@boudica summarize today
boudica summarize the last hour
@boudica what decisions did we make this morning?
boudica calendar today
@boudica summarize my events this week
boudica email from finance this month
@boudica draft a response to the latest planning discussion
```

The listener strips `boudica` or `@boudica` before sending the prompt to the model. If the user posts only `@boudica`, the app responds by asking what help is needed.

### General Assistant Requests

For general prompts, the listener calls `BoudicaService::ask($prompt, $sessionId)`. The Talk room token becomes the session id, so follow-up requests in the same Talk room can share short-term context.

`BoudicaService` builds prompt context from a distributed cache named `boudicaai_history`. The cache keeps the last six messages for a session and expires after six hours of inactivity. The request sent to Boudica includes:

- `message`: the prompt, prefixed with `No Memory.` in the current service code.
- `session_id`: `talk-` plus the Talk session id.
- `user_id`: the configured app-level user id.
- `stream`: `false`.
- `api_key`: the configured app-level API key.
- `temperature`: `0.8`.
- `max_tokens`: `15000`.
- `use_rag`: `true`.

The configured endpoint should be the full Boudica chat endpoint expected by the service, for example:

```text
https://boudi.ca/api/boudica/chat
```

### Talk Transcript Auditing

Talk messages are stored in the `boudicaai_messages` table. The first migration creates:

- `id`: internal row id.
- `token`: Talk room token.
- `actor_name`: sender display name.
- `message`: message text.
- `timestamp`: Unix timestamp.

The second migration adds:

- `message_id`: Talk message id.
- `edited_at`: timestamp when the original message was edited.
- `deleted_at`: timestamp when the original message was deleted.
- `is_system_message`: whether the row represents a Talk system message.
- `edit_of_message_id`: pointer from an edit-history row back to the original message id.

Audit behavior:

- Normal user messages are inserted as rows.
- File placeholders are converted to readable shared-file text before being stored.
- System messages are stored with a `[system]` prefix when they contain visible text.
- Edited messages preserve the original row, mark it with `edited_at`, and insert the edited content as a new linked row.
- Deleted messages preserve the original text and mark the row with `deleted_at`.
- Summaries exclude rows that are deleted or raw edit-history rows, so summaries reflect the visible conversation state.

### Summarization Behavior

When the prompt contains `summarize` or `summarise`, the listener fetches recent transcript rows for the current Talk room.

Supported period phrases include:

- `last hour`
- `last N hours`
- `this morning`
- `this afternoon`
- `today`
- `all day`

If no period is provided, the current implementation defaults to the last hour.

The summarization prompt instructs Boudica to summarize only what appears in the transcript and not invent names, people, or events.

### Calendar Search Behavior

When a prompt contains calendar-oriented words such as `calendar`, `schedule`, `event`, `events`, or `appointments`, the listener queries the Nextcloud calendar tables for the current user.

Supported period phrases include:

- `today`
- `tomorrow`
- `this week`
- `this month`

The listener reads from `calendarobjects` joined to `calendars`, restricted to the current user's principal URI. It extracts basic event fields from iCalendar text:

- calendar name
- summary
- start date/time
- description

The matching events are formatted and sent to Boudica for summarization.

### Email Search Behavior

When a prompt contains `email` or `mail`, the listener queries the Nextcloud Mail app tables for the current user.

Search behavior:

- Removes common filler words such as `search`, `email`, `mail`, `from`, `subject`, `show`, and `my`.
- Searches sender email, sender label, and subject.
- Restricts results to the authenticated Nextcloud user's mail accounts.
- Limits results to 10 messages.
- Formats each result with sender, subject, sent date, and a link to the Mail app thread.

Supported date phrases include:

- `last hour`
- `last N hours`
- `this morning`
- `this afternoon`
- `today`
- `yesterday`
- `this week`
- `last week`
- `this month`

If no date phrase is provided, email search starts at Unix epoch and searches up to now.

### Administrator Setup

1. Install or copy the `boudicaai` app into the Nextcloud apps directory.
2. Enable the app from the Nextcloud Apps UI or with `occ app:enable boudicaai`.
3. Run migrations with the normal Nextcloud upgrade flow, for example `occ upgrade` if needed.
4. Confirm the `boudicaai_messages` table exists after migration.
5. Open Nextcloud administration settings and locate the `Boudica AI` settings section.
6. Configure:
   - API Key
   - API Endpoint
   - User ID
7. Save the settings.
8. Confirm the Talk app is installed and enabled.
9. Confirm the Boudica app can connect to the configured endpoint from the Nextcloud server.

For development builds of the app UI, run:

```bash
cd nextcloud/boudicaai
npm install
npm run build
```

For watch mode during development:

```bash
cd nextcloud/boudicaai
npm run watch
```

### Configuration Reference

The current settings form stores app values through `SettingsController::save()`:

- `api_key`: Boudica API key sent to the inference endpoint.
- `api_endpoint`: endpoint used by `BoudicaService`.
- `user_id`: user id sent to the Boudica API for Talk-originated requests.

The default admin form endpoint value is:

```text
https://boudi.ca/api/boudica/chat
```

The app bootstrap also adds the following allowed connect domain to the Nextcloud content security policy:

```text
https://boudi.ca
```

If your Boudica endpoint is hosted elsewhere, update the CSP logic in the app bootstrap or proxy requests through the app.

### Permissions and Privacy

Administrators should understand that the Talk listener can access and process:

- Talk message text in rooms where the bot event is triggered.
- Stored Talk transcript rows created by the app.
- Calendar event data for the current user when calendar requests are made.
- Mail metadata for the current user when email requests are made.

Recommended operational controls:

- Restrict app installation and configuration to trusted administrators.
- Treat the configured Boudica endpoint as a data processor for prompts and retrieved context.
- Document retention expectations for `boudicaai_messages`.
- Review whether app-level `user_id` is sufficient for your audit model or whether per-user identity should be forwarded.
- Review whether `SettingsController::save()` should remain `NoAdminRequired`; the code comment currently notes that admin-required behavior may be preferred.

### Troubleshooting

If Talk messages are not answered:

- Confirm the Talk app is installed and enabled.
- Confirm `boudicaai` is enabled.
- Confirm `Application::register()` is valid for your deployed Nextcloud version.
- Confirm the message contains `boudica` or `@boudica`.
- Check the Nextcloud log for `Boudica Talk bot failed` or `Boudica message logging failed`.
- Confirm the API endpoint is reachable from the Nextcloud server.
- Confirm the API key is configured.

If summaries are empty:

- Confirm normal Talk messages are being inserted into `boudicaai_messages`.
- Confirm the room token is present in stored rows.
- Confirm the requested time period includes enough visible, non-deleted messages.

If calendar search returns no events:

- Confirm the current user has events in Nextcloud Calendar.
- Confirm the events fall within the requested period.
- Confirm the `calendarobjects` and `calendars` table names match your Nextcloud version.

If email search fails:

- Confirm the Nextcloud Mail app is installed and configured for the user.
- Confirm the mail tables exist and contain indexed messages.
- Check logs for `Boudica email search failed`.

### Current Implementation Notes

- The Talk edit/delete handlers include comments noting that payload paths should be verified against real Talk edit/delete events.
- `BoudicaService::saveHistory()` exists, but the current `ask()` implementation reads history without appending the new prompt/response back to cache.
- `Application::register()` contains a placeholder-style `registerSetupCheck(...)` call that should be reviewed before deployment if it exists in the active deployment code.
- The app currently sends an app-level configured `user_id` for Talk requests rather than resolving the Talk actor as the forwarded Boudica API user.

## 2. Boudica Talk Application as a Nextcloud App

### Purpose

The Boudica AI Nextcloud app provides the user-facing application inside Nextcloud. It appears in the Nextcloud navigation as `Boudica Ai` and is intended to give users a central place for Boudica chat, document workflows, email assistance, calendar assistance, settings, and related tools.

This section covers the Nextcloud app experience itself, separate from the Talk listener in section 1.

### Main Files

- `nextcloud/boudicaai/appinfo/info.xml`: app metadata, name, version, categories, navigation entry, and Nextcloud version compatibility.
- `nextcloud/boudicaai/lib/Controller/PageController.php`: serves the app front page at `/apps/boudicaai/`.
- `nextcloud/boudicaai/templates/index.php`: loads the JavaScript and CSS assets used by the app shell.
- `nextcloud/boudicaai/js/`: browser-side application modules used by the current template.
- `nextcloud/boudicaai/src/`: Vue application source for the newer UI shell.
- `nextcloud/boudicaai/lib/Controller/ApiController.php`: placeholder OCS API controller with an example `/api` endpoint.
- `nextcloud/boudicaai/lib/Settings/`: admin settings section and form.
- `nextcloud/boudicaai/package.json`: frontend build scripts and dependencies.

### App Metadata

The app id is:

```text
boudicaai
```

The PHP namespace is:

```text
OCA\BoudicaAi
```

The navigation route points to:

```text
boudicaai.page.index
```

The app declares compatibility with Nextcloud versions 31 through 34.

The app categories are:

- integration
- office
- search
- tools

### User Experience

After the app is enabled, users should see `Boudica Ai` in the Nextcloud navigation. Opening it loads the app template and browser-side modules.

The documented UI shell contains these areas:

- Home dashboard
- Chat
- Documents
- Emails
- Calendar
- Settings

The Vue source in `src/App.vue` defines the navigation model and imports component views for chat, documents, emails, calendar, and settings. The current PHP template also loads a larger set of plain JavaScript modules from `js/`, including chat, storage, document handling, RAG upload, SAML auth, scheduling, services, Torc private storage/UI, voice input, and auto-signup.

### Frontend Assets Loaded by the Current Template

`templates/index.php` loads these JavaScript modules:

- `admin-settings`
- `agents-ui`
- `boudicaai-main`
- `chat-api`
- `chat-storage`
- `chat-ui`
- `dark-mode`
- `document-handler`
- `rag-upload`
- `saml-auth`
- `scheduler`
- `services`
- `torc-private-storage`
- `torc-private-ui`
- `voice-input`
- `app`
- `boudica-autosignup`

It also loads:

- `boudicaai-main.css`

The template currently includes `boudicaai-main` twice. That should be reviewed if duplicate initialization is observed.

### Chat API Behavior

The browser-side `ChatAPI` module defaults to the direct Boudica CGI endpoint:

```text
https://boudi.ca/api/boudica
```

The chat endpoint is built as:

```text
https://boudi.ca/api/boudica/chat
```

The module can be overridden through local storage for testing:

- `boudica_api_url`
- `boudica_use_cgi`
- `boudica_mode`

The module resolves the current user id from `localStorage.getItem('boudica_session')`, preferring session user email, username, or id and falling back to `anonymous`.

### Auto-Signup Behavior

The `boudica-autosignup.js` module runs after a Nextcloud user is logged in. It:

1. Reads the current Nextcloud user through `OC.getCurrentUser()`.
2. Checks whether the user already has a saved Boudica API key in Nextcloud config.
3. Calls the Boudica beta signup endpoint if no key exists.
4. Saves the generated API key into the user's Nextcloud config.
5. Shows the user the generated credential details.

The current signup endpoint is:

```text
https://boudi.ca/api/boudica/beta/signup
```

The module uses Nextcloud OCS config endpoints under:

```text
/ocs/v2.php/apps/admin/api/v1/config/users/{userId}/boudica_api_key
```

Administrators should verify that the deployed Nextcloud permissions allow this flow and that exposing or saving user API keys this way matches the organization's security policy.

### Admin Settings

The admin settings section is named `Boudica AI` and includes:

- API Key
- API Endpoint
- User ID

The form is served by `AdminSettings` and `templates/admin.php`. The save button calls:

```text
/apps/boudicaai/settings
```

The route is registered as:

```text
POST /settings -> settings#save
```

Settings are stored as app values:

- `boudicaai.api_key`
- `boudicaai.api_endpoint`
- `boudicaai.user_id`

### Installation Checklist

1. Copy `nextcloud/boudicaai` into the Nextcloud apps directory if it is not already there.
2. Ensure file ownership and permissions match the Nextcloud deployment.
3. Install frontend dependencies and build assets if deploying from source.
4. Enable the app.
5. Run any required Nextcloud upgrade/migration command.
6. Open the Nextcloud Apps UI and confirm `Boudica Ai` is enabled.
7. Open the app from the navigation menu.
8. Configure admin settings.
9. Confirm browser console initialization messages do not show duplicate startup errors.
10. Send a test chat message through the app UI.

### User Guide

Open the Boudica app from the Nextcloud navigation.

Use Chat for direct questions and assistant-style work. Depending on the deployed UI module, users can maintain local chat history, use shared sessions, copy responses, use HTML preview behavior, and interact with scheduled or stored actions.

Use Documents for document-related workflows. This area is intended for upload, document analysis, and RAG-style document context. The `rag-upload.js` and `document-handler.js` modules are loaded by the current template and should be treated as the document workflow entry points.

Use Emails for email assistance. The Talk listener can summarize email search results from the Mail app when invoked from Talk. The app UI has a dedicated Emails view/module surface for direct email assistance workflows.

Use Calendar for calendar assistance. The Talk listener can summarize calendar rows from the Calendar app when invoked from Talk. The app UI has a dedicated Calendar view/module surface for direct calendar assistance workflows.

Use Settings for local preferences and integration settings visible to the user. Administrators use the Nextcloud administration settings for app-level endpoint configuration.

### Integration Notes for Developers

The Vue `src/` UI and the plain JavaScript `js/` UI both exist in the app. Before adding new user-facing behavior, confirm which asset pipeline is active in the deployment:

- If the deployed template loads built Vue assets, extend `src/App.vue` and `src/components/*`.
- If the deployed template loads plain JavaScript modules from `js/`, extend the relevant module there.

`ApiController.php` currently exposes only an example API response. The UI documentation lists intended endpoints such as chat, documents, emails, calendar, and settings, but these are not fully implemented in `ApiController.php` in this workspace. Existing chat functionality appears to call the external Boudica endpoint directly from browser-side JavaScript.

Recommended server-side API endpoints to add if moving more logic behind the app:

- `POST /api/v1/chat`: send a user prompt to Boudica and return a response.
- `GET /api/v1/documents`: list indexed or uploaded documents.
- `POST /api/v1/documents`: upload a document for analysis or indexing.
- `GET /api/v1/documents/{id}`: retrieve document details.
- `GET /api/v1/emails`: search/list user mail context.
- `GET /api/v1/calendar`: search/list user calendar context.
- `GET /api/v1/settings`: retrieve user settings.
- `POST /api/v1/settings`: save user settings.

### Security Considerations

- API keys should be treated as secrets.
- Avoid exposing app-level credentials to users unless that is explicitly intended.
- Review whether direct browser calls to `https://boudi.ca/api/boudica` are appropriate for the deployment.
- Prefer server-side proxying when endpoint credentials should not be visible in browser storage or network traces.
- Review the use of user config OCS endpoints for storing Boudica API keys.
- Ensure SAML/session data in local storage is scoped and cleared correctly when users sign out.
- Confirm CSP allows only required Boudica hosts.

### Troubleshooting

If the app does not appear in navigation:

- Confirm `appinfo/info.xml` is valid.
- Confirm the app id is `boudicaai`.
- Confirm the app is enabled.
- Confirm the Nextcloud version is between the declared min and max versions.

If the page opens but UI scripts fail:

- Check the browser console for missing script or initialization errors.
- Confirm scripts referenced in `templates/index.php` exist under `js/`.
- Confirm CSS exists under `css/`.
- Confirm built Vue assets are available if the deployment expects the Vite build output.

If chat requests fail:

- Check the configured API base URL.
- Check whether the request is going to `/api/boudica/chat` or another endpoint.
- Confirm the user has a Boudica API key.
- Confirm the API supports the payload fields used by `chat-api.js`.
- Check CORS and CSP if requests are made directly from the browser.

If auto-signup fails:

- Confirm the user is logged into Nextcloud.
- Confirm `OC.getCurrentUser()` returns a user object.
- Confirm the signup endpoint is reachable.
- Confirm the OCS config endpoints are permitted for the current user/deployment.

## 3. Collabora Online Office Application Integration

### Purpose

The Collabora integration adds Boudica AI directly into the Collabora Online document editor. Users can ask questions about the current document, summarize selections, summarize whole documents, generate new content, find terms in the document, and insert AI responses back into the open document.

The integration is browser-side JavaScript injected into Collabora's `cool.html` page.

### Main Files

- `src/cool.html`: Collabora Online HTML shell with the Boudica widget script and `window.BoudicaConfig` block added in the document head.
- `src/boudica_widget.js`: embeddable floating chat widget for Collabora Online.
- `src/boudica.js`: alternate/native toolbar-style integration that adds a slim Boudica toolbar to the document container.

The root `cool.html` in this workspace also includes the widget script and configuration block.

### Deployment Model

Collabora Online serves `cool.html` and related browser assets from its browser distribution directory. The exact path depends on packaging and version, but the code comments identify a typical target:

```text
/usr/share/coolwsd/browser/dist/
```

To deploy the widget-style integration:

1. Copy `src/boudica_widget.js` into the same directory as the served Collabora `cool.html`.
2. Add the script tag to the `<head>` of `cool.html`:

```html
<script type="text/javascript" src="boudica_widget.js" defer></script>
```

3. Add the configuration block after the script tag:

```html
<script>
  window.BoudicaConfig = {
    apiEndpoint: 'https://boudi.ca/api/boudica',
    position: 'bottom-right',
    marginTop: null,
    marginBottom: null,
    marginLeft: null,
    marginRight: null,
    accentColor: '#B8860B',
    autoOpen: false
  };
</script>
```

4. Reload Collabora Online and open a document.
5. Confirm the floating Boudica button appears.

### Configuration Reference

`window.BoudicaConfig` supports these settings:

- `apiEndpoint`: base Boudica API endpoint. The widget appends `/chat` for chat requests.
- `position`: widget placement; supported values are `bottom-right`, `bottom-left`, `top-right`, and `top-left`.
- `marginTop`: optional top margin override.
- `marginBottom`: optional bottom margin override.
- `marginLeft`: optional left margin override.
- `marginRight`: optional right margin override.
- `accentColor`: primary widget color.
- `accentColorEnd`: optional secondary gradient color.
- `autoOpen`: whether the chat window opens automatically on page load.
- `maxTokens`: maximum Boudica response tokens.
- `temperature`: model temperature.
- `topK`: top-k sampling setting.
- `topP`: top-p sampling setting.
- `requestTimeout`: browser request timeout in milliseconds.

Defaults from `boudica_widget.js` include:

```text
apiEndpoint: /api/boudica
position: bottom-right
accentColor: #B8860B
maxTokens: 35000
temperature: 0.8
topK: 50
topP: 0.9
requestTimeout: 120000
```

### Authentication and User Identity

The widget expects Boudica session data in browser local storage:

```text
boudica_session
```

It parses that value as JSON and reads:

- `session.token` as the API key.
- `session.email` as the user id/email.

If no API key is present, the widget alerts the user:

```text
No Boudica API key found. Please load the Boudica Main App to automatically finish your setup.
```

This means the usual user path is:

1. Sign into the Boudica/Nextcloud experience that creates or stores `boudica_session`.
2. Open a Collabora document in the same browser context.
3. Use the Boudica Collabora widget.

### User Guide: Floating Widget

When the widget is loaded, users see a floating Boudica chat button. Opening it displays a chat window attached to the Collabora document.

Users can ask normal questions, for example:

```text
Summarize this document
What are the action items in this document?
Find "budget forecast"
Rewrite this section in a more formal tone
Create a short executive summary for this document
Insert the last response
```

The widget detects document-oriented phrases and decides whether to use selected text, the whole document, or previous context.

### Selection-Based Workflows

When a user asks about `this section`, `this paragraph`, `the selection`, `selected text`, or highlighted content, the widget calls Collabora's internal selection API:

```text
gettextselection mimetype=...
```

For spreadsheets it requests:

```text
application/x-libreoffice-markdown-annotated
```

For other document types it requests:

```text
text/markdown;charset=utf-8
```

The selected text is appended to the user's prompt before being sent to Boudica.

Examples:

```text
Summarize this section
Rewrite the selected paragraph for a legal audience
Make this highlighted text shorter
Turn this section into bullet points
```

### Whole-Document Workflows

When a user asks about `the document`, `this document`, or similar phrases, the widget exports the document through Collabora's `downloadAs` flow and fetches the resulting text with browser credentials.

Export format depends on the document type:

- Spreadsheets: `csv`
- Writer documents: `txt`
- Presentations: `fodp`, then XML tags are stripped from the exported content
- Other documents: selection-all fallback using available text mimetypes

Examples:

```text
Summarize this document
What risks are in the document?
Create an FAQ from the document
Draft a project brief using this document
```

### Find in Document

If the message contains `find`, the widget tries to extract the search term and uses Collabora's search service:

```text
app.searchService.highlightAll(searchTerm)
```

Examples:

```text
Find budget forecast
Find "Q4 revenue"
Find all instances of compliance review in this document
```

The widget highlights matching occurrences and responds in the chat window without calling the Boudica API.

### Inserting AI Responses into the Document

The widget stores generated responses in an in-memory response list for the current session. Users can ask it to insert content back into the document.

Examples:

```text
Insert the last response
Insert this response
Insert the first answer
```

Insertion is done by sending a paste message over the Collabora socket:

```text
paste mimetype=text/markdown;charset=utf-8
```

The widget then focuses the editor so the inserted content appears at the current cursor position.

### Streaming Responses

The widget calls the Boudica chat endpoint with `stream: true`. The request body includes:

- `prompt`
- `message`
- `session_id`
- `user_id`
- `user_email`
- `stream`
- `api_key`
- `temperature`
- `max_tokens`
- `use_rag`

The widget reads the streaming response body with `ReadableStream.getReader()` and updates the assistant bubble as tokens arrive.

The widget prefixes outbound model prompts with:

```text
No Memory.
```

### Native Toolbar Variant

`src/boudica.js` implements a toolbar-style integration rather than a floating chat widget. It waits until these Collabora globals are present:

```javascript
window.app && window.app.socket && window.app.map
```

It then appends a slim toolbar to the document container with buttons for:

- Summarize Document
- Summarize Section
- Create Section
- Ask

The toolbar variant uses similar internal helpers:

- `fetchSelectedText()`
- `downloadDocumentAsText()`
- `insertTextAtCursor()`
- `sendBoudicaMessageStreaming()`

Choose one integration style for production unless the desired user experience explicitly requires both.

### Collabora Internal APIs Used

The integration relies on Collabora browser runtime objects and socket behavior:

- `window.app`
- `app.socket`
- `app.map`
- `app.map.downloadAs()`
- `app.map.on('postMessage', ...)`
- `app.map.on('textselectioncontent', ...)`
- `app.map.on('complexselection', ...)`
- `app.socket.sendMessage()`
- `app.searchService.highlightAll()`
- `app.map.sendUnoCommand('.uno:SelectAll')`

Because these are Collabora internal/browser APIs, they should be tested when upgrading Collabora Online.

### End-to-End User Workflows

Summarize an entire document:

1. Open a document in Collabora Online.
2. Open the Boudica widget.
3. Type `Summarize this document`.
4. Wait for the streaming response.
5. Optionally type `Insert the last response` to place it at the cursor.

Summarize selected text:

1. Highlight text in the document.
2. Open the widget.
3. Type `Summarize this section`.
4. Review the response.
5. Insert or copy the response as needed.

Generate new content:

1. Place the cursor where the new content should go.
2. Ask Boudica to create content, for example `Create a short introduction for a board report`.
3. Review the generated response.
4. Ask `Insert the last response`.

Find text:

1. Open the widget.
2. Type `Find "contract renewal"`.
3. Review highlighted matches in the document.

### Administrator Checklist

1. Confirm Collabora Online is working without the Boudica integration.
2. Confirm users can open and edit documents.
3. Copy `boudica_widget.js` to the served Collabora browser directory.
4. Add the script tag and `window.BoudicaConfig` block to the active `cool.html`.
5. Confirm the configured Boudica API endpoint is reachable from user browsers.
6. Confirm the Boudica session/API key is available in local storage before opening Collabora.
7. Open a text document and test a selection summary.
8. Open a spreadsheet and test a document summary.
9. Open a presentation and test export/summary behavior.
10. Test insert behavior in an editable document.
11. Test read-only documents to confirm insert behavior fails gracefully or is disabled by policy.

### Security Considerations

- The widget runs in the Collabora browser context.
- API keys stored in local storage are accessible to JavaScript running in that origin.
- Whole-document requests may send document text to the configured Boudica endpoint.
- Selection requests may send confidential selected text to the configured Boudica endpoint.
- Streaming responses and prompts are visible in browser developer tools.
- If the API endpoint is cross-origin, CORS and CSP must be configured correctly.

Recommended controls:

- Serve the widget only from trusted Collabora assets.
- Keep the API endpoint on an approved domain.
- Use HTTPS for all endpoints.
- Avoid long-lived API keys in local storage where possible.
- Document user consent and data handling rules for document export to AI.
- Test integration behavior after every Collabora Online upgrade.

### Troubleshooting

If the widget does not appear:

- Confirm `boudica_widget.js` is served from the same path referenced in `cool.html`.
- Check the browser network tab for 404 errors.
- Confirm the script tag is inside the active served `cool.html`, not only a source copy.
- Check the browser console for syntax errors.

If the widget appears but cannot call Boudica:

- Confirm `window.BoudicaConfig.apiEndpoint` is correct.
- Confirm the endpoint supports `/chat` under the configured base URL.
- Confirm the user has `boudica_session` in local storage.
- Confirm `session.token` is present.
- Check CORS errors in the browser console.

If document text cannot be retrieved:

- Confirm the document has finished loading.
- Confirm `window.app`, `app.socket`, and `app.map` are available.
- Try a simple text document first.
- Check for `Selection fetch timeout`, `Download timeout`, or `complexselection` errors in the console.

If insertion fails:

- Confirm the document is editable, not read-only.
- Place the cursor in the document body before inserting.
- Confirm Collabora accepts `paste mimetype=text/markdown;charset=utf-8` in the deployed version.

If document export fails:

- Confirm the user has permission to download/export the document.
- Confirm Collabora's `downloadAs` behavior has not changed in the deployed version.
- Check network requests for the generated export URL.

### Integration Testing Matrix

Test these combinations before production rollout:

| Area | Test | Expected Result |
| --- | --- | --- |
| Authentication | User opens Collabora after Boudica app login | Widget finds API key in `boudica_session` |
| Writer document | Summarize selected text | Selected text is sent and summarized |
| Writer document | Summarize whole document | Text export is sent and summarized |
| Spreadsheet | Ask about this document | CSV export is sent and summarized |
| Presentation | Ask about this document | FODP export is cleaned and summarized |
| Search | `Find "term"` | Matching document terms are highlighted |
| Insert | `Insert the last response` | Response is pasted at cursor |
| Read-only document | Insert attempt | Insert is blocked or no document mutation occurs |
| Long response | Streaming response | Chat bubble updates progressively |
| Endpoint failure | Invalid API URL | User-visible error is shown and console contains failure detail |

## Operational Summary

The three integrations serve different user moments:

- Talk integration is best for room-based assistant help, team summaries, and quick access to calendar/email context from a conversation.
- The Boudica Nextcloud app is the main application surface for chat, settings, documents, RAG, scheduling, and broader user workflows.
- The Collabora integration is best for in-document assistance where the user wants the model to work with selected text or the whole open office document.

For production hardening, prioritize these items:

1. Verify the Talk event registration and edit/delete payload handling on the target Nextcloud/Talk version.
2. Decide whether Boudica API calls should be proxied server-side instead of sent directly from browser JavaScript.
3. Review API key storage and lifecycle across Nextcloud, local storage, and Collabora.
4. Implement or remove placeholder Nextcloud API endpoints so the documented app surface matches runtime behavior.
5. Add deployment-specific CSP/CORS rules for the final Boudica endpoint.
6. Test the Collabora internal API calls against the exact Collabora Online version in production.