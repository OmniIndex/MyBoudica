# Boudica AI in MyBoudica: User Guide

**Version 2.0, October 2026** (replaces the August 2026 guide, which described screens and commands that no longer exist)

Boudica AI is your organisation's private AI assistant in MyBoudica. It runs on your organisation's own servers; your conversations are not sent to any outside AI service.

This guide covers the **Boudica AI** app. For Talk and for documents in MyBoudica Office, see the short "Boudica AI User Guide" (BOUDICA_USER_GUIDE.md).

## Contents

1. Opening Boudica AI
2. The screen
3. Asking questions
4. Managing conversations
5. Attaching files
6. Voice input
7. Asking for files and images
8. Rules and slash commands
9. Scheduled actions
10. The knowledge base
11. Connected services
12. Agents
13. Collaboration
14. Display settings
15. Privacy
16. Troubleshooting
17. What changed since the August 2026 guide

## 1. Opening Boudica AI

1. Sign in to MyBoudica with your organisation account.
2. Click **Boudica AI** in the top bar.

You are signed in with the same account; there is no separate password, sign-up or API key to set up. To sign out, sign out of MyBoudica.

## 2. The Screen

### Sidebar (left)

| Section | What it contains |
|---|---|
| **New Chat** | Starts a new conversation |
| **Actions** | Prompts you have scheduled to run by themselves |
| **Rules** | Saved instructions you can reuse |
| **Collaboration** | Shared chats, users you can message, your In-Box and sent messages |
| **Chats** | Your conversations, with **Search conversations...** and folders |

Click a section heading to open or close it.

### Header (top)

| Button | What it does |
|---|---|
| **☰** | Shows or hides the sidebar |
| **Agents** | Run an agent, or create your own |
| **Connected Services** | Link your own accounts (email, calendar and so on) |
| **Knowledge Base** | Browse and upload documents for your organisation |
| **Help & FAQ** | Answers about the chat screen |
| **High Contrast** | High-contrast display (**Ctrl + Shift + H**) |
| Moon/sun switch | Dark or light mode (**Ctrl + Shift + D**) |

### Message bar (bottom)

| Element | What it does |
|---|---|
| Message box | Type here. **Enter** sends, **Shift + Enter** adds a new line. Up to 4,000 characters. |
| **Private** | Marks the message private (see section 15) |
| **Verbatim** | Boudica answers only with exact quotes from the documents it found |
| Paperclip (**Attach documents**) | Attach files to this message |
| Microphone (**Voice input**) | Speak your message |
| **Send** | Sends the message; while Boudica answers it becomes **Stop** |

## 3. Asking Questions

1. Type your question, for example *Summarise our expenses policy*.
2. Press **Enter**.

You see short waiting words while Boudica works, then the answer. Click **Stop** to cancel.

**Your documents are always searched.** Boudica looks in your organisation's knowledge base for every question; there is no "use RAG" phrase to type. When it answers from documents, it lists them under **References**. When nothing relevant is found, it says so and answers from general knowledge.

**Exact wording:** tick **Verbatim** before sending when exact wording matters, for example for a policy or contract.

**Thinking harder:** start the message with `\reasoning` (a backslash) and a level: `low`, `medium`, `high` or `xhigh`. For example: `\reasoning high Compare the three supplier quotes`. Higher levels take longer.

**Earlier messages:** in the empty message box, the **up arrow** brings back a message you sent earlier and the **down arrow** moves forward again.

### Under each answer

Hover over an answer to see:
- **Copy response**
- **Print this response**
- **Resend last prompt**, which asks again for a fresh answer (same as `/redo`)
- stars to rate the answer from 1 (Poor) to 5 (Excellent)
- **Toggle view**, which switches between the formatted answer and its source text

## 4. Managing Conversations

- Every conversation is saved under **Chats**, newest first. Up to **100** are kept; after that the oldest are removed.
- **New conversation:** click **New Chat**, or type `/new`.
- **Rename:** double-click the title in **Chats**, type the new name, press **Enter**.
- **Search:** type in **Search conversations...**.
- **Folders:** click **New Folder** at the top of **Chats**, then drag conversations onto it.

