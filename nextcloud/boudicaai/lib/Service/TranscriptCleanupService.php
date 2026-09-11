<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Service;

use OCP\IConfig;
use Psr\Log\LoggerInterface;
use GuzzleHttp\Client;

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
    private Client $httpClient;
    private LoggerInterface $logger;

    // Raw GuzzleHttp\Client rather than OCP\Http\Client\IClientService -
    // same reason as BoudicaService.php (this class's own docblock says
    // "same IClientService HTTP client" as that class, which was
    // inaccurate even before that fix: IClientService's SSRF guard
    // rejects this app's own configured api_endpoint - "Host ... violates
    // local access rules" - since it doesn't resolve as a conventional
    // public address from inside this stack's Docker network). Confirmed
    // live 2026-09-05, found while verifying the automatic call-
    // transcription flow end-to-end (this method was silently failing
    // soft and falling back to the raw transcript on every real call,
    // never actually producing the LLM-cleaned/summarized version).
    public function __construct(
        IConfig $config,
        LoggerInterface $logger
    ) {
        $this->config = $config;
        $this->logger = $logger;
        $this->httpClient = new Client();
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

        // Rewritten 2026-09-05: this used to say "Do NOT summarize, shorten,
        // or omit any actual content" - directly contradicting the class's
        // own documented intent above ("produce a genuinely useful
        // summary... not a lightly-cleaned verbatim transcript") and the
        // actual reported symptom on the live server: with zero structure
        // requested and an explicit ban on condensing, the model has
        // nothing to do but hand back one long paragraph. Now genuinely
        // asks for a structured summary, with a plain-text format (no
        // markdown ** / # - TranscriptEmailService renders this inside a
        // white-space:pre-wrap block, not through an HTML markdown
        // renderer, so literal markdown syntax would just show up as-is).
        //
        // Rewritten again 2026-09-11: this previously used literal quote
        // marks around the mishearing examples (e.g. "buddhica" means
        // "Boudica") and around the bullet marker. Confirmed live via a
        // byte-precise bisection of the actual request that inference_server
        // silently drops everything in the message after the FIRST embedded
        // double-quote character - prompt_tokens plateaued at exactly the
        // same value regardless of how much text followed it, all the way
        // up to the real 3497-character prompt. Root cause not yet found
        // (parse_json_string() itself correctly handles \" escaping, so
        // this is happening somewhere else downstream); this rewrite is a
        // workaround, not a fix - avoids embedded quote characters
        // entirely rather than depending on them being handled correctly.
        // Also adds an explicit "minimal reasoning" instruction: this model
        // is a "thinking" model that can spend its entire token budget on
        // internal reasoning before ever producing an answer (confirmed:
        // "[Response incomplete: generation ran out of budget while
        // reasoning. Please retry.]"), and this exact phrasing reliably
        // suppresses that in the live chat UI.
        $prompt = "No Memory. Keep your reasoning to a minimum. The following is a "
            . "raw, auto-generated transcript of a "
            . "phone/video call. Produce a clear, well-organized summary for the "
            . "participants — something someone can skim in under a minute, not a "
            . "verbatim cleanup. Only include what is explicitly present in the "
            . "transcript; never invent names, people, decisions, or events that "
            . "weren't actually said. The transcript comes from imperfect "
            . "speech-to-text, so silently correct obvious mishearings of this "
            . "product's own names when you're confident that's what was meant - "
            . "e.g. buddhica or ludicrous office means Boudica or Boudica Office, "
            . "and booty.ca or my booty means boudi.ca or MyBoudica. "
            . "Don't guess at unrelated words this way, only this product's own "
            . "recurring, predictable mishearings.\n\n"
            . "Format your response as plain text using exactly this structure — "
            . "skip a section entirely if the transcript has nothing for it (don't "
            . "write the word None), and use blank lines between sections:\n\n"
            . "OVERVIEW\n"
            . "One or two sentences on what the call was about.\n\n"
            . "KEY DISCUSSION POINTS\n"
            . "- One bullet per topic actually discussed, each starting with a dash and a space.\n\n"
            . "DECISIONS\n"
            . "- Any concrete decisions that were made.\n\n"
            . "ACTION ITEMS\n"
            . "- Any follow-up tasks mentioned, naming who's responsible if that's "
            . "clear from the transcript.\n\n"
            . "Do not use markdown symbols like ** or #.\n\n"
            . "Raw transcript:\n\n{$rawTranscript}";

        try {
            $response = $this->httpClient->post($endpoint, [
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
                    // 2026-09-11: a real call transcript almost always
                    // contains the word "then" as ordinary conversation,
                    // which false-positives inference_server.cpp's
                    // AgenticWorkflow::is_multi_task() keyword heuristic
                    // (built for short commands like "check my email then
                    // my calendar") — the request got silently misrouted
                    // through the agentic planner, which dropped this
                    // prompt's actual summarization instructions and left
                    // the model staring at a bare transcript with no task,
                    // producing a garbage "please provide the transcript"
                    // reply that then got emailed to participants as the
                    // summary. This is a one-off rewriting task on text
                    // already fully provided above, never a multi-step
                    // command — opt out explicitly rather than rely on the
                    // heuristic not misfiring.
                    'allow_agentic' => false,
                ],
                'timeout' => 90,
                // Same local/trial, no-external-exposure self-signed-cert
                // tradeoff already applied to BoudicaService.php.
                'verify' => false,
            ]);

            // getBody() returns a GuzzleHttp\Psr7\Stream, not a string -
            // json_decode() needs a string. Confirmed live 2026-09-10: this
            // threw a TypeError on every real call, meaning cleanup never
            // actually ran once, ever - every transcript sent so far
            // silently fell back to the raw, unpunctuated wall of text
            // regardless of how well the prompt above was written.
            $data = json_decode((string) $response->getBody(), true);
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