<?php

namespace OCA\BoudicaAi\Service;

/**
 * Thrown when extractAudio() is asked to process a .mjr file that isn't an
 * audio recording (e.g. Janus's video or data-channel recordings). Distinct
 * from a real extraction failure so callers can skip these silently instead
 * of logging them as errors.
 */
class NotAnAudioRecordingException extends \Exception {
}

class MjrAudioExtractor {
    private $logger;
    private $config;

    public function __construct($logger, $config) {
        $this->logger = $logger;
        $this->config = $config;
    }

    /**
     * Extract audio from a Janus .mjr recording file.
     * Returns path to the extracted WAV file.
     *
     * IMPORTANT: raw .mjr files are NOT a standard media container — Janus's
     * own recorder just dumps RTP packets to disk in a proprietary framing,
     * with no processing at all (see Janus's own docs: "no processing at all
     * is done in the recording step"). ffmpeg cannot open them directly; it
     * fails with "Invalid data found when processing input" every time,
     * regardless of whether the underlying content is real audio or not —
     * confirmed against a genuine, successfully-recorded call today, not
     * just the empty/failed ones.
     *
     * The correct pipeline (previously entirely missing here) is:
     *   1. janus-pp-rec converts the raw .mjr into a real container Janus
     *      itself understands the codec for (.opus for Opus audio, the
     *      codec actually in use here per the signaling server's [turn]/
     *      [mcu] setup).
     *   2. ffmpeg then converts that into the .wav this class has always
     *      returned, keeping the contract with TranscriptionService (which
     *      expects to file_get_contents() a WAV) unchanged.
     */
    public function extractAudio($mjrFilePath) {
        if (!file_exists($mjrFilePath)) {
            throw new \Exception("MJR file not found: $mjrFilePath");
        }

        if (!self::isAudioRecording($mjrFilePath)) {
            throw new NotAnAudioRecordingException(
                "Not an audio recording, skipping: " . basename($mjrFilePath)
            );
        }

        $opusFile = $this->getTempPath($mjrFilePath, 'opus');
        $wavFile = $this->getTempPath($mjrFilePath, 'wav');

        try {
            $this->runJanusPostProcessor($mjrFilePath, $opusFile);
            $this->runFfmpegConvert($opusFile, $wavFile);
        } finally {
            // Clean up the intermediate .opus regardless of success/failure —
            // only the final .wav (or nothing, on failure) should remain.
            if (file_exists($opusFile)) {
                @unlink($opusFile);
            }
        }

        if (!file_exists($wavFile)) {
            throw new \Exception("Audio extraction produced no output file");
        }

        $this->logger->info("Audio extracted to: $wavFile");
        return $wavFile;
    }

    /**
     * Step 1: janus-pp-rec reorders and extracts the raw RTP frames into a
     * real, playable .opus file. No transcoding happens here — it's just
     * turning Janus's raw dump into a container ffmpeg can actually read.
     */
    private function runJanusPostProcessor(string $mjrFilePath, string $opusFile): void {
        $cmd = sprintf(
            'janus-pp-rec %s %s 2>&1',
            escapeshellarg($mjrFilePath),
            escapeshellarg($opusFile)
        );

        $this->logger->info("Post-processing MJR: $cmd");
        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            $this->logger->error("janus-pp-rec failed: " . implode("\n", $output));
            throw new \Exception("Failed to post-process MJR file with janus-pp-rec");
        }