## 5. Attaching Files

1. Click the paperclip or drag files onto the chat. Hold **Ctrl** (**Cmd** on a Mac) to pick several.
2. Type your question, for example *List any clauses that mention termination*.
3. Send.

Attached files are used for that conversation only; they are not added to the knowledge base. Boudica still searches the knowledge base too, and says which part of the answer came from which source.

**Supported:** PDF, Word (.docx, .doc), OpenDocument (.odt, .ods, .odp), RTF, text, Markdown, log files, Excel (.xlsx, .xls), CSV, PowerPoint (.pptx, .ppt), JSON, XML, HTML and images (JPG, PNG, GIF, WebP). Up to **50 MB** per file.

## 6. Voice Input

1. Click the microphone.
2. Speak your message.
3. When you stop speaking, the message is sent by itself.

Voice input works best in Chrome or Edge.

## 7. Asking for Files and Images

Ask in ordinary words and Boudica creates a file to download:

| You ask for | You get |
|---|---|
| "Create a PDF report on …" | PDF |
| "Write a Word document about …" | Word (.docx) |
| "Make a PowerPoint presentation on …" | PowerPoint (.pptx) |
| "Create a spreadsheet with …" | Excel (.xlsx) |
| "Generate an ebook about …" | EPUB |

**Images:** ask, for example, *Create an image of a lighthouse at dawn*. Save it straight away (right-click, **Save image as**); generated images are deleted from the server about a minute after they are shown. Image generation must be switched on for your organisation.

To write or change a document you have open in MyBoudica Office, use the Boudica assistant inside the document instead (see BOUDICA_USER_GUIDE.md).

## 8. Rules and Slash Commands

A **Rule** is a saved instruction, such as *Answer in a formal, professional tone*.

