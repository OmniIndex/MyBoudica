<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\BackgroundJob;

use OCA\BoudicaAi\Command\JanusTranscriptionCommand;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

/**
 * Automatic trigger for JanusTranscriptionCommand (occ boudicaai:janus-transcribe).
 *
 * That command's own scan/mix/transcribe/summarize/email logic was fully built
 * and correct, but nothing ever called it except a human running the occ
 * command by hand - CallRecordingListener marks a call 'pending' on
 * CallEndedEvent, but without this job nothing ever picks that up again.
 * Confirmed live 2026-09-05: info.xml's <background-jobs> only registered
 * DigestPollJob (an unrelated feature - the Talk message digest, not call
 * transcription), and nextcloud-cron's own loop just runs cron.php, which
 * only drives whatever's actually registered there. Reuses the command
 * in-process via Command::run() rather than duplicating its logic (or
 * shelling out to occ) - same DI-constructed instance either way, so
 * whatever fixes land in that command apply here automatically too.
 *
 * Interval matches DigestPollJob's own reasoning: 5 minutes is the
 * practical floor set by nextcloud-cron's own 300s loop regardless of what
 * setInterval() says here.
 */
class JanusTranscribeJob extends TimedJob {

    public function __construct(
        ITimeFactory $time,
        private JanusTranscriptionCommand $command,
        private LoggerInterface $logger,
    ) {
        parent::__construct($time);
        $this->setInterval(5 * 60);
    }

    protected function run($argument): void {
        $output = new BufferedOutput();
        try {
            $this->command->run(new ArrayInput([]), $output);
        } catch (\Throwable $e) {
            $this->logger->error('Boudica janus-transcribe background run failed: ' . $e->getMessage());
        } finally {
            $text = trim($output->fetch());
            if ($text !== '') {
                $this->logger->info("Boudica janus-transcribe background run:\n" . $text);
            }
        }
    }
}
