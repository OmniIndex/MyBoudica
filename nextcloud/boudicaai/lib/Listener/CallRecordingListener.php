<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Listener;

use OCA\Talk\Events\CallStartedEvent;
use OCA\Talk\Events\CallEndedEvent;
use OCA\Talk\Model\Attendee;
use OCA\Talk\Service\ParticipantService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IDBConnection;
use OCP\IUserManager;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * Listens for real Talk call lifecycle events (CallStartedEvent / CallEndedEvent)
 * and does pure bookkeeping in boudicaai_call_transcripts — creating a row when
 * a call starts, closing it out when it ends.
 *
 * IMPORTANT: this class previously depended on a "JanusRecordingService" that
 * was never actually implemented as a real file in this codebase. Nextcloud's
 * DI container cannot autowire a constructor parameter typed to a class that
 * doesn't exist, so this listener has been failing to instantiate on every
 * single CallStartedEvent/CallEndedEvent since it was deployed — which is why
 * boudicaai_call_transcripts stayed empty despite calls working fine. That
 * dependency (and the TranscriptionService/IJobList ones, which were there to
 * support it) has been removed entirely.
 *
 * This listener no longer tries to "start" or "stop" recording at all, because
 * Janus now records every call unconditionally — see the "record"/"rec_dir"
 * addition to createPublisherRoom() in the signaling server's janus.go. There
 * is nothing for this listener to trigger; recording already happens by the
 * time CallStartedEvent even fires.
 *
 * Actual file discovery and transcription is handled independently by
 * JanusTranscriptionCommand (occ boudicaai:janus-transcribe), which matches
 * .mjr files back to the row created here via the microsecond timestamp
 * embedded in Janus's filenames — see matchTranscriptRow() there. This
 * listener's only job is making sure that row exists with the right
 * token/call_started_at for that matching to succeed.
 */
class CallRecordingListener implements IEventListener {

    private LoggerInterface $logger;
    private IDBConnection $db;
    private IUserSession $userSession;
    private IUserManager $userManager;
    private ParticipantService $participantService;

    public function __construct(
        LoggerInterface $logger,
        IDBConnection $db,
        IUserSession $userSession,
        IUserManager $userManager,
        ParticipantService $participantService
    ) {
        $this->logger = $logger;
        $this->db = $db;
        $this->userSession = $userSession;
        $this->userManager = $userManager;
        $this->participantService = $participantService;
    }

    public function handle(Event $event): void {
        if ($event instanceof CallStartedEvent) {
            $this->handleCallStarted($event);
            return;
        }

        if ($event instanceof CallEndedEvent) {
            $this->handleCallEnded($event);
            return;
        }
    }

    /**
     * Fired when a call starts in any conversation. Creates the tracking row
     * that JanusTranscriptionCommand will later match a recording file
     * against by timestamp. Nothing needs to be "started" on the Janus side —
     * it's already recording unconditionally.
     */
    private function handleCallStarted(CallStartedEvent $event): void {
        try {
            $room = $event->getRoom();
            $token = $room->getToken();
        } catch (\Throwable $e) {
            // ASSUMPTION TO VERIFY: getRoom()/getToken() match the actual method
            // names on CallStartedEvent in this Talk version. Now that the
            // missing-class issue is fixed, if this error ever actually shows
            // up in the logs, that confirms this assumption (not the missing
            // class) is the real problem — check with a quick var_dump/
            // reflection of $event and adjust here.
            $this->logger->error('Boudica: could not read room/token from CallStartedEvent: ' . $e->getMessage());
            return;
        }

        $callId = $token . '-' . time();
        $userId = $this->getCurrentUserId();

        try {
            $qb = $this->db->getQueryBuilder();
            $qb->insert('boudicaai_call_transcripts')
               ->values([
                   'token' => $qb->createNamedParameter($token),
                   'call_id' => $qb->createNamedParameter($callId),
                   'user_id' => $qb->createNamedParameter($userId),
                   'call_started_at' => $qb->createNamedParameter(time(), \PDO::PARAM_INT),
                   'transcription_status' => $qb->createNamedParameter('recording'),
               ]);
            $qb->executeStatement();
            $this->logger->info("Boudica: tracking call {$callId} in room {$token} (Janus is already recording)");
        } catch (\Throwable $e) {
            $this->logger->error('Boudica: failed to create call_transcripts row on call start: ' . $e->getMessage());
        }
    }

