# Boudica AI User Guide

This guide explains how to use Boudica AI from three places:

1. Nextcloud Talk
2. The Boudica AI Nextcloud app
3. Collabora Online Office

It focuses only on user flows and commands.

## 1. Nextcloud Talk

Use Boudica in Talk by mentioning `boudica` or `@boudica` in a room message. Boudica replies in the same conversation.

You do not need a slash command. Write a normal message that includes Boudica's name.

### Basic Flow

1. Open a Nextcloud Talk conversation.
2. Type a message that includes `boudica` or `@boudica`.
3. Add the question or task after the name.
4. Send the message.
5. Read Boudica's answer in the Talk thread.

Example:

```text
@boudica what did we decide about the launch plan?
```

If you type only `@boudica`, Boudica asks what you would like help with.

### General Questions

Use Boudica for normal assistant questions inside a Talk room.

Examples:

```text
@boudica explain the options we discussed
boudica help me draft a reply to this conversation
@boudica what are the open questions here?
boudica turn this discussion into action items
@boudica write a short follow-up message for the team
```

### Summarize a Talk Conversation

Ask Boudica to summarize recent Talk activity.

Examples:

```text
@boudica summarize today
boudica summarize the last hour
@boudica summarize the last 3 hours
boudica summarize this morning
@boudica summarize this afternoon
boudica summarize all day
```

Useful variations:

```text
@boudica what decisions were made today?
boudica summarize the action items from the last hour
@boudica give me a brief recap of this morning
boudica what did I miss today?
```

### Calendar Requests

Use calendar words such as `calendar`, `schedule`, `events`, or `appointments`.

Examples:

```text
@boudica calendar today
boudica summarize my events this week
@boudica what is on my schedule tomorrow?
boudica show my appointments this month
@boudica summarize today's calendar
```

Supported time phrases include:

- `today`
- `tomorrow`
- `this week`
- `this month`

### Email Requests

Use `email` or `mail` in the message.

Examples:

```text
@boudica email from finance this month
boudica summarize my mail from yesterday
@boudica do I have any emails from Sarah today?
boudica find email about budget this week
@boudica summarize recent mail from support
```

Supported time phrases include:

- `last hour`
- `last 2 hours`
- `this morning`
- `this afternoon`
- `today`
- `yesterday`
- `this week`
- `last week`
- `this month`

### Shared Files in Talk

If someone shares a file in Talk and Boudica sees the message, Boudica can refer to the shared file by name in its understanding of the conversation.

Example:

```text
@boudica summarize what was shared and what we need to do next
```

### Useful Talk Command Patterns

Use these patterns as starting points:

```text
@boudica summarize [time period]
@boudica what did we decide about [topic]?
@boudica list action items from [time period]
@boudica calendar [time period]
@boudica summarize my events [time period]
@boudica email from [person/team] [time period]
@boudica find mail about [topic]
@boudica draft a response to [topic]
```

## 2. Boudica AI Nextcloud App

The Boudica AI app is the main Boudica workspace inside Nextcloud. Open it from the Nextcloud navigation by selecting `Boudica Ai`.

The app gives you a central place for chat, documents, email assistance, calendar assistance, settings, and related Boudica tools.

### Basic Flow

1. Open Nextcloud.
2. Select `Boudica Ai` from the app navigation.
3. Choose the area you want to use: Home, Chat, Documents, Emails, Calendar, or Settings.
4. Enter your question, upload or select content if needed, and review the answer.

### Home

Use Home as the launch point for the main Boudica workflows.

Common actions:

- Open Chat for direct questions.
- Open Documents for document analysis.
- Open Emails for email assistance.
- Open Calendar for event assistance.
- Open Settings for user preferences.

### Chat

Use Chat for direct questions and working sessions with Boudica.

Examples:

```text
Summarize this idea in plain English
Draft a response to this customer question
Create a checklist for onboarding a new user
Turn these notes into a project update
Explain the tradeoffs between these two options
```

Useful chat flows:

1. Ask an initial question.
2. Review the response.
3. Ask a follow-up question.
4. Refine the answer until it is ready to use.

Example flow:

```text
Draft a project update for the migration work
Make it shorter
Add risks and next steps
Make it suitable for executives
```

### Documents

Use Documents for document-centered work such as analysis, summarization, and retrieval-assisted questions.

Examples:

```text
Summarize this document
What are the key risks in this file?
Extract the action items
Turn this document into an FAQ
Create a short executive summary
Compare this document with the previous version
```

Useful document flows:

1. Open the Documents area.
2. Select or upload the document you want Boudica to use.
3. Ask a question about the document.
4. Review the answer.
5. Ask follow-up questions to refine the output.

### Emails

Use Emails for mail-related assistance.

Examples:

```text
Summarize my recent emails
Find emails about the renewal
What messages need a reply?
Draft a response to the latest customer email
Summarize emails from finance this week
List urgent items from today's mail
```

Useful email flows:

1. Open the Emails area.
2. Ask about a sender, topic, or time period.
3. Review the summary or draft.
4. Refine the response before sending or copying it.

### Calendar

Use Calendar for schedule and event assistance.

Examples:

```text
Summarize my calendar today
What meetings do I have tomorrow?
What should I prepare for this week?
List my appointments this month
Create a briefing for today's meetings
```

Useful calendar flows:

