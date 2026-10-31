# Boudica AI User Guide

**Version 2.0, October 2026** (replaces the August 2026 guide)

This is a short guide to using Boudica in three places in MyBoudica:

1. The **Boudica AI** app (the chat)
2. **Talk** (chat rooms and calls)
3. Documents in **MyBoudica Office** (Collabora Online)

For more detail on the chat, see the "Boudica AI in MyBoudica: User Guide" (NEXTCLOUD_BOUDICA_USER_GUIDE.md).

## 1. The Boudica AI App

### Opening it

1. Sign in to MyBoudica with your organisation account.
2. Click **Boudica AI** in the top bar.

There is no separate password. To sign out, sign out of MyBoudica.

### Asking a question

1. Type in the message box ("Send a message to Boudica...").
2. Press **Enter** to send (**Shift + Enter** adds a new line).

Boudica searches your organisation's knowledge base for every question; you do not need to type anything special. When it answers from your documents it names its sources. When it finds nothing relevant, it says so and answers from general knowledge.

While Boudica works you see short waiting words. Click **Stop** to cancel a long answer.

### Useful buttons

| Where | Button | What it does |
|---|---|---|
| Sidebar | **New Chat** | Starts a new conversation (or type `/new`) |
| Sidebar | **Chats** | Your saved conversations; double-click a title to rename it |
| Header | **Agents** | Run an agent, or create your own |
| Header | **Connected Services** | Link your email, calendar and other accounts |
| Header | **Knowledge Base** | Upload documents for your whole organisation |
| Message bar | **Private** | The message is left out when Boudica recalls earlier conversations, and its answer is never reused for anyone else |
| Message bar | **Verbatim** | Boudica answers only with exact quotes from your documents |
| Message bar | Paperclip | Attach files to this message (up to 50 MB each) |
| Message bar | Microphone | Speak your message; it is sent when you stop |
| Under an answer | Stars | Rate the answer from 1 (Poor) to 5 (Excellent) |

### Adding documents Boudica can answer from

- **Just for you:** open **Files** in MyBoudica, open the folder **Boudica AI Knowledge Base**, and upload or move your documents into it.
- **For your organisation:** in Boudica AI, click **Knowledge Base** in the header, open the **public** folder and click **Upload files**.

New documents are usually ready within a minute or two.

## 2. Talk

Boudica answers in a Talk conversation only when the Boudica bot is switched on for it and a message mentions `@boudica`. A moderator switches the bot on in the conversation's **Settings** → **Bots**.

| You write | Boudica does |
|---|---|
| `@boudica what is our travel expenses policy?` | Answers the question |
| `@boudica summarise today` | Summarises what was written today (without a period: the last hour) |
| `@boudica summarize call` | Summarises a recorded call, from its transcript |
| `@boudica what's on my calendar tomorrow?` | Reads your calendar |
| `@boudica find emails from Sam about the budget` | Searches your email |
| `@boudica track <label>` / `@boudica stop` / `@boudica replay` | Records the conversation's messages, stops, and shows them again |

Plain `boudica` without the `@` is not answered. Talk may be switched off on some MyBoudica sites.

## 3. Documents (MyBoudica Office)

### Opening the assistant

1. Open a document from **Files**.
2. Click the round Boudica button at the edge of the document window (**Open Boudica Assistant**).
3. Type in the panel and press **Enter**.

### What you can ask

| You type | What happens |
|---|---|
| "Summarise section 4 in plain English" | The answer appears in the panel; the document is not changed |
| `find "budget forecast"` | Every match is highlighted in the document |
| "Write a one-page document about …" (in a **new, blank** document) | Boudica writes the document. **This replaces everything in the open document.** |
| "Make a presentation from this document" | Boudica makes a slide deck and saves it next to the document as "<document name> – slides.pptx" |

Under each answer in the panel, click **Insert at cursor**, **New paragraph** or **Append to end** to put it in the document. You can also type "insert the last response".

At the top of the panel:
- **Add File** gives Boudica another file to work from.
- **PII Data** counts possible personal data in the document, such as email addresses, card numbers and National Insurance numbers. It doesn't change anything.
- The mode menu sets how much of a long document Boudica reads. **Document Mode** reads the most.

## Getting help

Ask Boudica itself, for example "How do I rename a chat?" or "How do I make a slide deck from a document?". The step-by-step "How do I…?" guides are available to every user. In Boudica AI, **Help & FAQ** in the header answers questions about the chat screen. For anything else, contact your administrator.
