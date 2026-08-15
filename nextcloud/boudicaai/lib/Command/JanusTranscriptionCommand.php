<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Command;

use OCP\IConfig;
use OCP\IDBConnection;
use OCA\BoudicaAi\Service\JanusRecordingMonitor;
use OCA\BoudicaAi\Service\MjrAudioExtractor;
use OCA\BoudicaAi\Service\TranscriptionService;
use OCA\BoudicaAi\Service\TranscriptEmailService;
use OCA\BoudicaAi\Service\CallParticipantService;
use OCA\BoudicaAi\Service\TranscriptCleanupService;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * Scans for newly-recorded Janus .mjr files, extracts audio, transcribes it,
 * and emails participants.
 *
 * Rewritten to remove the old docker-cp step entirely. Janus is now a native
 * process (not a Docker container called "nextcloud-hpb"), and its recordings
 * directory is bind-mounted directly into this Nextcloud container at
 * RECORDINGS_DIR below — there is nothing to copy, we just read the files
 * where they already are.
 *
 * Also reconciles this command with CallRecordingListener's schema: that
 * listener creates a 'recording' row in boudicaai_call_transcripts (with
 * token/call_id/user_id/call_started_at) the moment a real Talk call starts,
 * using the real CallStartedEvent/CallEndedEvent. This command matches each
 * recording file back to that row (see matchTranscriptRow()) by the
 * timestamp embedded in Janus's filename, so a transcript produced here is
 * visible to "@boudica call summary" in TalkBotInvokeListener, which queries
 * by token/user_id — the two code paths previously wrote into different,
 * disconnected columns of the same table.
 *
 * IMPORTANT — multi-participant handling: Janus records each participant's
 * publisher stream as a SEPARATE .mjr file; there is no single "mixed room"
 * recording. A 3-person call produces 3 independent solo audio tracks. This
 * command groups every file that matches the same call row (see execute())
 * and MIXES them into one combined audio file (MjrAudioExtractor::
 * mixAudioFiles()) before transcribing once — rather than transcribing each
 * participant's track separately. An earlier version did the latter (with
 * per-segment speaker labels merged onto a shared timeline), but that was
 * reverted after confirming directly that it reintroduces hallucination: a
 * participant who's mostly listening rather than talking has a genuinely
 * near-silent solo track, and feeding that to Whisper in isolation is
 * exactly the scenario that produces fabricated content. Mixing avoids
 * this by construction, since real audio from whoever else is talking is
 * always present in the combined signal — at the cost of losing precise
 * per-speaker attribution, which the LLM cleanup pass below is now asked
 * to work out from context instead.
 *
 * The raw mixed transcript is optionally sent to TranscriptCleanupService
 * for an LLM cleanup/summary pass before emailing — see that class's
 * docblock for the confirmed request contract (matched against the
 * existing, working @boudica chat command handler, not guessed). Both the
 * raw and cleaned/summarized versions are stored (transcript_raw /
 * transcript_text) regardless of whether cleanup succeeds, so nothing is
 * lost if that step ever fails.
 */
class JanusTranscriptionCommand extends Command {
    protected static $defaultName = 'boudicaai:janus-transcribe';

    // Distinguishes a genuine failure (mark processed, never retry) from a
    // file that simply hasn't matched a call row *yet* (leave unmarked, the
    // next cron run should succeed once the call has actually ended).
    private const RESULT_SUCCESS = 'success';
    private const RESULT_FAILED = 'failed';
    private const RESULT_NOT_YET_MATCHED = 'not_yet_matched';

    // Bind-mounted from the native Janus host's recordings directory
    // (/opt/janus/share/janus/recordings) into this container. See the
    // `docker run` recreate command used to set this mount up — if that
    // mount path ever changes, update this constant to match.
    private const RECORDINGS_DIR = '/mnt/janus-recordings';

    // How far apart (in seconds) a recording file's embedded timestamp and a
    // call_transcripts row's call_started_at can be and still be considered
    // the same call. Generous window because a call may run long after the
    // recording's first file was opened.
    private const MATCH_WINDOW_BEFORE = 120;
    private const MATCH_WINDOW_AFTER = 6 * 3600;