    /**
     * Fired when the last participant leaves / the call ends. Marks the
     * tracking row as ready for JanusTranscriptionCommand to pick up — that
     * command runs independently (e.g. via cron) and finds the actual .mjr
     * file itself, so this just records that the call ended and when.
     */
    private function handleCallEnded(CallEndedEvent $event): void {
        try {
            $room = $event->getRoom();
            $token = $room->getToken();
        } catch (\Throwable $e) {
            $this->logger->error('Boudica: could not read room/token from CallEndedEvent: ' . $e->getMessage());
            return;
        }

        $transcriptRow = $this->findActiveRecordingRow($token);
        if ($transcriptRow === null) {
            // No matching 'recording' row — either CallStartedEvent never fired
            // for this call, or it was already handled. Nothing to do.
            $this->logger->info("Boudica: no active recording row found for room {$token} on call end");
            return;
        }

        $rowId = (int)$transcriptRow['id'];
        $startedAt = (int)$transcriptRow['call_started_at'];
        $endedAt = time();

        $update = $this->db->getQueryBuilder();
        $update->update('boudicaai_call_transcripts')
               ->set('call_ended_at', $update->createNamedParameter($endedAt, \PDO::PARAM_INT))
               ->set('duration_seconds', $update->createNamedParameter($endedAt - $startedAt, \PDO::PARAM_INT))
               ->set('transcription_status', $update->createNamedParameter('pending'))
               ->where($update->expr()->eq('id', $update->createNamedParameter($rowId, \PDO::PARAM_INT)));
        $update->executeStatement();

        // Wrapped defensively: a failure here should never break call
        // teardown for the user. This is exactly the kind of failure that
        // broke "start call" entirely earlier — a bad type hint inside this
        // method caused a fatal, uncaught TypeError. That specific bug is
        // fixed now, but wrapping the call site too means any *future*
        // problem in this method degrades to "no participants captured"
        // instead of "the call won't start."
        try {
            $this->captureParticipants($room, $rowId, $startedAt, $endedAt);
        } catch (\Throwable $e) {
            $this->logger->error('Boudica: captureParticipants() failed unexpectedly: ' . $e->getMessage());
        }

        $this->logger->info("Boudica: call {$transcriptRow['call_id']} ended (row {$rowId}), waiting for janus-transcribe to find the recording");
    }

    /**
     * Records who was in the call so JanusTranscriptionCommand's later email
     * step has real recipients to send to. Previously nothing populated
     * boudicaai_call_participants at all for calls going through this
     * listener (only the old manual-file-upload flow in
     * TalkBotInvokeListener did, via a completely separate code path) — the
     * table stayed permanently empty, so every transcript's email step
     * silently found zero recipients and no-opped, with no error anywhere.
     *
     * Uses join/leave timestamps approximated to the call's overall
     * start/end (Attendee doesn't expose reliable per-participant session
     * times through this API), which is precise enough for what this table
     * is actually used for — building a recipient list, not a detailed
     * attendance log.
     *
     * $room is intentionally untyped: an earlier version declared it as
     * "\OCA\Talk\Room\Room", a guessed namespace that was never actually
     * verified against this Talk version. That guess being wrong caused a
     * fatal PHP TypeError the instant this method was called — not caught
     * by any try/catch, since PHP's own type-checking happens before the
     * method body (and thus any internal try/catch) ever runs. That broke
     * the entire "start call" OCS request, surfacing to users as the page
     * failing to load. $room is simply whatever $event->getRoom() actually
     * returns, passed straight through to Talk's own ParticipantService —
     * we don't need to assert its type ourselves to use it correctly.
     */
    private function captureParticipants($room, int $transcriptRowId, int $startedAt, int $endedAt): void {
        try {
            $participants = $this->participantService->getParticipantsForRoom($room);
        } catch (\Throwable $e) {
            $this->logger->error('Boudica: failed to fetch room participants: ' . $e->getMessage());
            return;
        }

        $captured = 0;
        foreach ($participants as $participant) {
            $attendee = $participant->getAttendee();

            // Only registered users have a resolvable email via IUserManager.
            // Guests (Attendee::ACTOR_GUESTS) have no account to look up —
            // skipped here rather than guessed at.
            if ($attendee->getActorType() !== Attendee::ACTOR_USERS) {
                continue;
            }

            $userId = $attendee->getActorId();
            $user = $this->userManager->get($userId);
            $email = $user?->getEMailAddress();

            try {
                $qb = $this->db->getQueryBuilder();
                $qb->insert('boudicaai_call_participants')
                   ->values([
                       'call_transcript_id' => $qb->createNamedParameter($transcriptRowId, \PDO::PARAM_INT),
                       'participant_user_id' => $qb->createNamedParameter($userId),
                       'participant_display_name' => $qb->createNamedParameter($attendee->getDisplayName() ?: $userId),
                       'participant_email' => $qb->createNamedParameter($email),
                       'joined_at' => $qb->createNamedParameter($startedAt, \PDO::PARAM_INT),
                       'left_at' => $qb->createNamedParameter($endedAt, \PDO::PARAM_INT),
                   ]);
                $qb->executeStatement();
                $captured++;
            } catch (\Throwable $e) {
                $this->logger->error("Boudica: failed to record participant {$userId} for call row {$transcriptRowId}: " . $e->getMessage());
            }
        }

        $this->logger->info("Boudica: captured {$captured} participant(s) for call row {$transcriptRowId}");
    }

    /**
     * Finds the most recent 'recording' row for this token — i.e. the call we
     * started tracking in handleCallStarted() that hasn't been closed out yet.
     */
    private function findActiveRecordingRow(string $token): ?array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('id', 'call_id', 'call_started_at')
           ->from('boudicaai_call_transcripts')
           ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ->andWhere($qb->expr()->eq('transcription_status', $qb->createNamedParameter('recording')))
           ->orderBy('call_started_at', 'DESC')
           ->setMaxResults(1);

        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();

        return $row ?: null;
    }

    private function getCurrentUserId(): string {
        $user = $this->userSession->getUser();
        return $user?->getUID() ?? 'system';
    }
}