<?php
namespace OCA\BoudicaAi\Service;

use OCP\IConfig;
use OCP\ICacheFactory;
use OCP\ICache;
use Psr\Log\LoggerInterface;
use GuzzleHttp\Client;

class BoudicaService {
    private ICache $cache;
    private Client $httpClient;

    // Raw GuzzleHttp\Client rather than OCP\Http\Client\IClientService -
    // IClientService's SSRF guard rejects this app's own configured
    // api_endpoint ("Host ... violates local access rules") since it
    // doesn't resolve as a conventional public address from inside this
    // stack's Docker network. Same pattern already used by
    // KeycloakProvisioningService/TranscriptionService for the identical
    // reason. Confirmed live 2026-09-05: every @boudica Talk mention was
    // failing with a generic "Sorry, I couldn't generate a response right
    // now." while the real error ("violates local access rules") only
    // showed up in the Nextcloud log.
    public function __construct(
        private IConfig $config,
        ICacheFactory $cacheFactory,
        private LoggerInterface $logger
    ) {
        $this->cache = $cacheFactory->createDistributed('boudicaai_history');
        $this->httpClient = new Client();
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
      

        $response = $this->httpClient->post($endpoint, [
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
            // Same self-signed-cert tradeoff already applied to the
            // signaling server (server.conf's [backend] skipverify) and
            // occ talk:signaling:add (no --verify) for this local/trial
            // deployment with no external exposure - Guzzle does full
            // cert-chain validation by default with no way to trust a
            // self-signed cert short of this, confirmed live 2026-09-05
            // ("cURL error 60: SSL certificate problem: self-signed
            // certificate"). A deployment with a real CA-signed cert
            // should remove this.
            'verify' => false,
        ]);

        $data = json_decode($response->getBody(), true);
        return $data['response'] ?? 'Sorry, I could not generate a response.';
    }
}  