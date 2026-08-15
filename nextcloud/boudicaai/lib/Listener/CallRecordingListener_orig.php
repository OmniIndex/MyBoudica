<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Listener;

use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IDBConnection;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * Listens for call recording completion events from Nextcloud Talk.
 * When a call recording is completed, retrieves the transcript and stores it
 * for later summarization and analysis via Boudica.
 */
class CallRecordingListener implements IEventListener {

    private LoggerInterface $logger;
    private IDBConnection $db;
    private IUserSession $userSession;

    public function __construct(
        LoggerInterface $logger,
        IDBConnection $db,
        IUserSession $userSession
    ) {
        $this->logger = $logger;
        $this->db = $db;
        $this->userSession = $userSession;
    }

    public function handle(Event $event): void {
        // Nextcloud Talk fires recording-related events, we check for available events
        // This handler will be invoked when Talk fires RecordingStartedEvent or similar
        
        $eventClass = get_class($event);
        $this->logger->info('CallRecordingListener received event: ' . $eventClass);

        // Check if this is a call-ended or recording-completed event
        if (!$this->isCallRecordingEvent($event)) {
            return;
        }

        try {
            $this->handleCallRecording($event);
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica call transcript processing failed: ' . $e->getMessage());
        }
    }

    /**
     * Determines if this is a call recording event we should process.
     */
    private function isCallRecordingEvent(Event $event): bool {
        $eventClass = get_class($event);
        
        // Support multiple possible event names from Nextcloud Talk
        return str_contains($eventClass, 'Recording') 
            || str_contains($eventClass, 'CallEnded')
            || str_contains($eventClass, 'TranscriptReady');
    }

    /**
     * Processes a completed call recording by storing transcript metadata.
     */
    private function handleCallRecording(Event $event): void {
        // Extract call and transcript information from event
        // The exact structure depends on Nextcloud Talk's event payload
        
        $callId = $this->extractCallId($event);
        $token = $this->extractToken($event);
        $userId = $this->getCurrentUserId();
        $transcriptText = $this->extractTranscript($event);
        
        if (!$callId || !$token) {
            $this->logger->warning('Boudica: Could not extract call_id or token from recording event');
            return;
        }

        // Check if transcript already exists for this call
        if ($this->transcriptExists($callId)) {
            $this->logger->info('Transcript already exists for call: ' . $callId);
            return;
        }

        try {
            $now = time();
            $qb = $this->db->getQueryBuilder();
            $qb->insert('boudicaai_call_transcripts')
               ->values([
                   'token' => $qb->createNamedParameter($token),
                   'call_id' => $qb->createNamedParameter($callId),
                   'user_id' => $qb->createNamedParameter($userId),
                   'transcript_text' => $qb->createNamedParameter($transcriptText),
                   'call_started_at' => $qb->createNamedParameter($now, \PDO::PARAM_INT),
                   'call_ended_at' => $qb->createNamedParameter($now, \PDO::PARAM_INT),
                   'transcript_fetched_at' => $qb->createNamedParameter($now, \PDO::PARAM_INT),
               ]);
            $qb->executeStatement();

            $this->logger->info('Stored transcript for call: ' . $callId . ', length: ' . strlen($transcriptText ?? ''));
        } catch (\Throwable $e) {
            $this->logger->error('Failed to store call transcript: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Extracts call ID from the event payload.
     */
    private function extractCallId(Event $event): ?string {
        // Try multiple possible field names based on Nextcloud Talk event structure
        $reflection = new \ReflectionObject($event);
        $properties = $reflection->getProperties(\ReflectionProperty::IS_PUBLIC | \ReflectionProperty::IS_PROTECTED | \ReflectionProperty::IS_PRIVATE);
        
        foreach ($properties as $prop) {
            $prop->setAccessible(true);
            $value = $prop->getValue($event);
            
            if (in_array($prop->getName(), ['callId', 'call_id', 'id', 'recording_id'])) {
                return $value;
            }
        }

        return null;
    }

    /**
     * Extracts room token from the event payload.
     */
    private function extractToken(Event $event): ?string {
        $reflection = new \ReflectionObject($event);
        $properties = $reflection->getProperties(\ReflectionProperty::IS_PUBLIC | \ReflectionProperty::IS_PROTECTED | \ReflectionProperty::IS_PRIVATE);
        
        foreach ($properties as $prop) {
            $prop->setAccessible(true);
            $value = $prop->getValue($event);
            
            if (in_array($prop->getName(), ['token', 'room_token', 'roomToken'])) {
                return $value;
            }
        }

        return null;
    }

    /**
     * Extracts transcript text from the event payload.
     */
    private function extractTranscript(Event $event): ?string {
        $reflection = new \ReflectionObject($event);
        $properties = $reflection->getProperties(\ReflectionProperty::IS_PUBLIC | \ReflectionProperty::IS_PROTECTED | \ReflectionProperty::IS_PRIVATE);
        
        foreach ($properties as $prop) {
            $prop->setAccessible(true);
            $value = $prop->getValue($event);
            
            if (in_array($prop->getName(), ['transcript', 'transcriptText', 'transcript_text', 'recording_data'])) {
                if (is_string($value)) {
                    return $value;
                } elseif (is_array($value) && isset($value['transcript'])) {
                    return $value['transcript'];
                }
            }
        }

        return null;
    }

    /**
     * Checks if a transcript for this call already exists.
     */
    private function transcriptExists(string $callId): bool {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('*', 'count'))
           ->from('boudicaai_call_transcripts')
           ->where($qb->expr()->eq('call_id', $qb->createNamedParameter($callId)));

        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();

        return (int)($row['count'] ?? 0) > 0;
    }

    /**
     * Gets the current user ID.
     */
    private function getCurrentUserId(): string {
        $user = $this->userSession->getUser();
        return $user?->getUID() ?? 'system';
    }
}
