<?php
 
namespace OCA\BoudicaAi\Service;
 
class JanusRecordingMonitor {
    private $logger;
    private $recordingsPath;
 
    // Moved off /tmp: that directory is NOT part of the Nextcloud container's
    // persisted volume, so it's wiped on every container restart/recreate.
    // We hit exactly this class of bug earlier today with a different file
    // (Application.php silently reverting after a container recreate) — if
    // this stayed on /tmp, every past recording would look "new" again after
    // a restart and get re-transcribed and re-emailed to everyone. This path
    // is under Nextcloud's own data directory, which lives on the persisted
    // volume.
    private $processedFile = '/var/www/html/data/boudicaai/janus_processed_recordings.txt';
 
    public function __construct($logger, string $recordingsPath = '/mnt/janus-recordings') {
        $this->logger = $logger;
        $this->recordingsPath = $recordingsPath;
 
        $dir = dirname($this->processedFile);
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
    }
 
    /**
     * Find new .mjr files that haven't been processed
     */
    public function getNewRecordings() {
        if (!is_dir($this->recordingsPath)) {
            $this->logger->warning("Recordings path not found: {$this->recordingsPath}");
            return [];
        }
 
        $processed = $this->getProcessedFiles();
        $newRecordings = [];
 
        $files = glob($this->recordingsPath . '/*.mjr');
        if (!$files) {
            return [];
        }
 
        foreach ($files as $file) {
            $basename = basename($file);
            if (!isset($processed[$basename])) {
                $newRecordings[] = $file;
                $this->logger->info("Found new recording: $basename");
            }
        }
 
        return $newRecordings;
    }
 
    /**
     * Mark recording as processed
     */
    public function markProcessed($filePath) {
        $basename = basename($filePath);
        $processed = $this->getProcessedFiles();
        $processed[$basename] = time();
        file_put_contents($this->processedFile, json_encode($processed));
    }
 
    /**
     * Load list of previously processed files
     */
    private function getProcessedFiles() {
        if (!file_exists($this->processedFile)) {
            return [];
        }
        $data = json_decode(file_get_contents($this->processedFile), true);
        return $data ?: [];
    }
 
    /**
     * Extract a room/stream identifier from a Janus .mjr filename.
     *
     * Actual format produced by the patched signaling server (janus.go
     * createPublisherRoom, "record"/"rec_dir" enabled today) is:
     *   videoroom-<janusRoomId>-user-<userId>-<microTimestamp>-<type>-<idx>.mjr
     * e.g. videoroom-7853371127187963-user-1-1786098997896990-video-1.mjr
     *
     * The previous regex (`rec-(.+?)-\d+\.mjr$`) assumed a completely
     * different naming scheme that doesn't match any real file this
     * deployment produces, so it always returned null. This extracts the
     * Janus room ID instead — not a Nextcloud Talk token (JanusTranscription
     * Command correlates to that separately, via the embedded timestamp),
     * just a stable label for the audit-fallback path when no matching
     * call_transcripts row is found.
     */
    public static function extractRoomName($filename) {
        if (preg_match('/^videoroom-(\d+)-/', $filename, $m)) {
            return $m[1];
        }
        return null;
    }
}