<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Listener;

use OCA\Talk\Events\BotInvokeEvent;
use OCA\BoudicaAi\Service\BoudicaService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Http\Client\IClientService;
use OCP\IConfig;
use OCP\IURLGenerator;
use Psr\Log\LoggerInterface;

class TalkBotInvokeListener implements IEventListener {

    private BoudicaService $boudicaService;
    private LoggerInterface $logger;
    private IClientService $clientService;
    private IConfig $config;
    private IURLGenerator $urlGenerator;

    public function __construct(
        BoudicaService $boudicaService,
        LoggerInterface $logger,
        IClientService $clientService,
        IConfig $config,
        IURLGenerator $urlGenerator
    ) {
        $this->boudicaService = $boudicaService;
        $this->logger = $logger;
        $this->clientService = $clientService;
        $this->config = $config;
        $this->urlGenerator = $urlGenerator;
    }

    public function handle(Event $event): void {
        if (!($event instanceof BotInvokeEvent)) {
            return;
        }

        $this->logger->info('TalkBotInvokeListener triggered');

        $message = $event->getMessage();

        $this->logger->info($message['object']['content'] ?? 'No content in message');

        if (!in_array($message['type'] ?? null, ['Activity', 'Create'], true)) {
            return;
        }

        $content = $message['object']['content'] ?? '';
        $senderName = $message['actor']['name'] ?? 'someone';

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

        if (!str_contains(strtolower($plainText), 'boudica')) {
            return;
        }

        $sessionId = $message['target']['id'] ?? 'talk-default';
        $prompt = trim(preg_replace('/@?boudica/i', '', $plainText));

        if ($prompt === '') {
            $event->addAnswer("Hi {$senderName}, what would you like me to help with?");
            return;
        }

        // Check for summarize intent BEFORE treating this as a normal question
        if (preg_match('/summari[sz]e/i', $prompt)) {
            $this->handleSummarize($event, $prompt, $sessionId, $message);
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


    private function handleSummarize(Event $event, string $prompt, string $sessionId, array $message): void {
        $token = $message['target']['id'] ?? null;
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

        if (trim($transcript) === '') {
            $event->addAnswer("There don't seem to be any messages in that period to summarize.");
            return;
        }

        $summaryPrompt = "Summarize the following chat conversation concisely:\n\n" . $transcript;

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
        $botUser = $this->config->getAppValue('boudicaai', 'nc_bot_user', '');
        $botPassword = $this->config->getAppValue('boudicaai', 'nc_bot_app_password', '');
        $baseUrl = $this->urlGenerator->getAbsoluteURL('/ocs/v2.php/apps/spreed/api/v1/chat/' . $token);

        $collected = [];
        $lastKnownMessageId = 0;
        $maxPages = 20;

        for ($i = 0; $i < $maxPages; $i++) {
            $client = $this->clientService->newClient();
            $response = $client->get($baseUrl, [
                'auth' => [$botUser, $botPassword],
                'headers' => [
                    'OCS-APIRequest' => 'true',
                    'Accept' => 'application/json',
                ],
                'query' => [
                    'lookIntoFuture' => 0,
                    'limit' => 200,
                    'lastKnownMessageId' => $lastKnownMessageId,
                ],
            ]);

            $data = json_decode($response->getBody(), true);
            $messages = $data['ocs']['data'] ?? [];

            if (empty($messages)) {
                break;
            }

            $reachedCutoff = false;
            foreach ($messages as $msg) {
                if (($msg['timestamp'] ?? 0) < $sinceTimestamp) {
                    $reachedCutoff = true;
                    continue;
                }
                $collected[] = $msg;
            }

            if ($reachedCutoff) {
                break;
            }

            $lastKnownMessageId = (int) ($response->getHeader('X-Chat-Last-Given') ?: 0);
            if ($lastKnownMessageId === 0) {
                break;
            }
        }

        usort($collected, fn($a, $b) => $a['timestamp'] <=> $b['timestamp']);

        $lines = [];
        foreach ($collected as $msg) {
            $actor = $msg['actorDisplayName'] ?? 'someone';
            $text = $msg['message'] ?? '';
            if (!empty($msg['messageParameters'])) {
                foreach ($msg['messageParameters'] as $placeholder => $param) {
                    $name = $param['name'] ?? '';
                    $text = str_replace('{' . $placeholder . '}', $name, $text);
                }
            }
            if (trim($text) === '') {
                continue;
            }
            $lines[] = $actor . ': ' . $text;
        }

        return implode("\n", $lines);
    }    
}