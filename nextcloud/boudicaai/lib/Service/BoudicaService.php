<?php
namespace OCA\BoudicaAi\Service;

use OCP\IConfig;
use OCP\Http\Client\IClientService;
use OCP\ICacheFactory;
use OCP\ICache;
use Psr\Log\LoggerInterface;

class BoudicaService {
    private ICache $cache;

    public function __construct(
        private IClientService $clientService,
        private IConfig $config,
        ICacheFactory $cacheFactory,
        private LoggerInterface $logger
    ) {
        $this->cache = $cacheFactory->createDistributed('boudicaai_history');
    }

    private function getHistory(string $sessionId): array {
        $json = $this->cache->get($sessionId);
        return $json ? json_decode($json, true) : [];
    }

    private function saveHistory(string $sessionId, array $history): void {
        $history = array_slice($history, -6); // Keep only the last 6 messages to limit context size
        // TTL in seconds — e.g. 6 hours of inactivity before context resets
        $this->cache->set($sessionId, json_encode($history), 6 * 3600);
    }    

    public function ask(string $prompt, string $sessionId): string {
        $apiKey = $this->config->getAppValue('boudicaai', 'api_key', '');
        $endpoint = $this->config->getAppValue('boudicaai', 'api_endpoint', '');
        $user = $this->config->getAppValue('boudicaai', 'user_id', '');


        $history = $this->getHistory($sessionId);
        $contextLines = array_map(
            fn($h) => $h['role'] . ': ' . $h['content'],
            $history
        );
        $fullPrompt = $contextLines
            ? implode("\n", $contextLines) . "\nuser: " . $prompt
            : $prompt;
    
        $this->logger->info('Boudica full prompt for session ' . $sessionId . ': ' . $fullPrompt);
      

        $client = $this->clientService->newClient();
        $response = $client->post($endpoint, [
            'json' => [
                'message' => 'No Memory. ' . $fullPrompt,
                'session_id' => 'talk-' . $sessionId,
                'user_id' => $user,
                'stream' => false,
                'api_key' => $apiKey,
                'temperature' => 0.8,
                'max_tokens' => 15000,
                'use_rag' => true,
                'inference_type' => 'nextcloud_summarizer',
            ],
            'timeout' => 90,
        ]);

        $data = json_decode($response->getBody(), true);
        return $data['response'] ?? 'Sorry, I could not generate a response.';
    }
}  