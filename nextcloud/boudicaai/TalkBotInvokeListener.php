
Claude finished the response

Architected distributed cache system for tracking shared files
Architected distributed cache system for tracking shared files
Good call — here's the addition, keyed by room token with a TTL so a file dropped in on its own gets picked up by a later "@boudica" message.

1. Add a distributed cache for pending file shares, alongside the existing services:

php
use OCP\ICacheFactory;
use OCP\ICache;

private ICache $pendingFilesCache;

public function __construct(
    BoudicaService $boudicaService,
    TranscriptionService $transcriptionService,
    CallParticipantService $participantService,
    TranscriptEmailService $emailService,
    LoggerInterface $logger,
    IDBConnection $db,
    IUserManager $userManager,
    IRootFolder $rootFolder,
    ICacheFactory $cacheFactory
) {
    // ...existing assignments...
    $this->rootFolder = $rootFolder;
    // 5 minute window: a file shared alone gets picked up by a
    // "boudica" message that follows shortly after, in the same room.
    $this->pendingFilesCache = $cacheFactory->createDistributed('boudicaai_pending_files');
}
2. Two small helpers:

php
private function addPendingFileShares(string $token, array $shares): void {
    if (empty($shares)) {
        return;
    }
    $existingJson = $this->pendingFilesCache->get($token);
    $existing = $existingJson ? json_decode($existingJson, true) : [];
    $merged = array_merge($existing, $shares);
    $this->pendingFilesCache->set($token, json_encode($merged), 300); // 5 minutes
}

private function popPendingFileShares(string $token): array {
    $json = $this->pendingFilesCache->get($token);
    if (!$json) {
        return [];
    }
    $this->pendingFilesCache->remove($token);
    return json_decode($json, true) ?: [];
}
3. In the parameter loop — always cache non-audio file shares (not just when "boudica" is in this message):

php
$newFileShares = [];

if (isset($decoded['parameters']) && is_array($decoded['parameters'])) {
    foreach ($decoded['parameters'] as $placeholder => $param) {
        $type = $param['type'] ?? '';
        $name = $param['name'] ?? '';
        if ($type === 'file') {
            if ($this->isAudioFile($name)) {
                $this->storeCallRecordingFile($token, $messageId, $name, $param, $plainText);
            } else {
                $newFileShares[] = ['name' => $name, 'param' => $param];
            }
            $plainText = str_replace('{' . $placeholder . '}', '[shared file: ' . $name . ']', $plainText);
        } else {
            $plainText = str_replace('{' . $placeholder . '}', $name, $plainText);
        }
    }
}

if (!empty($newFileShares)) {
    $this->addPendingFileShares($token, $newFileShares);
}
(This runs regardless of the boudica keyword check, which happens later — so a bare file share just gets queued, no bot reply triggered, matching current behavior.)

4. At the keyword gate — pop and forward everything queued for this room:

php
if (!str_contains(strtolower($plainText), 'boudica')) {
    return;
}

$filesToForward = $this->popPendingFileShares($token);
foreach ($filesToForward as $shared) {
    $this->forwardSharedFileToBoudica($token, $shared['name'], $shared['param'], $message);
}

$sessionId = $token;
$prompt = trim(preg_replace('/@?boudica/i', '', $plainText));
How this behaves now:

File shared alone → queued silently, no reply, 5-minute TTL
"@boudica summarize" (no file in that message, but one was shared 30 seconds earlier) → pops the queued file(s), uploads them as context, then processes the prompt
File and "@boudica ..." text in the same message → still works, since the file gets added to the cache first, then immediately popped by the gate check a few lines later
File shared, then nothing said within 5 minutes → cache entry just expires, nothing forwarded, no cleanup needed
One thing worth deciding: should multiple files shared within the window all get forwarded together, or only the most recent one? As written it forwards all of them (accumulated via array_merge), which seems like the more useful default for a "here are some docs, boudica summarize these" flow — let me know if you'd rather cap it to just the latest file instead.

OK I need to kame sure that these all go in to teh correct places. Can you eitehr head up each code fragment with Filename position Or output file for me to save


Orchestrated comprehensive PHP file reorganization with precise placement guidance
Orchestrated comprehensive PHP file reorganization with precise placement guidance
Let me get the complete original file so I can produce full, ready-to-save files rather than fragments that risk being misplaced.


Devised practical labeling strategy for code fragment placement
Devised practical labeling strategy for code fragment placement
That's the safer approach — let me apply the edits directly to your actual uploaded files with precise find-and-replace, then hand you back complete, ready-to-save files rather than risk transcription errors from reproducing 1300+ lines by hand.


Ran a command
Ran a command
Now applying each change in order:


Add uploadFileContext() method to BoudicaService for multipart file uploads
Add uploadFileContext() method to BoudicaService for multipart file uploads
Now the listener — imports first:


Edited 2 files
Edited 2 files
Now the parameter loop — queue non-audio file shares instead of ignoring them:


Queue non-audio file shares into the pending cache instead of dropping them
Queue non-audio file shares into the pending cache instead of dropping them
Now the keyword gate — pop and forward queued files before processing the prompt:


Pop pending file shares and forward them once the boudica keyword gate passes
Pop pending file shares and forward them once the boudica keyword gate passes
Now add the three new private methods, placed right after logMessage():


Add pending-file-cache helpers and the file-forwarding method after logMessage()
Add pending-file-cache helpers and the file-forwarding method after logMessage()
Now let's verify both files are syntactically valid PHP before handing them over:


Ran 2 commands
Ran 2 commands
Braces balance in both files, and no PHP linter is available in this sandbox to do a full parse check — worth running php -l yourself once these are on the server, just as a final sanity check. Copying both to your outputs now:


Ran a command, read a file
Ran a command, read a file
Both are complete, ready to save over the originals at their existing paths:

custom_apps/boudicaai/lib/Service/BoudicaService.php
custom_apps/boudicaai/lib/Listener/TalkBotInvokeListener.php
Once uploaded, run php -l on both on your server to confirm they parse cleanly, then:

bash
docker exec -it nextcloud php occ app:disable boudicaai
docker exec -it nextcloud php occ app:enable boudicaai
to force Nextcloud to pick up the changes.


Boudicaservice
Code · PHP 

Talkbotinvokelistener
Code · PHP 
How can I check why teh file is not uploaded. The server (Boudica inference) logs have no sight of an upload:

