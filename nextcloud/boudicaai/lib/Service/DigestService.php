<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Service;

use OCP\IDBConnection;
use Psr\Log\LoggerInterface;

/**
 * Polls Talk rooms per user and keeps boudicaai_room_state /
 * boudicaai_summaries up to date, so the digest page can read
 * instantly instead of summarizing on every view.
 *
 * State machine per (user, room), each poll:
 *   - status='active' and user has read past flagged_last_read_message
 *       -> clear to 'quiet', watermark advances to now
 *   - status='active' and user hasn't read further
 *       -> stays 'active', untouched (per design: an active flag is not
 *          papered over by a summary — the user has to actually go look)
 *   - status='quiet', 0 new messages since watermark
 *       -> nothing to do
 *   - status='quiet', 1..NEW_MESSAGE_THRESHOLD new messages
 *       -> summarize, persist to boudicaai_summaries, watermark advances
 *   - status='quiet', > NEW_MESSAGE_THRESHOLD new messages
 *       -> flag 'active' (snapshot current last_read_message), watermark
 *          advances, no summary generated
 */
class DigestService {

    /** More than this many new messages in one poll window -> flag active instead of summarizing. */
    private const NEW_MESSAGE_THRESHOLD = 3;

    public function __construct(
        private IDBConnection $db,
        private BoudicaService $boudicaService,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * Every distinct Nextcloud user id with at least one Talk room
     * membership — the polling job's outer loop.
     */
    public function getActiveTalkUserIds(): array {
        $qb = $this->db->getQueryBuilder();
        $qb->selectDistinct('actor_id')
           ->from('talk_attendees')
           ->where($qb->expr()->eq('actor_type', $qb->createNamedParameter('users')));

        $result = $qb->executeQuery();
        $ids = array_column($result->fetchAll(), 'actor_id');
        $result->closeCursor();
        return $ids;
    }

    /**
     * Rooms this user belongs to, joined with Talk's own live read-state
     * (oc_talk_rooms.token <-> oc_talk_attendees.room_id, keyed by
     * actor_type='users' + actor_id=$userId).
     *
     * @return array<int, array{token: string, name: string, last_read_message: int, unread_messages: int}>
     */
    public function getRoomsForUser(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('r.token', 'r.name', 'a.last_read_message', 'a.unread_messages')
           ->from('talk_rooms', 'r')
           ->innerJoin('r', 'talk_attendees', 'a', $qb->expr()->eq('a.room_id', 'r.id'))
           ->where($qb->expr()->eq('a.actor_type', $qb->createNamedParameter('users')))
           ->andWhere($qb->expr()->eq('a.actor_id', $qb->createNamedParameter($userId)));

        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
        return $rows;
    }

    private function getState(string $userId, string $token): ?array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
           ->from('boudicaai_room_state')
           ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
           ->andWhere($qb->expr()->eq('token', $qb->createNamedParameter($token)));

        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();
        return $row ?: null;
    }

    private function upsertState(string $userId, string $token, array $values): void {
        $existing = $this->getState($userId, $token);
        $values['updated_at'] = time();

        if ($existing === null) {
            $qb = $this->db->getQueryBuilder();
            $insertValues = array_merge([
                'user_id' => $userId,
                'token' => $token,
                'status' => 'quiet',
                'watermark_ts' => 0,
            ], $values);
            $qb->insert('boudicaai_room_state')->values(array_map(
                fn($v) => $qb->createNamedParameter($v),
                $insertValues
            ));
            $qb->executeStatement();
            return;
        }

        $qb = $this->db->getQueryBuilder();
        $qb->update('boudicaai_room_state');
        foreach ($values as $col => $val) {
            $qb->set($col, $qb->createNamedParameter($val));
        }
        $qb->where($qb->expr()->eq('id', $qb->createNamedParameter((int)$existing['id'], \PDO::PARAM_INT)));
        $qb->executeStatement();
    }