        if (!file_exists($opusFile)) {
            // ASSUMPTION TO VERIFY: this assumes the recording's audio codec
            // is Opus, matching what browsers negotiate by default for
            // WebRTC audio. If your setup ever forces G.711 instead,
            // janus-pp-rec would produce a .wav directly rather than .opus —
            // check the real output extension here if this throws.
            $this->logger->error("janus-pp-rec did not produce expected .opus output: " . implode("\n", $output));
            throw new \Exception("janus-pp-rec produced no output file — check codec assumption (expected Opus)");
        }
    }

    /**
     * Step 2: convert the now-valid .opus container into .wav, preserving
     * this class's existing output contract with TranscriptionService.
     *
     * Explicitly resampled to 16kHz mono. Without this, ffmpeg's default
     * output here is 48kHz stereo (whatever the source Opus stream carries),
     * which caused real, reproducible failures against the Whisper service —
     * internal PyTorch tensor-shape mismatches deep in the model (e.g.
     * "Expected size for first two dimensions of batch2 tensor to be: [8, 5]
     * but got: [8, 9]"). Whisper models are trained on 16kHz mono audio, and
     * this particular service wrapper apparently doesn't resample/downmix
     * for you the way the reference `whisper` CLI does internally.
     */
    private function runFfmpegConvert(string $opusFile, string $wavFile): void {
        $cmd = sprintf(
            'ffmpeg -y -i %s -ar 16000 -ac 1 -q:a 0 -map a %s 2>&1',
            escapeshellarg($opusFile),
            escapeshellarg($wavFile)
        );

        $this->logger->info("Converting to WAV: $cmd");
        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            $this->logger->error("FFmpeg conversion failed: " . implode("\n", $output));
            throw new \Exception("Failed to convert extracted audio to WAV");
        }
    }

    /**
     * Mix multiple individual WAV files (one per call participant) into a
     * single combined track for transcription.
     *
     * BACKGROUND: Janus records each participant's publisher stream as a
     * SEPARATE .mjr file — there is no single "mixed room" recording. A
     * 3-person call produces 3 independent solo audio tracks, one per
     * participant's own microphone. Transcribing just one of these (the
     * previous behavior) means transcribing whichever single person's track
     * happened to match — usually mostly silence for however long they
     * weren't the one talking, which Whisper then fills with hallucinated
     * repetition ("Okay. Okay. Okay...") rather than correctly recognizing
     * as silence. This showed up in a real 30-minute 3-person call: only the
     * first speaker's brief opening line transcribed correctly, followed by
     * ~28 minutes of repeated "Okay." during the long stretch where that
     * specific person was listening rather than talking.
     *
     * If only one file is given (e.g. someone joined alone, briefly, or as
     * a fallback if mixing genuinely can't proceed), it's returned as-is —
     * no need to invoke ffmpeg's mixer for a single input.
     *
     * @param string[] $wavFiles Paths to individual per-participant WAV files
     * @return string Path to the mixed WAV file
     */
    public function mixAudioFiles(array $wavFiles): string {
        if (empty($wavFiles)) {
            throw new \Exception('mixAudioFiles() called with no input files');
        }

        if (count($wavFiles) === 1) {
            return $wavFiles[0];
        }

        $outputFile = sys_get_temp_dir() . '/mixed-' . uniqid('', true) . '.wav';

        $inputArgs = '';
        foreach ($wavFiles as $wav) {
            $inputArgs .= '-i ' . escapeshellarg($wav) . ' ';
        }

        $n = count($wavFiles);
        // duration=longest: keeps the full call length even if one
        // participant left early and their track is shorter than the rest —
        // otherwise amix defaults to the SHORTEST input, silently truncating
        // the mix (and the transcript) the moment the first person leaves.
        // normalize=1 (the default) divides the mixed signal to avoid
        // clipping when multiple people talk over each other, at the cost
        // of making a single active speaker sound quieter than their
        // original solo track — an acceptable trade-off for transcription
        // accuracy over listening quality.
        $filterComplex = "amix=inputs={$n}:duration=longest:dropout_transition=0";

        $cmd = sprintf(
            'ffmpeg -y %s -filter_complex %s -ar 16000 -ac 1 %s 2>&1',
            $inputArgs,
            escapeshellarg($filterComplex),
            escapeshellarg($outputFile)
        );

        $this->logger->info("Mixing {$n} audio tracks: $cmd");
        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            $this->logger->error('Audio mixing failed: ' . implode("\n", $output));
            throw new \Exception('Failed to mix audio tracks');
        }

        if (!file_exists($outputFile)) {
            throw new \Exception('Audio mixing produced no output file');
        }

        $this->logger->info("Mixed audio written to: $outputFile");
        return $outputFile;
    }

    /**
     * Only "-audio-N.mjr" files are real audio recordings. Janus also
     * produces "-video-N.mjr" and "-data-N.mjr" files for the same stream
     * (video frames and SCTP data-channel messages respectively) — neither
     * is audio, and janus-pp-rec would produce .webm/.srt for those, not
     * something meaningful to transcribe.
     */
    public static function isAudioRecording(string $mjrFilePath): bool {
        return (bool) preg_match('/-audio-\d+\.mjr$/', basename($mjrFilePath));
    }

    /**
     * Get a temporary file path for a given extension, namespaced to this
     * specific .mjr file so concurrent runs don't collide.
     */
    private function getTempPath(string $mjrFile, string $extension): string {
        $basename = pathinfo($mjrFile, PATHINFO_FILENAME);
        $tempDir = sys_get_temp_dir();
        return $tempDir . '/' . $basename . '-extracted-' . time() . '.' . $extension;
    }

    /**
     * Check if both required tools are available: ffmpeg (final WAV
     * conversion) and janus-pp-rec (the actually-missing step — without it,
     * every extraction fails identically regardless of file content).
     */
    public static function isAvailable() {
        exec('which ffmpeg', $ffmpegOutput, $ffmpegReturn);
        exec('which janus-pp-rec', $ppRecOutput, $ppRecReturn);
        return $ffmpegReturn === 0 && $ppRecReturn === 0;
    }
}