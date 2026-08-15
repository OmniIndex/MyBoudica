<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Service;

use OCP\IConfig;
use Psr\Log\LoggerInterface;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;

/**
 * Service for transcribing audio using local Whisper microservice
 * All processing is sandboxed - no external API calls
 */
class TranscriptionService {

    private IConfig $config;
    private LoggerInterface $logger;
    private Client $httpClient;
    private ?string $whisperServiceUrl;

    public function __construct(
        IConfig $config,
        LoggerInterface $logger
    ) {
        $this->config = $config;
        $this->logger = $logger;
        $this->httpClient = new Client(['timeout' => 600]); // 10 minute timeout for large files
        $this->whisperServiceUrl = $config->getAppValue('boudicaai', 'whisper_service_url', null);
    }

    /**
     * Check if transcription service is available
     */
    public function isServiceAvailable(): bool {
        if (!$this->whisperServiceUrl) {
            return false;
        }

        try {
            $response = $this->httpClient->get($this->whisperServiceUrl . '/health');
            return $response->getStatusCode() === 200;
        } catch (GuzzleException $e) {
            $this->logger->warning('Whisper service health check failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Transcribe an audio file
     * 
     * @param string $filePath Full path to audio file
     * @param string|null $language ISO-639-1 language code (e.g., 'en', 'de', 'fr')
     * @return string Transcribed text
     * @throws \Exception if transcription fails
     */
    public function transcribeFile(string $filePath, ?string $language = null): string {
        if (!file_exists($filePath)) {
            throw new \Exception('Audio file not found: ' . $filePath);
        }

        if (!$this->isServiceAvailable()) {
            throw new \Exception('Whisper transcription service is not available');
        }

        try {
            $this->logger->info('Sending file to Whisper service: ' . basename($filePath));

            $multipart = [
                [
                    'name' => 'audio',
                    'contents' => fopen($filePath, 'r'),
                    'filename' => basename($filePath),
                ]
            ];

            if ($language) {
                $multipart[] = [
                    'name' => 'language',
                    'contents' => $language,
                ];
            }

            $response = $this->httpClient->post(
                $this->whisperServiceUrl . '/transcribe',
                ['multipart' => $multipart]
            );

            $result = json_decode($response->getBody()->getContents(), true);

            if ($result['status'] !== 'success') {
                throw new \Exception('Transcription failed: ' . ($result['error'] ?? 'Unknown error'));
            }

            $transcript = $result['transcript'] ?? '';
            $this->logger->info('Transcription successful, length: ' . strlen($transcript) . ' chars');

            return $transcript;

        } catch (GuzzleException $e) {
            $this->logger->error('Whisper HTTP request failed: ' . $e->getMessage());
            throw new \Exception('Transcription service error: ' . $e->getMessage());
        } catch (\Throwable $e) {
            $this->logger->error('Transcription error: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Transcribe with detailed segments (timestamps, confidence)
     * 
     * @param string $filePath Full path to audio file
     * @param string|null $language ISO-639-1 language code
     * @return array Array with transcript and segments
     * @throws \Exception if transcription fails
     */
    public function transcribeFileWithSegments(string $filePath, ?string $language = null): array {
        if (!file_exists($filePath)) {
            throw new \Exception('Audio file not found: ' . $filePath);
        }

        if (!$this->isServiceAvailable()) {
            throw new \Exception('Whisper transcription service is not available');
        }

        try {
            $this->logger->info('Sending file with segments to Whisper: ' . basename($filePath));

            $multipart = [
                [
                    'name' => 'audio',
                    'contents' => fopen($filePath, 'r'),
                    'filename' => basename($filePath),
                ]
            ];

            if ($language) {
                $multipart[] = [
                    'name' => 'language',
                    'contents' => $language,
                ];
            }

            $response = $this->httpClient->post(
                $this->whisperServiceUrl . '/transcribe/segments',
                ['multipart' => $multipart]
            );

            $result = json_decode($response->getBody()->getContents(), true);

            if ($result['status'] !== 'success') {
                throw new \Exception('Transcription failed: ' . ($result['error'] ?? 'Unknown error'));
            }

            $this->logger->info('Transcription with segments successful, segments: ' . count($result['segments'] ?? []));

            return $result;

        } catch (GuzzleException $e) {
            $this->logger->error('Whisper HTTP request failed: ' . $e->getMessage());
            throw new \Exception('Transcription service error: ' . $e->getMessage());
        } catch (\Throwable $e) {
            $this->logger->error('Transcription error: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Get Whisper service status
     */
    public function getServiceStatus(): ?array {
        if (!$this->whisperServiceUrl) {
            return null;
        }

        try {
            $response = $this->httpClient->get($this->whisperServiceUrl . '/status');
            return json_decode($response->getBody()->getContents(), true);
        } catch (GuzzleException $e) {
            $this->logger->warning('Could not retrieve Whisper status: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Get available Whisper models
     */
    public function getAvailableModels(): ?array {
        if (!$this->whisperServiceUrl) {
            return null;
        }

        try {
            $response = $this->httpClient->get($this->whisperServiceUrl . '/models');
            return json_decode($response->getBody()->getContents(), true);
        } catch (GuzzleException $e) {
            $this->logger->warning('Could not retrieve Whisper models: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Set the Whisper service URL (called from settings)
     */
    public function setServiceUrl(string $url): void {
        $this->whisperServiceUrl = $url;
        $this->config->setAppValue('boudicaai', 'whisper_service_url', $url);
        $this->logger->info('Whisper service URL set to: ' . $url);
    }

    /**
     * Get the current Whisper service URL
     */
    public function getServiceUrl(): ?string {
        return $this->whisperServiceUrl;
    }
}