[NEXTCLOUD_COLLABORA_INTEGRATION_GUIDE (1).md](https://myboudica.com/f/1831)
@boudica can you tell me what this file is about?

>_
Boudica (Bot)
Provide the file for analysis.

Diagnosed silent file upload failure and traced cache configuration issues
Diagnosed silent file upload failure and traced cache configuration issues
That "Provide the file for analysis" reply looks like it's coming from the LLM itself, not from your PHP code — meaning the chat prompt reached Boudica Inference but the RAG document context was empty, consistent with what you're seeing (no upload logged server-side). So the multipart POST from forwardSharedFileToBoudica() never actually landed. Let's find out why, step by step.

1. Check Nextcloud's log for the exact trail our new code leaves. Every step logs something — success or failure:

bash
docker exec -it nextcloud tail -200 /var/www/html/data/nextcloud.log | grep -i boudica
Or if that scrolls past too fast, filter live and trigger the flow again:

bash
docker exec -it nextcloud tail -f /var/www/html/data/nextcloud.log | grep -i boudica
Then re-share the file and send @boudica again. You're looking for one of these specific lines, which tells us exactly where it broke:

Boudica: file share param missing id, cannot forward. Raw param: ... → the id field assumption was wrong; the raw param dump will show the actual key names to fix
Boudica: could not resolve sender uid for file share... → the actor.id format assumption (users/<uid>) was wrong
Boudica: shared file id X not found in <uid>'s storage → file resolution via getById() failed
Boudica: could not open shared file ... for reading → file found but fopen() failed
Boudica: failed to upload file '...': (with an exception message) → the HTTP POST itself failed (network/TLS/endpoint issue)
Boudica: uploaded file '...' as context for session ... → this succeeded, meaning the problem is actually server-side, not in this code at all
2. If you see nothing at all with "boudica" in it around that time, that's the most useful signal — it means the event handler likely isn't even reaching this code, possibly because:

The file-share message and the @boudica message triggered BotInvokeEvent fine, but something threw before reaching the file-forwarding logic (check for any PHP fatal/TypeError near that timestamp, unrelated to "boudica" in the message text)
The distributed cache (pendingFilesCache) isn't actually persisting between the two separate requests — each BotInvokeEvent is a fresh HTTP request/process, so if Nextcloud's memcache.distributed isn't configured (Redis/Memcached), createDistributed() cache won't survive across requests. Check:
bash
docker exec -it nextcloud grep -A2 "memcache" /var/www/html/config/config.php
If that's empty/missing, the pending-file queue silently never persists, and popPendingFileShares() always returns empty — which matches exactly what you're seeing (bot responds as if no file was ever provided).

3. Also worth a direct connectivity check, same pattern as our earlier HPB debugging — confirm Nextcloud's container can actually reach the inference endpoint at all:

bash
docker exec -it nextcloud php -r "var_dump(file_get_contents('https://boudi.ca/api/boudica/chat', false, stream_context_create(['http'=>['method'=>'HEAD']])));"
or simpler, just check DNS/reachability:

bash
docker exec -it nextcloud curl -sv -o /dev/null https://boudi.ca/api/boudica
Run the log tail first and paste back whatever "boudica"-tagged lines show up around your test — that'll immediately tell us which of these it is.

That's strange — if you pasted it directly and it's still not coming through, this may just be a quirk of how this particular upload is being processed on my end, not something you're doing wrong. Sorry for the repeated back-and-forth on this.

Let's try a different angle — rather than fighting the paste/upload, can you just tell me directly what you saw in each of the three checks? Specifically:

Did any lines mentioning "boudica" show up at all in the Nextcloud log around the time you tested? Yes/no, and if yes, roughly what did they say (e.g. "missing id", "could not resolve sender", "failed to upload", or something else)?
What did the memcache grep return — anything, or was it empty/no matches?
What did the curl -sv to https://boudi.ca/api/boudica show — did it connect, and what HTTP status came back (or did it fail/timeout)?
Even a rough paraphrase of what you saw is enough for me to point you at the fix — we don't need the exact raw text.


Message collapsed

Investigated file-forwarding execution gaps and deployment status
Investigated file-forwarding execution gaps and deployment status
That log tells us a lot — and confirms the fix hasn't actually run yet. I see the prompt going straight to the LLM (Boudica full prompt for session dio8zzva: can you explain this documenbt?) with zero lines matching our new code — no "Boudica: file share param...", no "Boudica: could not resolve sender...", no "Boudica: uploaded file...", nothing. That's not a logic bug being hit — it's a sign the new code isn't running at all yet.

Most likely cause: the updated files were never actually deployed, or the app wasn't reloaded after copying them in. Let's verify:

1. Confirm the file on the server actually has the new code:

bash
docker exec -it nextcloud grep -c "forwardSharedFileToBoudica" /var/www/html/custom_apps/boudicaai/lib/Listener/TalkBotInvokeListener.php
If this returns 0, the file on the server is still the old version — the upload/copy into the container didn't happen or went to the wrong path.

2. Confirm the file path is actually right:

bash
docker exec -it nextcloud find /var/www/html/custom_apps/boudicaai -iname "TalkBotInvokeListener.php"
3. If the file is correct, force a full reload (PHP opcache can also hold a stale compiled version even after a file changes):

bash
docker exec -it nextcloud php occ app:disable boudicaai
docker exec -it nextcloud php occ app:enable boudicaai
docker restart nextcloud
(the restart clears any PHP opcache holding the old compiled bytecode — disable/enable alone doesn't always do this depending on your opcache config)

4. Then retest — share the file, send @boudica explain this, and re-check the log:

bash
docker exec -it nextcloud grep "Boudica:" /var/www/html/data/nextcloud.log | tail -20
Note the capital-B colon prefix ("Boudica: ...") — that's specifically our new code's log lines, distinct from the existing lowercase/other Boudica logging already in the file, so this grep should show only genuinely new activity if it's running.

Run step 1 first — that one grep count will tell us immediately whether we're chasing a logic bug or a deployment gap.







Claude is AI and can make mistakes. Please double-check responses.
Talkbotinvokelistener · PHP
Copied
<?php
 
declare(strict_types=1);
 
namespace OCA\BoudicaAi\Listener;
 
use OCA\Talk\Events\BotInvokeEvent;
use OCA\BoudicaAi\Service\BoudicaService;
use OCA\BoudicaAi\Service\TranscriptionService;
use OCA\BoudicaAi\Service\CallParticipantService;
use OCA\BoudicaAi\Service\TranscriptEmailService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IDBConnection;
use OCP\IUserManager;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;
 
class TalkBotInvokeListener implements IEventListener {
 
    private BoudicaService $boudicaService;
    private TranscriptionService $transcriptionService;
    private CallParticipantService $participantService;
    private TranscriptEmailService $emailService;
    private LoggerInterface $logger;
    private IDBConnection $db;
    private IUserManager $userManager;
    private IRootFolder $rootFolder;
    private ICache $pendingFilesCache;
 
    public function __construct(
        BoudicaService $boudicaService,
        TranscriptionService $transcriptionService,
        CallParticipantService $participantService,
        TranscriptEmailService $emailService,
        LoggerInterface $logger,
        IDBConnection $db,
        IUserManager $userManager,
        IRootFolder $rootFolder,
        ICacheFactory $cacheFactory
    ) {
        $this->boudicaService = $boudicaService;
        $this->transcriptionService = $transcriptionService;
        $this->participantService = $participantService;
        $this->emailService = $emailService;
        $this->logger = $logger;
        $this->db = $db;
        $this->userManager = $userManager;
        $this->rootFolder = $rootFolder;
        // Files shared without an accompanying "boudica" keyword are queued
        // here for a short window, so a follow-up "@boudica ..." message in
        // the same room can still pick them up as context.
        $this->pendingFilesCache = $cacheFactory->createDistributed('boudicaai_pending_files');
    }
 
    public function handle(Event $event): void {
        if (!($event instanceof BotInvokeEvent)) {
            return;
        }
 
        $message = $event->getMessage();
 
        if (!in_array($message['type'] ?? null, ['Activity', 'Create'], true)) {
            return;
        }
 
        $object = $message['object'] ?? [];
        $content = $object['content'] ?? '';
        $senderName = $message['actor']['name'] ?? 'someone';
        $token = $message['target']['id'] ?? null;
        $messageId = $object['id'] ?? null;
 
        $decoded = json_decode($content, true);
        $plainText = $decoded['message'] ?? $content;
 
        // Resolve {mention-xxx} / {file} / other placeholders using messageParameters.
        // File shares in particular carry a 'file' parameter with a 'name' field —
        // we surface that as readable text instead of a raw placeholder.
        $systemMessage = $decoded['systemMessage'] ?? ($object['systemMessage'] ?? null);
 
        $newFileShares = [];
 
        if (isset($decoded['parameters']) && is_array($decoded['parameters'])) {

            if (str_contains(strtolower($plainText ?? ''), 'file') || !empty($decoded['parameters'] ?? [])) {
                $this->logger->info('Boudica RAW parameters dump: ' . json_encode($decoded));
            }


            foreach ($decoded['parameters'] as $placeholder => $param) {
                $type = $param['type'] ?? '';
                $name = $param['name'] ?? '';
                if ($type === 'file') {
                    // Store reference to call recording files (audio files)
                    if ($this->isAudioFile($name)) {
                        $this->storeCallRecordingFile($token, $messageId, $name, $param, $plainText);
                    } else {
                        // Non-audio file share: queued, not forwarded yet.
                        // Only sent to Boudica Inference as context once a
                        // message containing "boudica" arrives — see the
                        // keyword gate further down, which pops these.
                        $newFileShares[] = ['name' => $name, 'param' => $param];
                    }
                    $plainText = str_replace('{' . $placeholder . '}', '[shared file: ' . $name . ']', $plainText);
                } else {
                    $plainText = str_replace('{' . $placeholder . '}', $name, $plainText);
                }
            }
        }
 
        if (!empty($newFileShares) && $token) {
            $this->addPendingFileShares($token, $newFileShares);
        }
 
        if (!$token) {
            return; // can't log or act without knowing which conversation this is
        }
 
        try {
            // NOTE: field names for systemMessage/parent on edit/delete events are our
            // best guess based on Talk's documented behaviour, not yet verified against
            // a real payload from this instance. If handleMessageEdit/Delete don't fire
            // correctly, this raw log line is what we need to see to fix the field paths.
            if ($systemMessage === 'message_edited') {
                $this->logger->info('Boudica saw an edit event, raw object: ' . json_encode($object));
                $this->handleMessageEdit($token, $object, $plainText);
            } elseif ($systemMessage === 'message_deleted') {
                $this->logger->info('Boudica saw a delete event, raw object: ' . json_encode($object));
                $this->handleMessageDelete($token, $object);
            } elseif ($systemMessage) {
                // Other system messages (calls started/ended, users added, etc.) —
                // log them descriptively for audit completeness rather than skip them.
                if (trim($plainText) !== '') {
                    $this->logMessage($token, $messageId, $senderName, '[system] ' . $plainText, true);
                }
            } elseif (trim($plainText) !== '') {
                $this->logMessage($token, $messageId, $senderName, $plainText, false);
            }
        } catch (\Throwable $e) {
            // Never let logging/audit failures break normal bot operation
            $this->logger->warning('Boudica message logging failed: ' . $e->getMessage());
        }
 
        if ($systemMessage) {
            return; // system messages (including edits/deletes) never trigger @boudica logic
        }
 
        if (!str_contains(strtolower($plainText), 'boudica')) {
            return;
        }
 
        // Message addresses boudica — forward any files shared in this room
        // (this message or a recent earlier one, within the pending window)
        // as context before the prompt itself is processed.
        $filesToForward = $this->popPendingFileShares($token);
        foreach ($filesToForward as $shared) {
            $this->forwardSharedFileToBoudica($token, $shared['name'], $shared['param'], $message);
        }
 
        $sessionId = $token;
        $prompt = trim(preg_replace('/@?boudica/i', '', $plainText));
 
        if ($prompt === '') {
            $event->addAnswer("Hi {$senderName}, what would you like me to help with?");
            return;
        }
 
        // Handle tracking commands
        if (preg_match('/^\s*track\s+/i', $prompt)) {
            $this->handleTrackStart($event, $token, $senderName);
            return;
        }
 
        if (preg_match('/^\s*stop\s*$/i', $prompt)) {
            $this->handleTrackStop($event, $token, $senderName);
            return;
        }
 
        if (preg_match('/^\s*replay\s*$/i', $prompt)) {
            $this->handleTrackReplay($event, $token, $senderName);
            return;
        }
 
        if (preg_match('/^\s*tracking\s+(status|info|details)\s*$/i', $prompt)) {
            $this->handleTrackingStatus($event, $token, $senderName);
            return;
        }
 
        if (preg_match('/^\s*summarize\s+call/i', $prompt) || preg_match('/^\s*call\s+summary/i', $prompt)) {
            $this->handleCallSummary($event, $prompt, $sessionId, $token);
            return;
        }
 
        if (preg_match('/^\s*transcribe/i', $prompt)) {
            $this->handleTranscribeCall($event, $prompt, $token);
            return;
        }
 
        if (preg_match('/summari[sz]e/i', $prompt)) {
            $this->handleSummarize($event, $prompt, $sessionId, $token);
            return;
        }
 
        if (preg_match('/calendar|schedule|events?|appointments?/i', $prompt)) {
            $this->handleCalendarSearch($event, $prompt, $sessionId);
            return;
        }
 
        $this->logger->info('Checking for email match: ' . $prompt);
        if (preg_match('/email|mail/i', $prompt)) {
            $this->logger->info('Email regex matched! Calling handleEmailSearch');
            $this->handleEmailSearch($event, $prompt, $sessionId);
            return;
        }
 
        try {
            $reply = $this->boudicaService->ask($prompt, $sessionId);
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica Talk bot failed: ' . $e->getMessage());
            $reply = "Sorry, I couldn't generate a response right now.";
        }
 
        $event->addAnswer($reply);
    }
 
    private function logMessage(string $token, ?string $messageId, string $actorName, string $message, bool $isSystem): void {
        $trackingSessionId = $this->getActiveTrackingSession($token);
        
        $qb = $this->db->getQueryBuilder();
        $qb->insert('boudicaai_messages')
           ->values([
               'token' => $qb->createNamedParameter($token),
               'message_id' => $qb->createNamedParameter($messageId),
               'actor_name' => $qb->createNamedParameter($actorName),
               'message' => $qb->createNamedParameter($message),
               'timestamp' => $qb->createNamedParameter(time(), \PDO::PARAM_INT),
               'is_system_message' => $qb->createNamedParameter($isSystem, \PDO::PARAM_BOOL),
               'tracking_session_id' => $qb->createNamedParameter($trackingSessionId, \PDO::PARAM_INT),
           ]);
        $qb->executeStatement();
    }
 
    /**
     * Queues non-audio file shares for a room, merging with anything already
     * pending. 5 minute TTL: a file shared alone gets picked up by a
     * "boudica" message that follows shortly after, in the same room.
     */
    private function addPendingFileShares(string $token, array $shares): void {
        if (empty($shares)) {
            return;
        }
        $existingJson = $this->pendingFilesCache->get($token);
        $existing = $existingJson ? json_decode($existingJson, true) : [];
        $merged = array_merge($existing, $shares);
        $this->pendingFilesCache->set($token, json_encode($merged), 300); // 5 minutes
    }
 
    /**
     * Pops (reads + clears) any file shares queued for this room. Called once
     * a "boudica" message arrives, so all files shared since the last such
     * message get forwarded together as context.
     */
    private function popPendingFileShares(string $token): array {
        $json = $this->pendingFilesCache->get($token);
        if (!$json) {
            return [];
        }
        $this->pendingFilesCache->remove($token);
        return json_decode($json, true) ?: [];
    }
 
    /**
     * Streams a Talk-shared file straight through to Boudica Inference as
     * multipart context via BoudicaService::uploadFileContext() — mirroring
     * exactly what boudica_widget.js does in callBoudicaAPI() when files are
     * attached. The file's bytes go up as a real multipart part, never read
     * into PHP and re-embedded as text/JSON context.
     *
     * ASSUMPTION TO VERIFY: Talk file-share message parameters carry an 'id'
     * key with the Nextcloud file id — standard shape, not yet confirmed
     * against a real payload here. If uploads silently never fire, log
     * json_encode($param) once to check the actual key names.
     */
    private function forwardSharedFileToBoudica(string $token, string $name, array $param, array $message): void {
        $fileId = $param['id'] ?? null;
        if ($fileId === null) {
            $this->logger->warning('Boudica: file share param missing id, cannot forward. Raw param: ' . json_encode($param));
            return;
        }
 
        // Talk actor ids for logged-in users are typically "users/<uid>".
        $actorId = $message['actor']['id'] ?? null;
        $senderUid = $actorId !== null && str_starts_with($actorId, 'users/')
            ? substr($actorId, 6)
            : null;
 
        if ($senderUid === null) {
            $this->logger->warning("Boudica: could not resolve sender uid for file share in room {$token} (actor: {$actorId})");
            return;
        }
 
        $stream = null;
        try {
            $userFolder = $this->rootFolder->getUserFolder($senderUid);
            $nodes = $userFolder->getById((int)$fileId);
            if (empty($nodes)) {
                $this->logger->warning("Boudica: shared file id {$fileId} ({$name}) not found in {$senderUid}'s storage");
                return;
            }
            /** @var \OCP\Files\File $file */
            $file = $nodes[0];
            $stream = $file->fopen('r');
            if ($stream === false) {
                $this->logger->warning("Boudica: could not open shared file {$name} for reading");
                return;
            }
 
            $this->boudicaService->uploadFileContext(
                $token,
                $name,
                $stream,
                "[File shared in Talk conversation: {$name}]"
            );
        } catch (NotFoundException $e) {
            $this->logger->warning("Boudica: shared file {$name} not found: " . $e->getMessage());
        } catch (\Throwable $e) {
            $this->logger->error("Boudica: error forwarding shared file {$name}: " . $e->getMessage());
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }
    }
 
    /**
     * Logs the edited content as a NEW row linked back to the original message_id,
     * and marks the original row's edited_at timestamp. The original content is
     * never overwritten — full edit history is preserved for audit purposes.
     *
     * ASSUMPTION TO VERIFY: parent message id/content location in $object['parent'].
     * Adjust once we see a real edit payload.
     */
    private function handleMessageEdit(string $token, array $object, string $newContent): void {
        $parent = $object['parent'] ?? null;
        $originalMessageId = $parent['id'] ?? null;
 
        if (!$originalMessageId) {
            $this->logger->warning('Boudica: could not determine original message_id for an edit event');
            return;
        }
 
        // Mark the original row as edited (does not touch its stored content)
        $update = $this->db->getQueryBuilder();
        $update->update('boudicaai_messages')
            ->set('edited_at', $update->createNamedParameter(time(), \PDO::PARAM_INT))
            ->where($update->expr()->eq('token', $update->createNamedParameter($token)))
            ->andWhere($update->expr()->eq('message_id', $update->createNamedParameter($originalMessageId)));
        $update->executeStatement();
 
        // Insert the edited content as its own linked row
        $insert = $this->db->getQueryBuilder();
        $insert->insert('boudicaai_messages')
            ->values([
                'token' => $insert->createNamedParameter($token),
                'message_id' => $insert->createNamedParameter($originalMessageId . '-edit-' . time()),
                'edit_of_message_id' => $insert->createNamedParameter($originalMessageId),
                'actor_name' => $insert->createNamedParameter($object['actor']['name'] ?? 'someone'),
                'message' => $insert->createNamedParameter($newContent),
                'timestamp' => $insert->createNamedParameter(time(), \PDO::PARAM_INT),
                'is_system_message' => $insert->createNamedParameter(false, \PDO::PARAM_BOOL),
            ]);
        $insert->executeStatement();
    }
 
    /**
     * Marks the original row as deleted (timestamp only) without touching its
     * stored content — the audit record of what was said is preserved even
     * though the message is no longer visible to users in Talk itself.
     *
     * ASSUMPTION TO VERIFY: parent message id location in $object['parent'].
     */
    private function handleMessageDelete(string $token, array $object): void {
        $parent = $object['parent'] ?? null;
        $originalMessageId = $parent['id'] ?? null;
 
        if (!$originalMessageId) {
            $this->logger->warning('Boudica: could not determine original message_id for a delete event');
            return;
        }
 
        $update = $this->db->getQueryBuilder();
        $update->update('boudicaai_messages')
            ->set('deleted_at', $update->createNamedParameter(time(), \PDO::PARAM_INT))
            ->where($update->expr()->eq('token', $update->createNamedParameter($token)))
            ->andWhere($update->expr()->eq('message_id', $update->createNamedParameter($originalMessageId)));
        $update->executeStatement();
    }
 
    private function handleSummarize(Event $event, string $prompt, string $sessionId, string $token): void {
        $sinceTimestamp = $this->parsePeriodToTimestamp($prompt);
 
        try {
            $transcript = $this->fetchTranscript($token, $sinceTimestamp);
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica fetchTranscript failed: ' . $e->getMessage());
            $event->addAnswer("Sorry, I couldn't retrieve the chat history right now.");
            return;
        }
 
        if (trim($transcript) === '' || strlen(trim($transcript)) < 30) {
            $event->addAnswer("There isn't much conversation in that period to summarize.");
            return;
        }
 
        $summaryPrompt = "Summarize the following chat conversation. "
            . "Only summarize what is actually present below — do not invent names, "
            . "people, or events that are not explicitly in the text. "
            . "If there is little or no substantive content, say so plainly.\n\n"
            . $transcript;
 
        try {
            $summary = $this->boudicaService->ask($summaryPrompt, $sessionId . '-summary');
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica summarize failed: ' . $e->getMessage());
            $summary = "Sorry, I couldn't generate a summary right now.";
        }
 
        $event->addAnswer($summary);
    }
 
    private function parsePeriodToTimestamp(string $prompt): int {
        $prompt = strtolower($prompt);
        $now = time();
 
        if (preg_match('/last\s+(\d+)\s*hour/i', $prompt, $m)) {
            return $now - ((int)$m[1] * 3600);
        }
        if (str_contains($prompt, 'last hour')) {
            return $now - 3600;
        }
        if (str_contains($prompt, 'this morning')) {
            return strtotime('today 00:00');
        }
        if (str_contains($prompt, 'this afternoon')) {
            return strtotime('today 12:00');
        }
        if (str_contains($prompt, 'today') || str_contains($prompt, 'all day')) {
            return strtotime('today 00:00');
        }
 
        return $now - 3600;
    }
 
    private function handleCalendarSearch(Event $event, string $prompt, string $sessionId): void {
        try {
            $calendarEvents = $this->fetchCalendarEvents($prompt);
            if (empty($calendarEvents)) {
                $event->addAnswer("No calendar events found.");
                return;
            }
 
            $eventsText = $this->formatCalendarEvents($calendarEvents);
            $summaryPrompt = "Summarize these calendar events for me:\n\n" . $eventsText;
 
            try {
                $reply = $this->boudicaService->ask($summaryPrompt, $sessionId . '-calendar');
            } catch (\Throwable $e) {
                $this->logger->warning('Boudica calendar summarization failed: ' . $e->getMessage());
                $reply = "Sorry, I couldn't summarize your calendar events.";
            }
 
            $event->addAnswer($reply);
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica calendar search failed: ' . $e->getMessage());
            $event->addAnswer("Sorry, I couldn't retrieve your calendar events.");
        }
    }
 
    /**
     * Fetches calendar events for the current user, optionally filtered by date range.
     */
    private function fetchCalendarEvents(string $prompt): array {
        $sinceTimestamp = $this->parseCalendarPeriodToTimestamp($prompt);
        
        // Calculate until timestamp based on the period
        if (str_contains(strtolower($prompt), 'today')) {
            $untilTimestamp = strtotime('tomorrow 00:00');
        } elseif (str_contains(strtolower($prompt), 'tomorrow')) {
            $untilTimestamp = strtotime('tomorrow 23:59:59');
        } elseif (str_contains(strtolower($prompt), 'this week')) {
            $untilTimestamp = strtotime('next sunday 23:59:59');
        } elseif (str_contains(strtolower($prompt), 'this month')) {
            $untilTimestamp = strtotime('last day of this month 23:59:59');
        } else {
            $untilTimestamp = time() + (30 * 24 * 3600); // 30 days from now
        }
 
        $qb = $this->db->getQueryBuilder();
        $qb->select('co.uri', 'co.calendardata', 'c.displayname')
           ->from('calendarobjects', 'co')
           ->innerJoin('co', 'calendars', 'c', $qb->expr()->eq('co.calendarid', 'c.id'))
           ->where($qb->expr()->eq('c.principaluri', $qb->createNamedParameter('principals/users/' . $this->getCurrentUserId())))
           ->andWhere($qb->expr()->gte('co.firstoccurence', $qb->createNamedParameter($sinceTimestamp, \PDO::PARAM_INT)))
           ->andWhere($qb->expr()->lte('co.firstoccurence', $qb->createNamedParameter($untilTimestamp, \PDO::PARAM_INT)))
           ->orderBy('co.firstoccurence', 'ASC');
 
        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
 
        $events = [];
        foreach ($rows as $row) {
            $icalData = $row['calendardata'];
            $calendarName = $row['displayname'];
            
            // Parse iCalendar format to extract event details
            if (preg_match('/SUMMARY:([^\r\n]+)/', $icalData, $m)) {
                $summary = $m[1];
            } else {
                $summary = 'Untitled';
            }
 
            if (preg_match('/DTSTART(?:;[^:]*)?:([^\r\n]+)/', $icalData, $m)) {
                $dtstart = $m[1];
            } else {
                $dtstart = 'Unknown';
            }
 
            if (preg_match('/DESCRIPTION:([^\r\n]+)/', $icalData, $m)) {
                $description = $m[1];
            } else {
                $description = '';
            }
 
            $events[] = [
                'calendar' => $calendarName,
                'summary' => $summary,
                'dtstart' => $dtstart,
                'description' => $description,
            ];
        }
 
        return $events;
    }
 
    private function formatCalendarEvents(array $events): string {
        $lines = [];
        foreach ($events as $event) {
            $line = $event['summary'] . ' (' . $event['calendar'] . ')';
            if ($event['dtstart'] !== 'Unknown') {
                $line .= ' - ' . $event['dtstart'];
            }
            if (!empty($event['description'])) {
                $line .= ' | ' . $event['description'];
            }
            $lines[] = $line;
        }
        return implode("\n", $lines);
    }
 
    private function parseCalendarPeriodToTimestamp(string $prompt): int {
        $prompt = strtolower($prompt);
        $now = time();
 
        if (str_contains($prompt, 'today')) {
            return strtotime('today 00:00');
        }
        if (str_contains($prompt, 'tomorrow')) {
            return strtotime('tomorrow 00:00');
        }
        if (str_contains($prompt, 'this week')) {
            return strtotime('this week monday');
        }
        if (str_contains($prompt, 'this month')) {
            return strtotime('first day of this month');
        }
 
        return $now;
    }
 
    private function getCurrentUserId(): string {
        // Get the current user from the system context
        $user = \OC::$server->get(IUserSession::class)?->getUser();
        return $user?->getUID() ?? 'unknown';
    }
 
    private function handleEmailSearch(Event $event, string $prompt, string $sessionId): void {
        $this->logger->info('Boudica email search initiated for prompt: ' . $prompt);
        
        try {
            $this->logger->info('Fetching emails...');
            $emails = $this->fetchEmails($prompt);
            $this->logger->info('Emails fetched successfully, count: ' . count($emails));
            
            if (empty($emails)) {
                $this->logger->info('No emails found');
                $event->addAnswer("No emails found matching that criteria.");
                return;
            }
 
            $emailsText = $this->formatEmails($emails);
            $summaryPrompt = "Summarize these emails for me:\n\n" . $emailsText;
 
            try {
                $reply = $this->boudicaService->ask($summaryPrompt, $sessionId . '-email');
            } catch (\Throwable $e) {
                $this->logger->warning('Boudica email summarization failed: ' . $e->getMessage());
                $reply = "Sorry, I couldn't summarize your emails.";
            }
 
            $event->addAnswer($reply);
        } catch (\Throwable $e) {
            $this->logger->error('Boudica email search failed: ' . $e->getMessage() . ' | Code: ' . $e->getCode() . ' | File: ' . $e->getFile() . ':' . $e->getLine() . ' | Trace: ' . $e->getTraceAsString());
            $event->addAnswer("Sorry, I couldn't retrieve your emails.");
        }
    }
 
    /**
     * Fetches emails for the current user, filtered by the search prompt.
     * Searches sender and subject fields, with optional date filtering.
     */
    private function fetchEmails(string $prompt): array {
        $userId = $this->getCurrentUserId();
        $this->logger->info('Email search for user: ' . $userId);
        
        // Extract search terms from prompt (remove "search", "email", "mail", etc.)
        $searchQuery = preg_replace('/\b(search|emails?|mail|from|subject|get|list|of|a|show|my|do|i|have|any)\b/i', '', $prompt);
        $searchQuery = trim($searchQuery);
        $this->logger->info('Email search query: "' . $searchQuery . '" (from prompt: "' . $prompt . '")');
 
        // Parse date range from prompt
        $sinceTimestamp = $this->parseEmailDateToTimestamp($prompt);
        $untilTimestamp = $this->parseEmailUntilDateToTimestamp($prompt, $sinceTimestamp);
        $this->logger->info('Email date range: ' . date('Y-m-d H:i:s', $sinceTimestamp) . ' to ' . date('Y-m-d H:i:s', $untilTimestamp));
 
        if (empty($searchQuery)) {
            $searchQuery = '%'; // Match all if no specific search term
        } else {
            $searchQuery = '%' . $searchQuery . '%';
        }
 
        // Join mail_recipients for sender (FROM type = 1)
        $qb = $this->db->getQueryBuilder();
        $qb->select('m.id', 'm.uid', 'm.subject', 'm.sent_at', 'm.mailbox_id', 
                    'mr.label', 'mr.email', 'mb.account_id')
           ->from('mail_messages', 'm')
           ->leftJoin('m', 'mail_recipients', 'mr', 
               $qb->expr()->andX(
                   $qb->expr()->eq('m.id', 'mr.message_id'),
                   $qb->expr()->eq('mr.type', $qb->createNamedParameter(1, \PDO::PARAM_INT))
               )
           )
           ->innerJoin('m', 'mail_mailboxes', 'mb', $qb->expr()->eq('m.mailbox_id', 'mb.id'))
           ->innerJoin('mb', 'mail_accounts', 'a', $qb->expr()->eq('mb.account_id', 'a.id'))
           ->where($qb->expr()->eq('a.user_id', $qb->createNamedParameter($userId)))
           ->andWhere(
               $qb->expr()->orX(
                   $qb->expr()->iLike('mr.email', $qb->createNamedParameter($searchQuery)),
                   $qb->expr()->iLike('mr.label', $qb->createNamedParameter($searchQuery)),
                   $qb->expr()->iLike('m.subject', $qb->createNamedParameter($searchQuery))
               )
           )
           ->andWhere($qb->expr()->gte('m.sent_at', $qb->createNamedParameter($sinceTimestamp, \PDO::PARAM_INT)))
           ->andWhere($qb->expr()->lte('m.sent_at', $qb->createNamedParameter($untilTimestamp, \PDO::PARAM_INT)))
           ->orderBy('m.sent_at', 'DESC')
           ->setMaxResults(10);
 
        $this->logger->info('Email query: ' . $qb->getSQL());
        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
        
        $this->logger->info('Email query returned ' . count($rows) . ' rows');
 
        return $rows;
    }
 
    private function parseEmailDateToTimestamp(string $prompt): int {
        $prompt = strtolower($prompt);
        $now = time();
 
        if (preg_match('/last\s+(\d+)\s*hour/i', $prompt, $m)) {
            return $now - ((int)$m[1] * 3600);
        }
        if (str_contains($prompt, 'last hour')) {
            return $now - 3600;
        }
        if (str_contains($prompt, 'this morning')) {
            return strtotime('today 00:00');
        }
        if (str_contains($prompt, 'this afternoon')) {
            return strtotime('today 12:00');
        }
        if (str_contains($prompt, 'today')) {
            return strtotime('today 00:00');
        }
        if (str_contains($prompt, 'yesterday')) {
            return strtotime('yesterday 00:00');
        }
        if (str_contains($prompt, 'this week')) {
            return strtotime('this week monday 00:00');
        }
        if (str_contains($prompt, 'last week')) {
            return strtotime('last week monday 00:00');
        }
        if (str_contains($prompt, 'this month')) {
            return strtotime('first day of this month 00:00');
        }
 
        // Default: search all emails (unix epoch, 1970)
        return 0;
    }
 
    private function parseEmailUntilDateToTimestamp(string $prompt, int $sinceTimestamp): int {
        $prompt = strtolower($prompt);
        $now = time();
 
        if (preg_match('/last\s+(\d+)\s*hour/i', $prompt)) {
            return $now;
        }
        if (str_contains($prompt, 'last hour') || str_contains($prompt, 'this morning') || str_contains($prompt, 'this afternoon')) {
            return $now;
        }
        if (str_contains($prompt, 'today')) {
            return strtotime('tomorrow 00:00') - 1;
        }
        if (str_contains($prompt, 'yesterday')) {
            return strtotime('today 00:00') - 1;
        }
        if (str_contains($prompt, 'this week')) {
            return strtotime('next sunday 23:59:59');
        }
        if (str_contains($prompt, 'last week')) {
            return strtotime('this week monday 00:00') - 1;
        }
        if (str_contains($prompt, 'this month')) {
            return strtotime('last day of this month 23:59:59');
        }
 
        return $now; // Default: up to now
    }
 
    private function formatEmails(array $emails): string {
        $lines = [];
        foreach ($emails as $email) {
            $from = $email['label'] ?? $email['email'] ?? 'Unknown Sender';
            $subject = $email['subject'] ?? '(no subject)';
            $sentAt = $email['sent_at'] ?? time();
            $uid = $email['uid'] ?? null;
            $mailboxId = $email['mailbox_id'] ?? null;
 
            // Format date
            $dateStr = 'Unknown Date';
            if ($sentAt) {
                $date = \DateTime::createFromFormat('U', $sentAt);
                if (!$date) {
                    // Try parsing as ISO format if timestamp fails
                    $date = new \DateTime($sentAt);
                }
                $dateStr = $date ? $date->format('M d, Y H:i') : 'Unknown Date';
            }
 
            // Build link to open in Mail app
            $mailLink = "/apps/mail/thread/" . urlencode($mailboxId ?? '') . "/" . urlencode($uid ?? '');
 
            $line = "**" . $from . "** - " . $subject . " (" . $dateStr . ")";
            $line .= "\n  [Open in Mail](" . $mailLink . ")";
            
            $lines[] = $line;
        }
        return implode("\n\n", $lines);
    }
 
    /**
     * Excludes deleted messages (deleted_at set) and raw edit-history rows
     * (edit_of_message_id set) from summarization — summaries should reflect
     * the current visible state of the conversation, even though the full
     * audit trail underneath retains everything.
     */
    private function fetchTranscript(string $token, int $sinceTimestamp): string {
        $qb = $this->db->getQueryBuilder();
        $qb->select('actor_name', 'message', 'timestamp')
           ->from('boudicaai_messages')
           ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ->andWhere($qb->expr()->gte('timestamp', $qb->createNamedParameter($sinceTimestamp, \PDO::PARAM_INT)))
           ->andWhere($qb->expr()->isNull('deleted_at'))
           ->andWhere($qb->expr()->isNull('edit_of_message_id'))
           ->orderBy('timestamp', 'ASC');
 
        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
 
        $lines = array_map(
            fn($row) => $row['actor_name'] . ': ' . $row['message'],
            $rows
        );
 
        return implode("\n", $lines);
    }
 
    /**
     * Gets the currently active tracking session for this conversation and user.
     * Returns the session ID if one is active, or null if no active tracking.
     */
    private function getActiveTrackingSession(string $token): ?int {
        $userId = $this->getCurrentUserId();
        
        $qb = $this->db->getQueryBuilder();
        $qb->select('id')
           ->from('boudicaai_tracking_sessions')
           ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
           ->andWhere($qb->expr()->isNull('stopped_at'))
           ->orderBy('started_at', 'DESC')
           ->setMaxResults(1);
 
        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();
 
        return $row ? (int)$row['id'] : null;
    }
 
    /**
     * Starts a new tracking session for this conversation.
     */
    private function handleTrackStart(Event $event, string $token, string $senderName): void {
        $userId = $this->getCurrentUserId();
        
        // Check if there's already an active session
        $existingSessionId = $this->getActiveTrackingSession($token);
        if ($existingSessionId !== null) {
            $event->addAnswer("Tracking is already active for this conversation. Use '@boudica stop' to end it.");
            return;
        }
 
        try {
            $qb = $this->db->getQueryBuilder();
            $qb->insert('boudicaai_tracking_sessions')
               ->values([
                   'token' => $qb->createNamedParameter($token),
                   'user_id' => $qb->createNamedParameter($userId),
                   'started_at' => $qb->createNamedParameter(time(), \PDO::PARAM_INT),
               ]);
            $qb->executeStatement();
 
            $this->logger->info('Tracking started for token: ' . $token . ', user: ' . $userId);
            $event->addAnswer("✓ Tracking started! I'll record all messages in this chat until you say '@boudica stop'. "
                . "Use '@boudica replay' to see tracked messages, or '@boudica tracking status' for details.");
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to start tracking: ' . $e->getMessage());
            $event->addAnswer("Sorry, I couldn't start tracking right now.");
        }
    }
 
    /**
     * Stops the current tracking session.
     */
    private function handleTrackStop(Event $event, string $token, string $senderName): void {
        $userId = $this->getCurrentUserId();
        
        $sessionId = $this->getActiveTrackingSession($token);
        if ($sessionId === null) {
            $event->addAnswer("No active tracking session. Use '@boudica track' to start one.");
            return;
        }
 
        try {
            $qb = $this->db->getQueryBuilder();
            $qb->update('boudicaai_tracking_sessions')
               ->set('stopped_at', $qb->createNamedParameter(time(), \PDO::PARAM_INT))
               ->where($qb->expr()->eq('id', $qb->createNamedParameter($sessionId, \PDO::PARAM_INT)));
            $qb->executeStatement();
 
            $this->logger->info('Tracking stopped for session: ' . $sessionId);
            
            // Get message count for this session
            $countQb = $this->db->getQueryBuilder();
            $countQb->select($countQb->func()->count('*', 'count'))
                    ->from('boudicaai_messages')
                    ->where($countQb->expr()->eq('tracking_session_id', $countQb->createNamedParameter($sessionId, \PDO::PARAM_INT)));
            $countResult = $countQb->executeQuery();
            $countRow = $countResult->fetch();
            $countResult->closeCursor();
            $messageCount = (int)($countRow['count'] ?? 0);
 
            $event->addAnswer("✓ Tracking stopped! Captured " . $messageCount . " messages. "
                . "Use '@boudica replay' to review them, or '@boudica tracking status' for details.");
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to stop tracking: ' . $e->getMessage());
            $event->addAnswer("Sorry, I couldn't stop tracking right now.");
        }
    }
 
    /**
     * Replays all messages from the most recent tracking session (active or completed).
     */
    private function handleTrackReplay(Event $event, string $token, string $senderName): void {
        $userId = $this->getCurrentUserId();
 
        try {
            $qb = $this->db->getQueryBuilder();
            $qb->select('id', 'started_at', 'stopped_at')
               ->from('boudicaai_tracking_sessions')
               ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
               ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
               ->orderBy('started_at', 'DESC')
               ->setMaxResults(1);
 
            $result = $qb->executeQuery();
            $sessionRow = $result->fetch();
            $result->closeCursor();
 
            if (!$sessionRow) {
                $event->addAnswer("No tracking history found. Use '@boudica track' to start tracking this chat.");
                return;
            }
 
            $sessionId = (int)$sessionRow['id'];
            $isActive = $sessionRow['stopped_at'] === null;
 
            // Fetch messages from this tracking session
            $msgQb = $this->db->getQueryBuilder();
            $msgQb->select('actor_name', 'message', 'timestamp')
                  ->from('boudicaai_messages')
                  ->where($msgQb->expr()->eq('tracking_session_id', $msgQb->createNamedParameter($sessionId, \PDO::PARAM_INT)))
                  ->andWhere($msgQb->expr()->isNull('deleted_at'))
                  ->andWhere($msgQb->expr()->isNull('edit_of_message_id'))
                  ->orderBy('timestamp', 'ASC');
 
            $msgResult = $msgQb->executeQuery();
            $messages = $msgResult->fetchAll();
            $msgResult->closeCursor();
 
            if (empty($messages)) {
                $event->addAnswer("No tracked messages found yet.");
                return;
            }
 
            $transcript = array_map(
                fn($row) => $row['actor_name'] . ': ' . $row['message'],
                $messages
            );
 
            $status = $isActive ? "(currently tracking)" : "(stopped)";
            $header = "**Tracking Session Replay** " . $status . " (" . count($messages) . " messages)\n\n";
            
            // Truncate if too long for a single message
            $fullTranscript = $header . implode("\n", $transcript);
            if (strlen($fullTranscript) > 4000) {
                $truncated = array_slice($transcript, 0, 20);
                $fullTranscript = $header . implode("\n", $truncated) . "\n\n... (truncated, " . (count($messages) - 20) . " more messages)";
            }
 
            $event->addAnswer($fullTranscript);
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to replay tracking: ' . $e->getMessage());
            $event->addAnswer("Sorry, I couldn't retrieve the tracking history.");
        }
    }
 
    /**
     * Shows status information about the current or most recent tracking session.
     */
    private function handleTrackingStatus(Event $event, string $token, string $senderName): void {
        $userId = $this->getCurrentUserId();
 
        try {
            // Get active session
            $activeSessionId = $this->getActiveTrackingSession($token);
            
            // Get most recent session (active or completed)
            $qb = $this->db->getQueryBuilder();
            $qb->select('id', 'started_at', 'stopped_at')
               ->from('boudicaai_tracking_sessions')
               ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
               ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
               ->orderBy('started_at', 'DESC')
               ->setMaxResults(1);
 
            $result = $qb->executeQuery();
            $sessionRow = $result->fetch();
            $result->closeCursor();
 
            if (!$sessionRow) {
                $event->addAnswer("No tracking sessions found. Use '@boudica track' to start one.");
                return;
            }
 
            $sessionId = (int)$sessionRow['id'];
            $startedAt = (int)$sessionRow['started_at'];
            $stoppedAt = $sessionRow['stopped_at'] ? (int)$sessionRow['stopped_at'] : null;
 
            // Get message count
            $countQb = $this->db->getQueryBuilder();
            $countQb->select($countQb->func()->count('*', 'count'))
                    ->from('boudicaai_messages')
                    ->where($countQb->expr()->eq('tracking_session_id', $countQb->createNamedParameter($sessionId, \PDO::PARAM_INT)));
            $countResult = $countQb->executeQuery();
            $countRow = $countResult->fetch();
            $countResult->closeCursor();
            $messageCount = (int)($countRow['count'] ?? 0);
 
            $statusText = ($activeSessionId === $sessionId) 
                ? "🔴 **ACTIVE**" 
                : "⏹️ **STOPPED**";
            
            $startedTime = date('Y-m-d H:i:s', $startedAt);
            $duration = $stoppedAt 
                ? round(($stoppedAt - $startedAt) / 60, 1) . ' minutes'
                : 'ongoing';
 
            $stoppedTime = $stoppedAt ? date('Y-m-d H:i:s', $stoppedAt) : '(still tracking)';
 
            $event->addAnswer(
                "**Tracking Status**\n\n" .
                $statusText . "\n" .
                "Started: " . $startedTime . "\n" .
                "Stopped: " . $stoppedTime . "\n" .
                "Duration: " . $duration . "\n" .
                "Messages captured: " . $messageCount . "\n\n" .
                "Use '@boudica replay' to review tracked messages."
            );
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to get tracking status: ' . $e->getMessage());
            $event->addAnswer("Sorry, I couldn't retrieve tracking status.");
        }
    }
 
    /**
     * Fetches and summarizes the most recent call transcript for this conversation.
     */
    private function handleCallSummary(Event $event, string $prompt, string $sessionId, string $token): void {
        $userId = $this->getCurrentUserId();
 
        try {
            // Fetch most recent call transcript for this room and user
            $qb = $this->db->getQueryBuilder();
            $qb->select('id', 'transcript_text', 'call_id', 'call_started_at', 'call_ended_at', 'duration_seconds')
               ->from('boudicaai_call_transcripts')
               ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
               ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
               ->andWhere($qb->expr()->isNotNull('transcript_text'))
               ->orderBy('call_ended_at', 'DESC')
               ->setMaxResults(1);
 
            $result = $qb->executeQuery();
            $callRow = $result->fetch();
            $result->closeCursor();
 
            if (!$callRow || !$callRow['transcript_text']) {
                $event->addAnswer("No recent call transcripts found. Make sure a call was recorded in this conversation.");
                return;
            }
 
            $transcriptText = $callRow['transcript_text'];
            
            if (trim($transcriptText) === '' || strlen(trim($transcriptText)) < 20) {
                $event->addAnswer("The call transcript is too short to summarize. No meaningful content was found.");
                return;
            }
 
            // Build summary prompt
            $summaryPrompt = "Summarize the following voice call transcript. "
                . "Focus on key discussion points, decisions made, and action items. "
                . "Only summarize what is explicitly present in the transcript.\n\n"
                . $transcriptText;
 
            try {
                $summary = $this->boudicaService->ask($summaryPrompt, $sessionId . '-call-summary');
            } catch (\Throwable $e) {
                $this->logger->warning('Boudica call summarization failed: ' . $e->getMessage());
                $summary = "Sorry, I couldn't generate a summary of the call right now.";
            }
 
            $callStartTime = $callRow['call_started_at'] 
                ? date('Y-m-d H:i', (int)$callRow['call_started_at']) 
                : 'Unknown';
 
            $event->addAnswer("**Call Summary** (from " . $callStartTime . ")\n\n" . $summary);
 
            // Optionally link this call to an active tracking session
            $trackingSessionId = $this->getActiveTrackingSession($token);
            if ($trackingSessionId !== null) {
                $update = $this->db->getQueryBuilder();
                $update->update('boudicaai_call_transcripts')
                       ->set('tracking_session_id', $update->createNamedParameter($trackingSessionId, \PDO::PARAM_INT))
                       ->where($update->expr()->eq('id', $update->createNamedParameter((int)$callRow['id'], \PDO::PARAM_INT)));
                $update->executeStatement();
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica call summary failed: ' . $e->getMessage());
            $event->addAnswer("Sorry, I couldn't retrieve the call transcript.");
        }
    }
 
    /**
     * Fetches all call transcripts for the current conversation.
     */
    public function fetchCallTranscripts(string $token, ?int $since = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('id', 'call_id', 'transcript_text', 'call_started_at', 'call_ended_at', 'duration_seconds')
           ->from('boudicaai_call_transcripts')
           ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ->andWhere($qb->expr()->isNotNull('transcript_text'));
 
        if ($since !== null) {
            $qb->andWhere($qb->expr()->gte('call_ended_at', $qb->createNamedParameter($since, \PDO::PARAM_INT)));
        }
 
        $qb->orderBy('call_ended_at', 'DESC');
 
        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
 
        return $rows;
    }
 
    /**
     * Formats call transcripts for display or summarization.
     */
    private function formatCallTranscript(array $callData): string {
        $callId = $callData['call_id'] ?? 'Unknown';
        $startTime = $callData['call_started_at'] 
            ? date('Y-m-d H:i:s', (int)$callData['call_started_at']) 
            : 'Unknown';
        $transcript = $callData['transcript_text'] ?? '';
 
        return "[Call ID: " . $callId . " | Started: " . $startTime . "]\n" . $transcript;
    }
 
    /**
     * Checks if a filename is an audio file that might be a call recording.
     */
    private function isAudioFile(string $filename): bool {
        $audioExtensions = ['wav', 'mp3', 'm4a', 'ogg', 'flac', 'aac', 'webm', 'opus'];
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        return in_array($ext, $audioExtensions);
    }
 
    /**
     * Stores a reference to an uploaded call recording file for later transcription.
     */
    private function storeCallRecordingFile(string $token, ?string $messageId, string $fileName, array $fileParam, string $plainText): void {
        $userId = $this->getCurrentUserId();
        
        try {
            $fileId = $fileParam['id'] ?? null;
            $filePath = $fileParam['path'] ?? $fileName;
 
            // Check if we already have this file
            if ($this->callRecordingFileExists($token, $fileName)) {
                return;
            }
 
            $qb = $this->db->getQueryBuilder();
            $qb->insert('boudicaai_call_transcripts')
               ->values([
                   'token' => $qb->createNamedParameter($token),
                   'user_id' => $qb->createNamedParameter($userId),
                   'file_id' => $qb->createNamedParameter($fileId, \PDO::PARAM_INT),
                   'file_name' => $qb->createNamedParameter($fileName),
                   'file_path' => $qb->createNamedParameter($filePath),
                   'call_started_at' => $qb->createNamedParameter(time(), \PDO::PARAM_INT),
                   'transcription_status' => $qb->createNamedParameter('pending'),
               ]);
            $qb->executeStatement();
 
            // Get the ID of the newly inserted record
            $callTranscriptId = (int)$this->db->lastInsertId('boudicaai_call_transcripts');
 
            // Capture room participants for this call
            if ($callTranscriptId > 0) {
                $participantCount = $this->participantService->captureRoomParticipants($callTranscriptId, $token);
                $this->logger->info("Captured $participantCount participants for call recording: $fileName");
            }
 
            $this->logger->info('Stored call recording file: ' . $fileName . ' for token: ' . $token);
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to store call recording file: ' . $e->getMessage());
        }
    }
 
    /**
     * Checks if a call recording file already exists.
     */
    private function callRecordingFileExists(string $token, string $fileName): bool {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('*', 'count'))
           ->from('boudicaai_call_transcripts')
           ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ->where($qb->expr()->eq('file_name', $qb->createNamedParameter($fileName)));
 
        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();
 
        return (int)($row['count'] ?? 0) > 0;
    }
 
    /**
     * Handles manual transcription request for uploaded call recordings.
     * User uploads a recording and says "@boudica transcribe this call"
     */
    private function handleTranscribeCall(Event $event, string $prompt, string $token): void {
        $userId = $this->getCurrentUserId();
 
        try {
            // Find the most recent pending call recording file
            $qb = $this->db->getQueryBuilder();
            $qb->select('id', 'file_name', 'file_path', 'transcription_status')
               ->from('boudicaai_call_transcripts')
               ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
               ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
               ->andWhere($qb->expr()->in('transcription_status', 
                   [$qb->createNamedParameter('pending'), $qb->createNamedParameter('failed')]))
               ->andWhere($qb->expr()->isNotNull('file_name'))
               ->orderBy('call_started_at', 'DESC')
               ->setMaxResults(1);
 
            $result = $qb->executeQuery();
            $callRow = $result->fetch();
            $result->closeCursor();
 
            if (!$callRow) {
                $event->addAnswer("No pending call recordings found. Please upload an audio file first.");
                return;
            }
 
            $callId = (int)$callRow['id'];
            $fileName = $callRow['file_name'];
 
            // Update status to transcribing
            $update = $this->db->getQueryBuilder();
            $update->update('boudicaai_call_transcripts')
                   ->set('transcription_status', $update->createNamedParameter('transcribing'))
                   ->where($update->expr()->eq('id', $update->createNamedParameter($callId, \PDO::PARAM_INT)));
            $update->executeStatement();
 
            $event->addAnswer("🎤 Processing transcription of: **" . htmlspecialchars($fileName) . "**\n\n"
                . "This may take a moment depending on file size. "
                . "Use '@boudica call transcript' in a moment to check the result.");
 
            $this->logger->info('Started transcription for call file: ' . $fileName);
 
            // TODO: Queue transcription job with external service (Whisper, Google Cloud Speech, etc.)
            // For now, update status to indicate manual processing needed
            $this->scheduleTranscriptionJob($callId, $fileName);
 
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica transcription request failed: ' . $e->getMessage());
            $event->addAnswer("Sorry, I couldn't process the transcription request right now.");
        }
    }
 
    /**
     * Schedules a transcription job by sending to local Whisper service.
     * Runs synchronously - file is transcribed immediately.
     */
    private function scheduleTranscriptionJob(int $callId, string $fileName): void {
        try {
            // Check if Whisper service is available
            if (!$this->transcriptionService->isServiceAvailable()) {
                $this->logger->warning('Whisper transcription service is not available');
                $this->updateTranscriptionStatus($callId, 'failed', 'Transcription service unavailable');
                return;
            }
 
            // Get file path from database
            $qb = $this->db->getQueryBuilder();
            $qb->select('file_path', 'file_id')
               ->from('boudicaai_call_transcripts')
               ->where($qb->expr()->eq('id', $qb->createNamedParameter($callId, \PDO::PARAM_INT)));
 
            $result = $qb->executeQuery();
            $row = $result->fetch();
            $result->closeCursor();
 
            if (!$row) {
                $this->logger->error('Call transcript record not found: ' . $callId);
                return;
            }
 
            $filePath = $row['file_path'];
 
            // TODO: Get actual file from Nextcloud storage using file_id
            // For now, this assumes file_path is a valid accessible path
            // Real implementation would need to use Nextcloud's IAppData or filesystem
 
            // Process transcription
            $this->logger->info('Starting transcription for call_id: ' . $callId . ', file: ' . $fileName);
 
            $transcript = $this->transcriptionService->transcribeFile($filePath);
 
            // Update database with result
            $this->updateTranscriptionStatus($callId, 'completed', null, $transcript);
 
            $this->logger->info('Transcription completed for call_id: ' . $callId);
 
        } catch (\Exception $e) {
            $this->logger->error('Transcription job failed: ' . $e->getMessage());
            $this->updateTranscriptionStatus($callId, 'failed', $e->getMessage());
        }
    }
 
    /**
     * Update transcription status in database and send email if completed
     */
    private function updateTranscriptionStatus(
        int $callId,
        string $status,
        ?string $error = null,
        ?string $transcript = null
    ): void {
        try {
            $update = $this->db->getQueryBuilder();
            $update->update('boudicaai_call_transcripts')
                   ->set('transcription_status', $update->createNamedParameter($status))
                   ->set('transcript_fetched_at', $update->createNamedParameter(time(), \PDO::PARAM_INT));
 
            if ($transcript) {
                $update->set('transcript_text', $update->createNamedParameter($transcript));
            }
 
            if ($error) {
                $update->set('transcription_error', $update->createNamedParameter($error));
            }
 
            $update->where($update->expr()->eq('id', $update->createNamedParameter($callId, \PDO::PARAM_INT)));
            $update->executeStatement();
 
            // If transcription just completed, send email to participants
            if ($status === 'completed' && $transcript) {
                $this->sendTranscriptEmailToParticipants($callId, $transcript);
            }
 
        } catch (\Throwable $e) {
            $this->logger->error('Failed to update transcription status: ' . $e->getMessage());
        }
    }
 
    /**
     * Sends transcript email to all participants of a call
     */
    private function sendTranscriptEmailToParticipants(int $callId, string $transcript): void {
        try {
            // Get call details
            $qb = $this->db->getQueryBuilder();
            $qb->select('token', 'file_name', 'call_started_at')
               ->from('boudicaai_call_transcripts')
               ->where($qb->expr()->eq('id', $qb->createNamedParameter($callId, \PDO::PARAM_INT)));
 
            $result = $qb->executeQuery();
            $callRow = $result->fetch();
            $result->closeCursor();
 
            if (!$callRow) {
                $this->logger->warning("Call record not found for transcript email: $callId");
                return;
            }
 
            // Get participant email addresses
            $recipients = $this->participantService->getParticipantEmails($callId);
 
            if (empty($recipients)) {
                $this->logger->info("No email recipients found for call $callId");
                return;
            }
 
            // Get room name from token (if available, otherwise use file name)
            $roomName = $callRow['file_name'] ?? 'Call Recording';
 
            // Send email
            $emailSent = $this->emailService->sendTranscriptEmail(
                $recipients,
                $transcript,
                $roomName,
                (int)$callRow['call_started_at']
            );
 
            if ($emailSent) {
                // Mark email as sent in database
                $this->participantService->markEmailSent($callId, $recipients);
                $this->logger->info("Sent transcript email for call $callId to " . count($recipients) . " recipients");
            }
 
        } catch (\Throwable $e) {
            $this->logger->error('Failed to send transcript email: ' . $e->getMessage());
        }
    }
 
    /**
     * Handles manual transcript entry for call recordings.
     * Admin/user can provide transcript text via command.
     */
    public function setCallTranscript(int $callId, string $transcriptText): bool {
        try {
            $now = time();
            $update = $this->db->getQueryBuilder();
            $update->update('boudicaai_call_transcripts')
                   ->set('transcript_text', $update->createNamedParameter($transcriptText))
                   ->set('transcription_status', $update->createNamedParameter('completed'))
                   ->set('transcript_fetched_at', $update->createNamedParameter($now, \PDO::PARAM_INT))
                   ->where($update->expr()->eq('id', $update->createNamedParameter($callId, \PDO::PARAM_INT)));
            $update->executeStatement();
 
            return true;
        } catch (\Throwable $e) {
            $this->logger->error('Failed to set call transcript: ' . $e->getMessage());
            return false;
        }
    }
 
    /**
     * Gets pending transcription jobs that need processing.
     */
    public function getPendingTranscriptions(int $limit = 10): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('id', 'token', 'file_name', 'file_path', 'user_id', 'call_started_at')
           ->from('boudicaai_call_transcripts')
           ->where($qb->expr()->eq('transcription_status', $qb->createNamedParameter('transcribing')))
           ->orderBy('call_started_at', 'ASC')
           ->setMaxResults($limit);
 
        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
 
        return $rows;
    }
 
    /**
     * Webhook endpoint for transcription service to submit completed transcripts.
     * Called by external speech-to-text service with transcript results.
     */
    public function handleTranscriptionWebhook(int $callId, string $transcriptText, ?string $error = null): bool {
        try {
            $now = time();
            $status = $error ? 'failed' : 'completed';
            
            $update = $this->db->getQueryBuilder();
            $update->update('boudicaai_call_transcripts')
                   ->set('transcription_status', $update->createNamedParameter($status))
                   ->set('transcript_text', $update->createNamedParameter($transcriptText))
                   ->set('transcript_fetched_at', $update->createNamedParameter($now, \PDO::PARAM_INT));
            
            if ($error) {
                $update->set('transcription_error', $update->createNamedParameter($error));
            }
            
            $update->where($update->expr()->eq('id', $update->createNamedParameter($callId, \PDO::PARAM_INT)));
            $update->executeStatement();
 
            $this->logger->info('Transcription completed for call_id: ' . $callId . ', status: ' . $status);
            return true;
        } catch (\Throwable $e) {
            $this->logger->error('Failed to process transcription webhook: ' . $e->getMessage());
            return false;
        }
    }
}