1. Open the Calendar area.
2. Ask about a time period.
3. Review the event summary.
4. Ask for preparation notes, risks, conflicts, or follow-up actions.

### Settings

Use Settings for user preferences and app behavior visible inside the Boudica app.

Typical user-level settings may include display preferences, notification options, and integration preferences depending on the deployed version.

### Useful App Command Patterns

Use these patterns in the app chat or relevant app area:

```text
Summarize [document/email/calendar period]
Find [topic/person/term]
Draft [message/reply/update]
Create [checklist/summary/report/FAQ]
Explain [topic] for [audience]
Rewrite this for [tone/audience]
List action items from [source]
What should I do next about [topic]?
```

### Working Style Tips

Ask Boudica for the outcome you want, not only the source material.

Instead of:

```text
Look at this
```

Use:

```text
Summarize this for an executive audience and include risks, decisions, and next steps
```

Instead of:

```text
Help with email
```

Use:

```text
Draft a polite reply that confirms receipt, asks for the missing attachment, and says I will respond by Friday
```

## 3. Collabora Online Office

The Collabora integration lets you use Boudica directly while editing office documents. You can ask about the open document, summarize selected text, summarize the whole document, find text, generate new content, and insert Boudica's response into the document.

### Basic Flow

1. Open a document in Collabora Online.
2. Open the Boudica floating chat widget.
3. Type a question or command.
4. Review the streaming response.
5. Optionally insert the response into the document.

### Common Commands

Examples:

```text
Summarize this document
Summarize this section
What are the action items in this document?
Find "budget forecast"
Rewrite this section in a more formal tone
Create a short executive summary for this document
Insert the last response
```

### Ask About Selected Text

Use this when you want Boudica to work only with highlighted content.

Flow:

1. Highlight text in the document.
2. Open the Boudica widget.
3. Ask about `this section`, `this paragraph`, `the selection`, or `selected text`.
4. Review the response.
5. Insert or copy the response if needed.

Examples:

```text
Summarize this section
Rewrite the selected paragraph for a legal audience
Make this highlighted text shorter
Turn this section into bullet points
Explain this paragraph in plain English
Translate this selected text into customer-friendly language
```

### Ask About the Whole Document

Use this when you want Boudica to read the full open document.

Examples:

```text
Summarize this document
What risks are in the document?
Create an FAQ from the document
Draft a project brief using this document
List all action items in this document
What are the main decisions in this document?
Create an executive summary of this document
```

### Find Text in the Document

Use `find` to highlight matching text in the open document.

Examples:

```text
Find budget forecast
Find "Q4 revenue"
Find all instances of compliance review in this document
Find renewal date
Find customer escalation
```

When you use a find command, Boudica highlights matching occurrences in the document instead of sending the request to the AI model.

### Generate New Content

Use Boudica to create new text that you can insert into the document.

Examples:

```text
Create a short introduction for a board report
Draft a conclusion for this document
Write a professional summary of the selected points
Create a table of action items from this section
Draft a customer-facing explanation of this proposal
Create a follow-up email based on this document
```

Flow:

1. Place your cursor where you may want the content to go.
2. Ask Boudica to create the content.
3. Review the answer in the widget.
4. Ask Boudica to insert the response if you want it added to the document.

### Insert Responses into the Document

After Boudica generates an answer, you can ask it to insert the answer into the document at your cursor position.

Examples:

```text
Insert the last response
Insert this response
Insert the first answer
Insert the last answer
```

Recommended flow:

1. Click where you want the text to appear.
2. Ask Boudica to generate the content.
3. Review the response.
4. Type `Insert the last response`.

### Summarize an Entire Document

Flow:

1. Open the document in Collabora Online.
2. Open the Boudica widget.
3. Type `Summarize this document`.
4. Wait for the response.
5. Optionally type `Insert the last response`.

### Summarize Selected Text

Flow:

1. Highlight the text you want summarized.
2. Open the Boudica widget.
3. Type `Summarize this section`.
4. Review the response.
5. Insert or copy it if needed.

### Rewrite Selected Text

Flow:

1. Highlight the text you want rewritten.
2. Ask for the tone or audience you want.
3. Review the response.
4. Insert the response if it is ready.

Examples:

```text
Rewrite this section for executives
Make this paragraph more concise
Rewrite the selected text in a warmer tone
Make this more formal
Turn this into plain English
```

### Spreadsheet Commands

Use document-level commands when working with spreadsheets.

Examples:

```text
Summarize this spreadsheet
What trends are visible in this document?
Find "total revenue"
Explain the key numbers in this spreadsheet
Create a summary of the rows in this sheet
```

### Presentation Commands

Use document-level commands when working with presentations.

Examples:

```text
Summarize this presentation
Create speaker notes for this document
What are the main points in this deck?
Draft an executive summary of this presentation
Find "roadmap"
```

### Useful Collabora Command Patterns

Use these patterns in the Boudica widget:

```text
Summarize this document
Summarize this section
Rewrite this section for [audience]
Make this selected text [shorter/more formal/clearer]
Create [intro/conclusion/summary/checklist] from this document
Find "[term]"
Insert the last response
```

### Best Flow for Document Editing

For most editing tasks:

1. Select the text or place your cursor.
2. Ask Boudica for a specific output.
3. Review the response.
4. Ask for changes if needed.
5. Insert the final response.

Example:

```text
Rewrite this selected paragraph for a customer update
Make it shorter
Add a clear next step
Insert the last response
```