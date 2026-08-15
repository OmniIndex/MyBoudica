<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Service;

use OCP\IDBConnection;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;

class CallParticipantService {
    private IDBConnection $db;
    private IUserManager $userManager;
    private LoggerInterface $logger;

    public function __construct(
        IDBConnection $db,
        IUserManager $userManager,
        LoggerInterface $logger
    ) {
        $this->db = $db;
        $this->userManager = $userManager;
        $this->logger = $logger;
    }

    /**
     * Captures all participants in a Talk room and stores them linked to a call transcript
     * 
     * @param int $callTranscriptId - The boudicaai_call_transcripts.id
     * @param string $token - The Talk room token
     * @return int Number of participants captured
     */
    public function captureRoomParticipants(int $callTranscriptId, string $token): int {
        try {
            // Fetch all participants in the Talk room
            $qb = $this->db->getQueryBuilder();
            $qb->select('u.uid', 'u.displayname', 'u.email')
               ->from('talk_attendees', 'ta')
               ->leftJoin('ta', 'users', 'u', $qb->expr()->eq('ta.actor_id', 'u.uid'))
               ->where($qb->expr()->eq('ta.room_id', 
                   $qb->expr()->select('id')
                   ->from('talk_rooms')
                   ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
               ))
               ->andWhere($qb->expr()->eq('ta.actor_type', $qb->createNamedParameter('users')));

            $result = $qb->executeQuery();
            $participants = $result->fetchAll();
            $result->closeCursor();

            $count = 0;
            $joinedAt = time();

            foreach ($participants as $participant) {
                $userId = $participant['uid'] ?? null;
                $displayName = $participant['displayname'] ?? 'Unknown';
                $email = $participant['email'] ?? null;

                if (!$userId) {
                    continue;
                }

                // Store participant
                $insert = $this->db->getQueryBuilder();
                $insert->insert('boudicaai_call_participants')
                    ->values([
                        'call_transcript_id' => $insert->createNamedParameter($callTranscriptId, \PDO::PARAM_INT),
                        'participant_user_id' => $insert->createNamedParameter($userId),
                        'participant_display_name' => $insert->createNamedParameter($displayName),
                        'participant_email' => $insert->createNamedParameter($email),
                        'joined_at' => $insert->createNamedParameter($joinedAt, \PDO::PARAM_INT),
                    ]);

                try {
                    $insert->executeStatement();
                    $count++;
                } catch (\Throwable $e) {
                    $this->logger->warning('Failed to store participant: ' . $e->getMessage());
                }
            }

            // Mark participants as captured
            $update = $this->db->getQueryBuilder();
            $update->update('boudicaai_call_transcripts')
                   ->set('participants_captured', $update->createNamedParameter(true, \PDO::PARAM_BOOL))
                   ->where($update->expr()->eq('id', $update->createNamedParameter($callTranscriptId, \PDO::PARAM_INT)));
            $update->executeStatement();

            $this->logger->info("Captured $count participants for call transcript $callTranscriptId");

            return $count;
        } catch (\Throwable $e) {
            $this->logger->error('Failed to capture call participants: ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * Retrieves all participants for a call transcript
     * 
     * @param int $callTranscriptId
     * @return array List of participants with user_id, display_name, email
     */
    public function getCallParticipants(int $callTranscriptId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('participant_user_id', 'participant_display_name', 'participant_email')
           ->from('boudicaai_call_participants')
           ->where($qb->expr()->eq('call_transcript_id', $qb->createNamedParameter($callTranscriptId, \PDO::PARAM_INT)))
           ->orderBy('joined_at', 'ASC');

        $result = $qb->executeQuery();
        $participants = $result->fetchAll();
        $result->closeCursor();

        return $participants;
    }

    /**
     * Gets unique email addresses for notification (filters nulls, dedupes)
     * 
     * @param int $callTranscriptId
     * @return array List of unique email addresses
     */
    public function getParticipantEmails(int $callTranscriptId): array {
        $participants = $this->getCallParticipants($callTranscriptId);
        $emails = [];

        foreach ($participants as $p) {
            $email = $p['participant_email'] ?? null;
            if ($email && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $emails[$email] = $p['participant_display_name'];
            }
        }

        return $emails; // Returns associative array: email => display_name
    }

    /**
     * Records when an email was sent to participants
     * 
     * @param int $callTranscriptId
     * @param array $emailsToSend Associative array of email => display_name
     */
    public function markEmailSent(int $callTranscriptId, array $emailsToSend): void {
        $emailList = implode(',', array_keys($emailsToSend));

        $update = $this->db->getQueryBuilder();
        $update->update('boudicaai_call_transcripts')
               ->set('email_sent_at', $update->createNamedParameter(time(), \PDO::PARAM_INT))
               ->set('email_recipients', $update->createNamedParameter($emailList))
               ->where($update->expr()->eq('id', $update->createNamedParameter($callTranscriptId, \PDO::PARAM_INT)));
        $update->executeStatement();

        $this->logger->info("Marked email as sent for call transcript $callTranscriptId to: " . $emailList);
    }
}
