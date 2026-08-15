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
            ],
            'timeout' => 90,
        ]);

        $data = json_decode($response->getBody(), true);
        return $data['response'] ?? 'Sorry, I could not generate a response.';
    }

    /**
     * Uploads a file's raw bytes as multipart context, mirroring exactly what
     * boudica_widget.js does in callBoudicaAPI() when files are attached —
     * the file streams up as a real multipart part, never read into PHP text
     * and embedded inline. Reuses the same endpoint/api_key/user_id config as
     * ask(), and the same 'talk-' session id prefix, so uploads and later
     * chat turns in the same Talk conversation share context correctly.
     */
    public function uploadFileContext(string $sessionId, string $fileName, $stream, string $note = ''): bool {
        $apiKey = $this->config->getAppValue('boudicaai', 'api_key', '');
        $endpoint = $this->config->getAppValue('boudicaai', 'api_endpoint', '');
        $user = $this->config->getAppValue('boudicaai', 'user_id', '');

        try {
            $client = $this->clientService->newClient();
            $client->post($endpoint, [
                'multipart' => [
                    ['name' => 'message', 'contents' => $note !== '' ? $note : "[File shared: {$fileName}]"],
                    ['name' => 'session_id', 'contents' => 'talk-' . $sessionId],
                    ['name' => 'user_id', 'contents' => $user],
                    ['name' => 'stream', 'contents' => 'false'],
                    ['name' => 'api_key', 'contents' => $apiKey],
                    ['name' => 'use_rag', 'contents' => 'true'],
                    ['name' => 'document_count', 'contents' => '1'],
                    ['name' => 'filename_0', 'contents' => $fileName],
                    [
                        'name' => 'document_0',
                        'contents' => $stream,
                        'filename' => $fileName,
                    ],
                ],
                'timeout' => 90,
            ]);
            $this->logger->info("Boudica: uploaded file '{$fileName}' as context for session {$sessionId}");
            return true;
        } catch (\Throwable $e) {
            $this->logger->error("Boudica: failed to upload file '{$fileName}' for session {$sessionId}: " . $e->getMessage());
            return false;
        }
    }
}