    private IConfig $config;
    private IDBConnection $db;
    private LoggerInterface $logger;
    private TranscriptionService $transcriptionService;
    private TranscriptEmailService $emailService;
    private CallParticipantService $participantService;
    private TranscriptCleanupService $cleanupService;

    public function __construct(
        IConfig $config,
        IDBConnection $db,
        LoggerInterface $logger,
        TranscriptionService $transcriptionService,
        TranscriptEmailService $emailService,
        CallParticipantService $participantService,
        TranscriptCleanupService $cleanupService
    ) {
        parent::__construct();
        $this->config = $config;
        $this->db = $db;
        $this->logger = $logger;
        $this->transcriptionService = $transcriptionService;
        $this->emailService = $emailService;
        $this->participantService = $participantService;
        $this->cleanupService = $cleanupService;
    }

    protected function configure(): void {
        $this->setDescription('Scan for new Janus call recordings, transcribe them, and email participants');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int {
        $output->writeln('Starting Janus recording transcription...');

        if (!MjrAudioExtractor::isAvailable()) {
            $output->writeln('<error>ffmpeg not available - cannot extract audio</error>');
            return Command::FAILURE;
        }

        if (!is_dir(self::RECORDINGS_DIR)) {
            $output->writeln('<error>Recordings directory not found: ' . self::RECORDINGS_DIR . '</error>');
            $this->logger->error('Boudica: recordings directory missing: ' . self::RECORDINGS_DIR);
            return Command::FAILURE;
        }

        // NOTE: assumes JanusRecordingMonitor's constructor accepts a
        // directory to scan. If it currently hardcodes a path internally,
        // update it to accept this instead of hardcoding "/recordings".
        $monitor = new JanusRecordingMonitor($this->logger, self::RECORDINGS_DIR);
        $newRecordings = $monitor->getNewRecordings();

        if (empty($newRecordings)) {
            $output->writeln('No new recordings to process');
            return Command::SUCCESS;
        }

        $output->writeln('Found ' . count($newRecordings) . ' new recording(s)');

        // Separate non-audio files immediately — nothing to group, mark
        // processed and move on (see MjrAudioExtractor::isAudioRecording()).
        $audioFiles = [];
        foreach ($newRecordings as $mjrFile) {
            if (!MjrAudioExtractor::isAudioRecording($mjrFile)) {
                $monitor->markProcessed($mjrFile);
                continue;
            }
            $audioFiles[] = $mjrFile;
        }

        if (empty($audioFiles)) {
            $output->writeln('No new audio recordings to process');
            return Command::SUCCESS;
        }

        // Group audio files by which call they actually belong to. Janus
        // records each participant's publisher stream as a SEPARATE .mjr
        // file — a 3-person call produces 3 independent solo audio tracks,
        // not one shared room recording. Grouping them here (by matching
        // each file's embedded timestamp to the same call_transcripts row)
        // means each call gets transcribed ONCE, from everyone's audio
        // mixed together — see processCallGroup() and MjrAudioExtractor::
        // mixAudioFiles() for why mixing rather than transcribing each
        // track separately.
        $groups = [];    // rowId => array of .mjr file paths
        $unmatched = [];

        foreach ($audioFiles as $mjrFile) {
            $fileTimestamp = $this->extractTimestampFromFilename(basename($mjrFile));
            $matched = $this->matchTranscriptRow($fileTimestamp);

            if ($matched === null) {
                $unmatched[] = $mjrFile;
                continue;
            }

            $rowId = (int)$matched['id'];
            $groups[$rowId][] = $mjrFile;
        }

        $processed = 0;
        $failed = 0;
        $pendingMatch = count($unmatched);

        // Deliberately NOT marked processed — Janus writes .mjr files
        // incrementally as a call happens, not only once it ends, so a file
        // can look "new" and get picked up before CallRecordingListener has
        // flipped the row from 'recording' to 'pending' on call end. That's
        // early timing, not a real failure; leaving these unmarked lets the
        // next cron run (once the call has actually ended) pick them up.
        foreach ($unmatched as $mjrFile) {
            $output->writeln('No matching call row yet for ' . basename($mjrFile) . ' — will retry next run');
        }

        foreach ($groups as $rowId => $files) {
            $fileList = implode(', ', array_map('basename', $files));
            $output->writeln("Processing call row {$rowId} (" . count($files) . ' participant track(s)): ' . $fileList);

            $result = self::RESULT_FAILED;
            try {
                $result = $this->processCallGroup($rowId, $files, $output);
                if ($result === self::RESULT_SUCCESS) {
                    $processed++;
                } else {
                    $failed++;
                }
            } catch (\Throwable $e) {
                $output->writeln("<error>Error processing call row {$rowId}: {$e->getMessage()}</error>");
                $this->logger->error("Boudica: call group processing error for row {$rowId}: " . $e->getMessage());
                $failed++;
            }

            // Every file in this group was matched to a real call row —
            // we're past the NOT_YET_MATCHED case entirely by this point.
            // A failure here is a genuine extraction/mixing/transcription
            // problem, not a timing issue, so there's no reason to leave
            // any of these files for retry.
            foreach ($files as $mjrFile) {
                $monitor->markProcessed($mjrFile);
            }
        }

        $output->writeln("Completed: $processed call(s) processed, $failed failed, $pendingMatch file(s) waiting for call to end");
        return Command::SUCCESS;
    }

    /**
     * Process every participant's recording for a single call as one unit:
     * extract each track individually, mix them into one combined audio
     * file, transcribe the mix once, run it through an LLM cleanup/summary
     * pass, and store/email the result against the one call row all these
     * files belong to.
     *
     * REVERTED from a per-track-transcribe-then-merge approach back to
     * mixing (see MjrAudioExtractor::mixAudioFiles(), which was left in
     * place unused for exactly this reason). The per-track version
     * transcribed each participant's audio SEPARATELY before merging —
     * which meant a participant who was mostly listening rather than
     * talking got their own genuinely near-silent solo track fed to
     * Whisper in isolation, which is exactly the scenario that triggers
     * hallucination (confirmed directly: a real 2-person call produced a
     * good transcript for whoever did the talking, and fabricated content
     * for the other person's near-silent solo track). Mixing avoids this
     * by construction — Whisper always has SOME real audio content across
     * the whole call duration, even during a stretch where one specific
     * participant is quiet, because the other person's audio is still
     * present in the combined signal. The trade-off is losing precise
     * per-speaker attribution — the LLM cleanup/summary pass is now asked
     * to work that out from context rather than relying on structural
     * speaker labels we no longer have.
     *
     * A single participant's track failing to extract doesn't sink the
     * whole call — whichever tracks DID extract successfully still get
     * mixed and transcribed, rather than discarding everyone's audio over
     * one bad file.
     */
    private function processCallGroup(int $rowId, array $mjrFiles, OutputInterface $output): string {
        $extractor = new MjrAudioExtractor($this->logger, $this->config);
        $wavFiles = [];
        $extractionErrors = [];

        foreach ($mjrFiles as $mjrFile) {
            try {
                $wavFiles[] = $extractor->extractAudio($mjrFile);
            } catch (\Throwable $e) {
                $extractionErrors[] = basename($mjrFile) . ': ' . $e->getMessage();
                $this->logger->warning('Boudica: failed to extract one participant track (continuing with others): ' . $e->getMessage());
            }
        }

        if (empty($wavFiles)) {
            $this->logger->error("Boudica: all participant tracks failed to extract for call row {$rowId}: " . implode(' | ', $extractionErrors));
            $output->writeln("<error>All tracks failed to extract for call row {$rowId}</error>");
            return self::RESULT_FAILED;
        }

        if (!empty($extractionErrors)) {
            $output->writeln('<info>Note: ' . count($extractionErrors) . ' track(s) failed to extract and were excluded from the mix</info>');
        }

        $mixedFile = null;
        try {
            $mixedFile = $extractor->mixAudioFiles($wavFiles);

            if (!$this->transcriptionService->isServiceAvailable()) {
                $output->writeln('<error>Transcription service unavailable</error>');
                return self::RESULT_FAILED;
            }

            $rawTranscript = $this->transcriptionService->transcribeFile($mixedFile);

            if (!$rawTranscript) {
                $this->logger->error("Boudica: transcribeFile() returned empty for call row {$rowId} — no exception thrown, but no transcript produced either");
                $output->writeln('<error>Transcription failed (empty result)</error>');
                return self::RESULT_FAILED;
            }

            $cleaned = null;
            try {
                $cleaned = $this->cleanupService->cleanupTranscript($rawTranscript, $rowId);
            } catch (\Throwable $e) {
                // cleanupTranscript() is designed to fail soft and return
                // null rather than throw — this catch is a second safety
                // net in case of something genuinely unexpected, so a
                // cleanup problem can never sink an otherwise-successful
                // transcription.
                $this->logger->warning('Boudica: transcript cleanup threw unexpectedly, falling back to raw: ' . $e->getMessage());
            }

            $finalTranscript = $cleaned ?? $rawTranscript;
            if ($cleaned === null) {
                $output->writeln('<info>Note: LLM cleanup/summary unavailable or failed — using raw transcript instead</info>');
            }

            $this->finalizeTranscript($rowId, $finalTranscript, $rawTranscript, $mjrFiles);
            $this->sendTranscriptEmail($rowId, $finalTranscript);

            $output->writeln(
                '<info>✓ Successfully transcribed (' . count($wavFiles) . ' track(s) mixed)'
                . ($cleaned !== null ? ', summarized,' : '')
                . ' and emailed</info>'
            );
            return self::RESULT_SUCCESS;

        } finally {
            // Clean up every intermediate file regardless of outcome. When
            // there was only one track, mixAudioFiles() returns that same
            // WAV path unchanged rather than a separate mixed file — the
            // $wav !== $mixedFile check avoids double-deleting it here.
            foreach ($wavFiles as $wav) {
                if ($wav !== $mixedFile && file_exists($wav)) {
                    @unlink($wav);
                }
            }
            if ($mixedFile !== null && file_exists($mixedFile)) {
                @unlink($mixedFile);
            }
        }
    }

    /**
     * Janus's recording filenames embed a microsecond-precision Unix
     * timestamp, e.g.:
     *   videoroom-7853371127187963-user-1-1786098997896990-audio-0.mjr
     *                                     ^^^^^^^^^^^^^^^^ microseconds since epoch
     * Returns the timestamp in whole seconds, or null if the filename
     * doesn't match the expected pattern — in which case the file can never
     * be matched to a call row and is treated the same as any other
     * unmatched file (see execute()).
     */
    private function extractTimestampFromFilename(string $basename): ?int {
        $micros = $this->extractMicrosecondTimestamp($basename);
        return $micros === null ? null : (int) ($micros / 1_000_000);
    }

    /**
     * Same embedded timestamp as extractTimestampFromFilename(), but at
     * full microsecond precision rather than truncated to whole seconds —
     * extractTimestampFromFilename() delegates to this and divides down,
     * since whole-second precision is sufficient for DB row matching.
     */
    private function extractMicrosecondTimestamp(string $basename): ?int {
        if (preg_match('/-(\d{15,17})-(?:audio|video|data)-\d+\.mjr$/', $basename, $m)) {
            return (int) $m[1];
        }
        return null;
    }

    /**
     * Finds the call_transcripts row that CallRecordingListener created when
     * the real call started, by matching the recording file's embedded
     * timestamp against call_started_at within a generous window. Returns
     * null if nothing matches — e.g. the listener failed for this call, or
     * (more commonly) the call simply hasn't ended yet, since Janus writes
     * files incrementally throughout the call rather than only at the end.
     * Callers treat a null match as "not yet ready," retried on the next run.
     */
    private function matchTranscriptRow(?int $fileTimestamp): ?array {
        if ($fileTimestamp === null) {
            return null;
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('id', 'token', 'call_id', 'user_id', 'call_started_at')
           ->from('boudicaai_call_transcripts')
           ->where($qb->expr()->eq('transcription_status', $qb->createNamedParameter('pending')))
           ->andWhere($qb->expr()->gte('call_started_at', $qb->createNamedParameter($fileTimestamp - self::MATCH_WINDOW_BEFORE, \PDO::PARAM_INT)))
           ->andWhere($qb->expr()->lte('call_started_at', $qb->createNamedParameter($fileTimestamp + self::MATCH_WINDOW_AFTER, \PDO::PARAM_INT)))
           ->orderBy('call_started_at', 'DESC')
           ->setMaxResults(1);

        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();

        return $row ?: null;
    }

    /**
     * Stores both the raw merged transcript and (if cleanup succeeded) the
     * cleaned version against the call row, and records every participant
     * file that contributed. Only ever called with a rowId already
     * confirmed by the grouping step in execute() — no re-matching or "no
     * match found" case here.
     *
     * transcript_raw always holds the speaker-labeled merge of everyone's
     * segments, regardless of whether the LLM cleanup pass succeeded —
     * nothing is lost even if TranscriptCleanupService's API assumptions
     * turn out wrong and cleanup never actually works.
     *
     * file_name/file_path store every contributing file, comma-separated —
     * fine for the typical 2-5 participant call; a call with a very large
     * number of participants could theoretically approach the varchar(512)
     * limit on file_path, worth revisiting if that ever becomes real.
     */
    private function finalizeTranscript(int $rowId, string $transcript, string $rawTranscript, array $mjrFiles): void {
        $fileNames = implode(', ', array_map('basename', $mjrFiles));
        $filePaths = implode(', ', $mjrFiles);

        $update = $this->db->getQueryBuilder();
        $update->update('boudicaai_call_transcripts')
               ->set('transcript_text', $update->createNamedParameter($transcript))
               ->set('transcript_raw', $update->createNamedParameter($rawTranscript))
               ->set('file_path', $update->createNamedParameter($filePaths))
               ->set('file_name', $update->createNamedParameter($fileNames))
               ->set('transcription_status', $update->createNamedParameter('completed'))
               ->set('transcript_fetched_at', $update->createNamedParameter(time(), \PDO::PARAM_INT))
               ->where($update->expr()->eq('id', $update->createNamedParameter($rowId, \PDO::PARAM_INT)));
        $update->executeStatement();

        $this->logger->info("Boudica: call row {$rowId} transcribed and merged from " . count($mjrFiles) . " participant track(s)");
    }

    /**
     * Emails the transcript to the call's participants, reusing
     * CallParticipantService (populated by CallRecordingListener/
     * TalkBotInvokeListener elsewhere) rather than re-deriving participants
     * from the room here.
     */
    private function sendTranscriptEmail(int $transcriptId, string $transcript): void {
        try {
            $qb = $this->db->getQueryBuilder();
            $qb->select('token', 'call_started_at')
               ->from('boudicaai_call_transcripts')
               ->where($qb->expr()->eq('id', $qb->createNamedParameter($transcriptId, \PDO::PARAM_INT)));
            $result = $qb->executeQuery();
            $row = $result->fetch();
            $result->closeCursor();

            if (!$row) {
                $this->logger->warning("Boudica: call row {$transcriptId} vanished before emailing");
                return;
            }

            $recipients = $this->participantService->getParticipantEmails($transcriptId);
            if (empty($recipients)) {
                $this->logger->info("Boudica: no email recipients found for call row {$transcriptId}");
                return;
            }

            $sent = $this->emailService->sendTranscriptEmail(
                $recipients,
                $transcript,
                $row['token'] ?? 'Call Recording',
                (int)($row['call_started_at'] ?? time())
            );

            if ($sent) {
                $this->participantService->markEmailSent($transcriptId, $recipients);
                $this->logger->info("Boudica: sent transcript email for call row {$transcriptId} to " . count($recipients) . ' recipients');
            }
        } catch (\Throwable $e) {
            $this->logger->error('Boudica: failed to send transcript email: ' . $e->getMessage());
        }
    }
}