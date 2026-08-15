<?php

namespace OCA\BoudicaCode\Service;

/**
 * Thin HTTP client for the existing Boudica inference server — ported
 * from the Python CLI's boudica_mod.py (BoudicaClient). Only the two
 * endpoints Boudica Code actually needs are implemented (chat, generate);
 * see boudica_mod.py for the fuller surface (oauth, agents, etc.) if more
 * is ever needed.
 *
 * Configuration is read from the SAME environment variables the Python
 * CLI used, so an existing deployment's credentials work unchanged:
 *   BOUDICA_URL       base URL, e.g. https://boudi.ca/api/boudica
 *   BOUDICA_API_KEY   required — sent as "Authorization: Bearer ..."
 *   BOUDICA_USER_ID   optional, defaults to 'boudica-code-agent'
 *
 * Runs server-side (this file never ships to the browser) specifically
 * so BOUDICA_API_KEY never has to touch client JS.
 */
class BoudicaAiClient {

    private string $baseUrl;
    private ?string $apiKey;
    private string $userId;
    private string $model;
    private int $timeoutSeconds;

    public function __construct() {
        $this->baseUrl = rtrim(getenv('BOUDICA_URL') ?: 'https://boudi.ca/api/boudica', '/');
        $this->apiKey = getenv('BOUDICA_API_KEY') ?: null;
        $this->userId = getenv('BOUDICA_USER_ID') ?: 'boudica-code-agent';
        $this->model = getenv('BOUDICA_MODEL') ?: 'mistral-large-675b';
        $this->timeoutSeconds = 120;
    }

    public function isConfigured(): bool {
        return !empty($this->apiKey);
    }

    /** @throws BoudicaAiException */
    public function chat(string $message, array $opts = []): string {
        $data = array_merge(['message' => $message, 'model' => $this->model], $opts);
        $response = $this->request('/chat', $data);
        return $this->extractText($response);
    }

    /** @throws BoudicaAiException */
    public function generate(string $prompt, array $opts = []): string {
        $data = array_merge(['prompt' => $prompt, 'model' => $this->model], $opts);
        $response = $this->request('/generate', $data);
        return $this->extractText($response);
    }

    private function extractText(array $response): string {
        foreach (['response', 'message', 'generated_text', 'text'] as $key) {
            if (!empty($response[$key]) && is_string($response[$key])) {
                return $response[$key];
            }
        }
        return '';
    }

    /** @throws BoudicaAiException */
    private function request(string $endpoint, array $data): array {
        if (!$this->isConfigured()) {
            throw new BoudicaAiException(
                'BOUDICA_API_KEY is not set on the server — Boudica Code cannot reach the inference '
                . 'server. Set it in the Apache/PHP-FPM environment for the nextcloud container, same '
                . 'as the Python CLI required.'
            );
        }

        $url = $this->baseUrl . '/' . ltrim($endpoint, '/') . '?' . http_build_query(['user_id' => $this->userId]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($data),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->apiKey,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
        ]);

        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            throw new BoudicaAiException("Could not reach Boudica inference server: {$error}");
        }
        if ($status === 401) {
            throw new BoudicaAiException('Boudica inference server rejected the API key (401).');
        }
        if ($status < 200 || $status >= 300) {
            throw new BoudicaAiException("Boudica inference server returned HTTP {$status}: " . substr((string)$body, 0, 300));
        }

        $decoded = json_decode((string)$body, true);
        if (!is_array($decoded)) {
            throw new BoudicaAiException('Boudica inference server returned a non-JSON response.');
        }
        return $decoded;
    }
}

class BoudicaAiException extends \RuntimeException {
}
