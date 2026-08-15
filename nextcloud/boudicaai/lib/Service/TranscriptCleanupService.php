<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Service;

use OCP\IConfig;
use OCP\Http\Client\IClientService;
use Psr\Log\LoggerInterface;

/**
 * Sends a raw call transcript to the Boudica inference server (boudi.ca)
 * for LLM cleanup and summarization — fixing ASR errors, working out the
 * conversational structure, and producing something people will actually
 * read.
 *
 * The transcript this receives comes from a MIXED, multi-participant audio
 * track (see JanusTranscriptionCommand::processCallGroup() and
 * MjrAudioExtractor::mixAudioFiles()) — there are no structural speaker
 * labels or per-segment timestamps to work with, since mixing was chosen
 * specifically to avoid a worse problem (Whisper hallucinating on an
 * isolated near-silent solo track). This prompt asks the LLM to work out
 * who's likely speaking from context and produce a genuinely useful
 * summary, rather than just a lightly-cleaned verbatim transcript — a full
 * hour-long, multi-person transcript is not something anyone actually
 * reads (see the original discussion that led to this design).
 *
 * Request contract confirmed against TalkBotInvokeListener::ask() (the
 * existing, working @boudica chat command handler) rather than guessed —
 * same app config keys (api_endpoint/api_key/user_id), same request body
 * shape, same IClientService HTTP client, same response field name
 * ('response'). Two deliberate differences from that method, both
 * appropriate for a one-off task rather than an interactive chat turn:
 *   - use_rag is false here: RAG retrieval augments answers to questions
 *     with relevant retrieved context, which doesn't apply to a rewriting/
 *     summarization task on text that's already fully provided in the
 *     prompt — turning it on would risk injecting irrelevant retrieved
 *     content into the output.
 *   - session_id is a one-off value scoped to this specific call
 *     (transcript-cleanup-{rowId}), not a real conversation session — kept
 *     alongside the same "No Memory." prefix convention used in ask() so
 *     this never accidentally pulls in unrelated conversation history.
 *
 * Deliberately fails soft: any error here returns null rather than
 * throwing, so JanusTranscriptionCommand falls back to emailing the raw
 * transcript instead of losing the whole call over a cleanup failure — the
 * raw transcript is always stored regardless (transcript_raw column), so
 * nothing is lost even if this never successfully runs.
 */
class TranscriptCleanupService {
    private IConfig $config;
    private IClientService $clientService;
    private LoggerInterface $logger;

    public function __construct(
        IConfig $config,
        IClientService $clientService,
        LoggerInterface $logger
    ) {
        $this->config = $config;
        $this->clientService = $clientService;
        $this->logger = $logger;
    }

    public function isAvailable(): bool {
        $endpoint = $this->config->getAppValue('boudicaai', 'api_endpoint', '');
        return !empty($endpoint);
    }

    /**
     * Returns the cleaned transcript, or null if cleanup is unavailable or
     * failed for any reason — callers should fall back to the raw
     * transcript on null, not treat it as a hard error.
     */
    public function cleanupTranscript(string $rawTranscript, int $callRowId): ?string {
        $apiKey = $this->config->getAppValue('boudicaai', 'api_key', '');
        $endpoint = $this->config->getAppValue('boudicaai', 'api_endpoint', '');
        $userId = $this->config->getAppValue('boudicaai', 'user_id', '');

        if (empty($endpoint)) {
            $this->logger->info('Boudica: transcript cleanup skipped — api_endpoint not configured');
            return null;
        }

        $prompt = "No Memory. The following is a raw, auto-generated transcript of a "
            . "phone/video call, labeled by speaker with timestamps. Clean it up: fix "
            . "obvious speech-to-text errors, remove filler words (um, uh) and crosstalk "
            . "artifacts from overlapping speech, and improve readability. Do NOT "
            . "summarize, shorten, or omit any actual content — every real statement made "
            . "in the call should still be present in your output, just cleaned up. Keep "
            . "the speaker labels.\n\nRaw transcript:\n\n{$rawTranscript}";

        try {
            $client = $this->clientService->newClient();
            $response = $client->post($endpoint, [
                'json' => [
                    'message' => $prompt,
                    'session_id' => 'transcript-cleanup-' . $callRowId,
                    'user_id' => $userId,
                    'stream' => false,
                    'api_key' => $apiKey,
                    'temperature' => 0.3,
                    'max_tokens' => 15000,
                    // Deliberately false — see class docblock. This is a
                    // rewriting task on text already fully provided in the
                    // prompt, not a question that benefits from retrieval.
                    'use_rag' => false,
                ],
                'timeout' => 90,
            ]);

            $data = json_decode($response->getBody(), true);
            $cleaned = $data['response'] ?? null;

            if (!$cleaned || !is_string($cleaned)) {
                $this->logger->warning('Boudica: cleanup API responded but no "response" field found — check the API contract hasn\'t changed');
                return null;
            }

            return trim($cleaned);

        } catch (\Throwable $e) {
            $this->logger->warning('Boudica: transcript cleanup failed, falling back to raw transcript: ' . $e->getMessage());
            return null;
        }
    }
}