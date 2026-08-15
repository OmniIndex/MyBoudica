<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Listener;

use OCA\Talk\Events\BotInvokeEvent;
use OCA\BoudicaAi\Service\BoudicaService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IDBConnection;
use Psr\Log\LoggerInterface;

class TalkBotInvokeListener implements IEventListener {

    private BoudicaService $boudicaService;
    private LoggerInterface $logger;
    private IDBConnection $db;

    public function __construct(
        BoudicaService $boudicaService,
        LoggerInterface $logger,
        IDBConnection $db
    ) {
        $this->boudicaService = $boudicaService;
        $this->logger = $logger;
        $this->db = $db;
    }

    public function handle(Event $event): void {
        if (!($event instanceof BotInvokeEvent)) {
            return;
        }

        $message = $event->getMessage();

        if (!in_array($message['type'] ?? null, ['Activity', 'Create'], true)) {
            return;
        }

        $content = $message['object']['content'] ?? '';
        $senderName = $message['actor']['name'] ?? 'someone';
        $token = $message['target']['id'] ?? null;

        // Talk's content field is a JSON-encoded parameterized message, not plain text
        $decoded = json_decode($content, true);
        $plainText = $decoded['message'] ?? $content; // fallback to raw if decode fails

        // Replace {mention-xxx} placeholders with display names
        if (isset($decoded['parameters']) && is_array($decoded['parameters'])) {
            foreach ($decoded['parameters'] as $placeholder => $param) {
                $name = $param['name'] ?? '';
                $plainText = str_replace('{' . $placeholder . '}', $name, $plainText);
            }
        }

        // Log every real message to our own table, regardless of whether it mentions the bot.
        // This builds a running transcript we can query later without calling Talk's API at all.
        if ($token && trim($plainText) !== '') {
            try {
                $this->logMessage($token, $senderName, $plainText);
            } catch (\Throwable $e) {
                // Never let logging failures break normal bot operation
                $this->logger->warning('Boudica message logging failed: ' . $e->getMessage());
            }
        }

        if (!str_contains(strtolower($plainText), 'boudica')) {
            return; // not a request for the bot — logging is done, nothing more to do
        }

        $sessionId = $token ?? 'talk-default';
        $prompt = trim(preg_replace('/@?boudica/i', '', $plainText));

        if ($prompt === '') {
            $event->addAnswer("Hi {$senderName}, what would you like me to help with?");
            return;
        }

        // Check for summarize intent BEFORE treating this as a normal question
        if (preg_match('/summari[sz]e/i', $prompt)) {
            $this->handleSummarize($event, $prompt, $sessionId, $token);
            return;
        }

        // Normal Q&A path
        try {
            $reply = $this->boudicaService->ask($prompt, $sessionId);
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica Talk bot failed: ' . $e->getMessage());
            $reply = "Sorry, I couldn't generate a response right now.";
        }

        $event->addAnswer($reply);
    }

    private function logMessage(string $token, string $actorName, string $message): void {
        $qb = $this->db->getQueryBuilder();
        $qb->insert('boudicaai_messages')
           ->values([
               'token' => $qb->createNamedParameter($token),
               'actor_name' => $qb->createNamedParameter($actorName),
               'message' => $qb->createNamedParameter($message),
               'timestamp' => $qb->createNamedParameter(time(), \PDO::PARAM_INT),
           ]);
        $qb->executeStatement();
    }

    private function handleSummarize(Event $event, string $prompt, string $sessionId, ?string $token): void {
        if (!$token) {
            $event->addAnswer("I couldn't figure out which conversation to summarize.");
            return;
        }

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

        return $now - 3600; // default fallback
    }

    private function fetchTranscript(string $token, int $sinceTimestamp): string {
        $qb = $this->db->getQueryBuilder();
        $qb->select('actor_name', 'message', 'timestamp')
           ->from('boudicaai_messages')
           ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ->andWhere($qb->expr()->gte('timestamp', $qb->createNamedParameter($sinceTimestamp, \PDO::PARAM_INT)))
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
}