- **Create:** under **Rules**, click **+ New Rule**, enter a **Rule Name** and the **Rule Text**, click **Save**. Rules are stored with your account and follow you to any device.
- **Use:** click the rule in the sidebar, type `/` and pick it, or write `use Formal` (or `add` / `include` and the rule's name) in your message.

| Command | What it does |
|---|---|
| `/help` | Lists the commands |
| `/new` | Starts a new conversation |
| `/clear` | Clears the current conversation |
| `/redo` | Sends your last message again |
| `/private` | Ticks or unticks **Private** |
| `/export` | Downloads the conversation as a .txt file |
| `/<rule name>` | Inserts that rule |

## 9. Scheduled Actions

A scheduled action is a prompt that runs by itself, for example a summary every weekday morning.

1. Under **Actions**, click **New Action**.
2. Enter a **Title** and the **Prompt**.
3. Pick the **Days** (or **Weekdays**, **Weekend**, **Every day**) and a **Time**.
4. Click **Save**.

You can also add a schedule to the end of a message, for example *Summarise new support tickets run daily at 8am*. Boudica then saves it as an action instead of answering straight away.

Results appear under the action in **Actions**. **Actions run in your browser:** Boudica AI must be open in a browser tab at the scheduled time, or the action does not run.

## 10. The Knowledge Base

There are two places for documents, depending on who should see them:

| For | Where | How |
|---|---|---|
| **Just you** | **Files** → **Boudica AI Knowledge Base** | Upload or move documents into that folder |
| **Your organisation** | **Knowledge Base** button in the Boudica AI header → **public** folder | Click **Upload files**, or **Upload a folder** to keep the folder structure. Up to **100 MB** per file. |

Only documents in a **public** folder can be quoted to everyone in your organisation; other folders are restricted by default. Do not put personal or confidential files in a shared folder. In the Knowledge Base window you can also create folders and rename, download or delete files.

New documents are usually ready to answer from within a minute or two. To update a document, upload the new version over the old one.

## 11. Connected Services

Connected services let Boudica read live data from your own accounts, such as email or calendar, when you ask.

1. Click **Connected Services** in the header.
2. Click **Connect** next to the service and sign in.
3. Approve the access it asks for.

Then ask, for example, *What meetings do I have tomorrow?* Boudica reads the service for that question only and does not copy the data into the knowledge base. Click **Disconnect** to remove access. Your administrator decides which services are in the list; if it is empty, none have been added yet.

## 12. Agents

An agent is a saved set of steps, for example "query the sales database, then write a summary".

- **Run one:** click **Agents** in the header and click the agent's **Run** button, or type `@` and the agent's name, for example `@weekly_report for the EMEA region`.
- Agents run only when you call them like this. An ordinary question is answered normally.
- **Make your own:** click **Agents**, then **Create Agent** under **My Agents**. Fill in the **Agent name** (used as `@name`, no spaces), **Display name** and **Description**, and add steps with **+ Add Step**. Your own agents are visible only to you.
- **Organisational Agents** are set up by an administrator.

## 13. Collaboration

**Shared chats** are conversations with Boudica that several people take part in. Everyone sees the questions and answers.
1. Under **Collaboration**, open **Shared** and click **+** (**New shared chat**).
2. Give it a title and add the people to invite. Use **+ Invite** to add someone later.

Start a message with `@` (for example *@Meeting moved to 3pm*) to post a note to the group without asking Boudica.

**Messages to colleagues:** under **Collaboration**, click the colleague's name in **Users**, write a subject and message, and click **Send**. Click **Add Chat** to include the current conversation. Messages you receive are in the **In-Box**.

## 14. Display Settings

- **Dark mode:** the moon/sun switch, or **Ctrl + Shift + D**. Your choice is remembered.
- **High contrast:** the contrast button, or **Ctrl + Shift + H**.
- **More room:** click **☰** to hide the sidebar.
- **Escape** closes any open window or panel.

On a Mac, use **Cmd** instead of **Ctrl**.

## 15. Privacy

- Boudica runs on your organisation's own servers and does not send your conversations to outside AI services.
- Other users cannot see your conversations. Your administrators can see usage logs for audit and compliance.
- Boudica may use relevant parts of **your own** earlier conversations when it helps. It never shows you anyone else's.
- **Private:** tick **Private** (or type `/private`) before sending. A private message is left out when Boudica recalls earlier conversations, and its answer is never reused for anyone else.

## 16. Troubleshooting

| Problem | What to do |
|---|---|
| An answer is slow | Long answers, files and agents can take a minute or more, especially when many people use Boudica. The waiting words show it is still working. Click **Stop** to cancel. |
| The screen looks wrong or a button is missing after an update | Reload the page without the cache: **Ctrl + Shift + R** (**Cmd + Shift + R** on a Mac). |
| Boudica says it found nothing in the knowledge base | Check the document is in the right place (section 10) and wait a couple of minutes after uploading. Use words that appear in the document. |
| A file is rejected | Check it is a supported type and under 50 MB (100 MB for knowledge base uploads). |
| The microphone does nothing | Allow microphone access in the browser, or use Chrome or Edge. |
| A scheduled action did not run | Boudica AI must be open in a browser tab at the scheduled time. |
| A connected service stops working | Click **Disconnect**, then **Connect** again and sign in. |
| A generated image has gone | Images are deleted about a minute after they are shown. Ask again and save it straight away. |

For anything else, contact your administrator with the time, the question you asked and what happened.

## 17. What Changed Since the August 2026 Guide

If you used the earlier guide, note that:
- There are no Home, Documents, Emails, Calendar or Settings areas. Everything happens in the chat. Ask about email or calendar after connecting the service (section 11).
- You don't need "use RAG", "with RAG" or "no memory" phrases. The knowledge base is always searched.
- The knowledge base is the **Knowledge Base** window (organisation) or the **Boudica AI Knowledge Base** folder in Files (just you). It's not a panel with storage quotas.
- Answers are rated with 1 to 5 stars, not thumbs up or down. Messages can't be edited or deleted after sending.
- There is no separate login, logout button, sign-up or API key in the app.
- Scheduled actions are created with **New Action** or by adding "run daily at 8am" to a message.
- Agents run only when called with `@name` or the **Run** button.