    /**
     * Count of real (non-system, non-deleted, non-edit-history) messages
     * in a room since a given timestamp — same filters fetchTranscript()
     * in TalkBotInvokeListener already uses, so this matches what a
     * summary would actually be built from.
     */
    private function countNewMessages(string $token, int $sinceTs): int {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('*', 'c'))
           ->from('boudicaai_messages')
           ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ->andWhere($qb->expr()->gt('timestamp', $qb->createNamedParameter($sinceTs, \PDO::PARAM_INT)))
           ->andWhere($qb->expr()->isNull('deleted_at'))
           ->andWhere($qb->expr()->isNull('edit_of_message_id'))
           ->andWhere($qb->expr()->orX(
               $qb->expr()->isNull('is_system_message'),
               $qb->expr()->eq('is_system_message', $qb->createNamedParameter(false, \PDO::PARAM_BOOL))
           ));

        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();
        return (int)($row['c'] ?? 0);
    }

    /** Same filters as countNewMessages(), but returns the transcript text. */
    private function fetchTranscriptSince(string $token, int $sinceTs): string {
        $qb = $this->db->getQueryBuilder();
        $qb->select('actor_name', 'message', 'timestamp')
           ->from('boudicaai_messages')
           ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ->andWhere($qb->expr()->gt('timestamp', $qb->createNamedParameter($sinceTs, \PDO::PARAM_INT)))
           ->andWhere($qb->expr()->isNull('deleted_at'))
           ->andWhere($qb->expr()->isNull('edit_of_message_id'))
           ->andWhere($qb->expr()->orX(
               $qb->expr()->isNull('is_system_message'),
               $qb->expr()->eq('is_system_message', $qb->createNamedParameter(false, \PDO::PARAM_BOOL))
           ))
           ->orderBy('timestamp', 'ASC');

        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();

        return implode("\n", array_map(
            fn($row) => $row['actor_name'] . ': ' . $row['message'],
            $rows
        ));
    }

    private function saveSummary(string $userId, string $token, string $summaryText, int $messageCount): void {
        $qb = $this->db->getQueryBuilder();
        $qb->insert('boudicaai_summaries')->values([
            'user_id' => $qb->createNamedParameter($userId),
            'token' => $qb->createNamedParameter($token),
            'summary_text' => $qb->createNamedParameter($summaryText),
            'message_count' => $qb->createNamedParameter($messageCount, \PDO::PARAM_INT),
            'generated_at' => $qb->createNamedParameter(time(), \PDO::PARAM_INT),
        ]);
        $qb->executeStatement();
    }

    /**
     * Runs one poll cycle for a single (user, room) pair. This is the
     * state machine described in the class docblock.
     */
    public function pollRoom(string $userId, array $room): void {
        $token = $room['token'];
        $state = $this->getState($userId, $token);
        $status = $state['status'] ?? 'quiet';

        if ($status === 'active') {
            $flaggedLastRead = $state['flagged_last_read_message'] !== null
                ? (int)$state['flagged_last_read_message']
                : null;
            $currentLastRead = (int)$room['last_read_message'];

            if ($flaggedLastRead !== null && $currentLastRead > $flaggedLastRead) {
                // They've been back in Talk and read further — clear the
                // flag. Watermark advances to now so the next poll only
                // looks at genuinely new activity from this point on.
                $this->upsertState($userId, $token, [
                    'status' => 'quiet',
                    'watermark_ts' => time(),
                    'flagged_last_read_message' => null,
                    'flagged_at' => null,
                ]);
            }
            // Otherwise: stays active, untouched. No summarization while active.
            return;
        }

        $watermarkTs = (int)($state['watermark_ts'] ?? 0);
        $newCount = $this->countNewMessages($token, $watermarkTs);

        if ($newCount === 0) {
            return;
        }

        if ($newCount > self::NEW_MESSAGE_THRESHOLD) {
            $this->upsertState($userId, $token, [
                'status' => 'active',
                'watermark_ts' => time(),
                'flagged_last_read_message' => (int)$room['last_read_message'],
                'flagged_at' => time(),
            ]);
            return;
        }

        // 1..NEW_MESSAGE_THRESHOLD new messages — summarize and store.
        $transcript = $this->fetchTranscriptSince($token, $watermarkTs);
        if (trim($transcript) === '') {
            $this->upsertState($userId, $token, ['watermark_ts' => time()]);
            return;
        }

        $summaryPrompt = "Summarize the following chat conversation. "
            . "Only summarize what is actually present below — do not invent names, "
            . "people, or events that are not explicitly in the text. "
            . "If there is little or no substantive content, say so plainly.\n\n"
            . $transcript;

        try {
            $summary = $this->boudicaService->ask($summaryPrompt, $token . '-digest-' . $userId);
        } catch (\Throwable $e) {
            $this->logger->warning("Boudica digest: summarization failed for room {$token}, user {$userId}: " . $e->getMessage());
            return; // leave watermark where it was — retry next poll rather than silently losing these messages
        }

        $this->saveSummary($userId, $token, $summary, $newCount);
        $this->upsertState($userId, $token, ['watermark_ts' => time()]);
    }

    public function pollUser(string $userId): void {
        foreach ($this->getRoomsForUser($userId) as $room) {
            try {
                $this->pollRoom($userId, $room);
            } catch (\Throwable $e) {
                $this->logger->error("Boudica digest: poll failed for room {$room['token']}, user {$userId}: " . $e->getMessage());
            }
        }
    }

    /**
     * What the digest page renders: every room the user has state for,
     * with its current status and (for quiet rooms) latest stored summary.
     */
    public function getDigestForUser(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('token', 'name')
           ->from('talk_rooms', 'r')
           ->innerJoin('r', 'talk_attendees', 'a', $qb->expr()->eq('a.room_id', 'r.id'))
           ->where($qb->expr()->eq('a.actor_type', $qb->createNamedParameter('users')))
           ->andWhere($qb->expr()->eq('a.actor_id', $qb->createNamedParameter($userId)));
        $result = $qb->executeQuery();
        $roomNames = [];
        foreach ($result->fetchAll() as $row) {
            $roomNames[$row['token']] = $row['name'];
        }
        $result->closeCursor();

        $stateQb = $this->db->getQueryBuilder();
        $stateQb->select('*')
            ->from('boudicaai_room_state')
            ->where($stateQb->expr()->eq('user_id', $stateQb->createNamedParameter($userId)));
        $stateResult = $stateQb->executeQuery();
        $states = $stateResult->fetchAll();
        $stateResult->closeCursor();

        $digest = [];
        foreach ($states as $state) {
            $token = $state['token'];
            $entry = [
                'token' => $token,
                'room_name' => $roomNames[$token] ?? $token,
                'status' => $state['status'],
                'updated_at' => (int)$state['updated_at'],
                'summary' => null,
            ];

            if ($state['status'] === 'quiet') {
                $sumQb = $this->db->getQueryBuilder();
                $sumQb->select('summary_text', 'message_count', 'generated_at')
                    ->from('boudicaai_summaries')
                    ->where($sumQb->expr()->eq('user_id', $sumQb->createNamedParameter($userId)))
                    ->andWhere($sumQb->expr()->eq('token', $sumQb->createNamedParameter($token)))
                    ->orderBy('generated_at', 'DESC')
                    ->setMaxResults(1);
                $sumResult = $sumQb->executeQuery();
                $sumRow = $sumResult->fetch();
                $sumResult->closeCursor();
                if ($sumRow) {
                    $entry['summary'] = $sumRow['summary_text'];
                    $entry['message_count'] = (int)$sumRow['message_count'];
                    $entry['generated_at'] = (int)$sumRow['generated_at'];
                }
            }

            $digest[] = $entry;
        }

        usort($digest, fn($a, $b) => $b['updated_at'] <=> $a['updated_at']);
        return $digest;
    }
}
