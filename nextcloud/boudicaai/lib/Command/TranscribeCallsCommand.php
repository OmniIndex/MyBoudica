<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Command;

use OCA\BoudicaAi\Service\TranscriptionService;
use OCA\BoudicaAi\Service\CallParticipantService;
use OCA\BoudicaAi\Service\TranscriptEmailService;
use OCP\IDBConnection;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

class TranscribeCallsCommand extends Command {
    protected static $defaultName = 'boudicaai:transcribe-calls';

    private IDBConnection $db;
    private TranscriptionService $transcriptionService;
    private CallParticipantService $participantService;
    private TranscriptEmailService $emailService;
    private LoggerInterface $logger;

    public function __construct(
        IDBConnection $db,
        TranscriptionService $transcriptionService,
        CallParticipantService $participantService,
        TranscriptEmailService $emailService,
        LoggerInterface $logger
    ) {
        parent::__construct();
        $this->db = $db;
        $this->transcriptionService = $transcriptionService;
        $this->participantService = $participantService;
        $this->emailService = $emailService;
        $this->logger = $logger;
    }

    protected function configure(): void {
        $this->setDescription('Automatically transcribe pending call recordings and email participants');
        $this->setHelp('Finds all pending call recordings without transcripts and processes them through Whisper service');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int {
        $output->writeln('Starting automatic call transcription process...');

        try {
            // Find all pending calls (transcription_status = 'pending' and transcript_text IS NULL)
            $qb = $this->db->getQueryBuilder();
            $qb->select('id', 'file_name', 'file_path', 'call_started_at', 'token')
               ->from('boudicaai_call_transcripts')
               ->where($qb->expr()->eq('transcription_status', $qb->createNamedParameter('pending')))
               ->andWhere($qb->expr()->isNull('transcript_text'))
               ->orderBy('call_started_at', 'ASC')
               ->setMaxResults(10); // Process max 10 at a time

            $result = $qb->executeQuery();
            $pendingCalls = $result->fetchAll();
            $result->closeCursor();

            $output->writeln('Found ' . count($pendingCalls) . ' pending calls to transcribe');

            if (empty($pendingCalls)) {
                $output->writeln('No pending calls to process');
                return Command::SUCCESS;
            }

            // Check if service is available
            if (!$this->transcriptionService->isServiceAvailable()) {
                $output->writeln('<error>Whisper transcription service is not available</error>');
                $this->logger->error('Transcribe calls command: Whisper service unavailable');
                return Command::FAILURE;
            }

            $transcribedCount = 0;
            $failedCount = 0;

            foreach ($pendingCalls as $call) {
                $callId = (int)$call['id'];
                $fileName = $call['file_name'];
                $filePath = $call['file_path'];

                $output->writeln("Processing: <info>$fileName</info>");

                try {
                    // Update status to transcribing
                    $update = $this->db->getQueryBuilder();
                    $update->update('boudicaai_call_transcripts')
                           ->set('transcription_status', $update->createNamedParameter('transcribing'))
                           ->where($update->expr()->eq('id', $update->createNamedParameter($callId, \PDO::PARAM_INT)));
                    $update->executeStatement();

                    // Transcribe the file
                    $transcript = $this->transcriptionService->transcribeFile($filePath);

                    if (!$transcript || trim($transcript) === '') {
                        throw new \Exception('Empty transcript returned from Whisper service');
                    }

                    // Update with completed status and transcript
                    $update = $this->db->getQueryBuilder();
                    $update->update('boudicaai_call_transcripts')
                           ->set('transcription_status', $update->createNamedParameter('completed'))
                           ->set('transcript_text', $update->createNamedParameter($transcript))
                           ->set('transcript_fetched_at', $update->createNamedParameter(time(), \PDO::PARAM_INT))
                           ->where($update->expr()->eq('id', $update->createNamedParameter($callId, \PDO::PARAM_INT)));
                    $update->executeStatement();

                    // Send email to participants
                    $this->sendTranscriptEmailToParticipants($callId, $fileName, $transcript, $call['call_started_at']);

                    $output->writeln("<comment>✓ Transcribed successfully</comment>");
                    $transcribedCount++;

                } catch (\Throwable $e) {
                    $errorMsg = $e->getMessage();
                    $output->writeln("<error>✗ Failed: $errorMsg</error>");

                    // Update with failed status
                    $update = $this->db->getQueryBuilder();
                    $update->update('boudicaai_call_transcripts')
                           ->set('transcription_status', $update->createNamedParameter('failed'))
                           ->set('transcription_error', $update->createNamedParameter($errorMsg))
                           ->where($update->expr()->eq('id', $update->createNamedParameter($callId, \PDO::PARAM_INT)));
                    $update->executeStatement();

                    $this->logger->error("Transcription failed for call $callId: $errorMsg");
                    $failedCount++;
                }
            }

            $output->writeln('');
            $output->writeln("<info>Completed: $transcribedCount transcribed, $failedCount failed</info>");

            return Command::SUCCESS;

        } catch (\Throwable $e) {
            $output->writeln('<error>Command failed: ' . $e->getMessage() . '</error>');
            $this->logger->error('Transcribe calls command failed: ' . $e->getMessage());
            return Command::FAILURE;
        }
    }

    /**
     * Sends transcript email to all participants
     */
    private function sendTranscriptEmailToParticipants(
        int $callId,
        string $fileName,
        string $transcript,
        int $callStartedAt
    ): void {
        try {
            // Get participant email addresses
            $recipients = $this->participantService->getParticipantEmails($callId);

            if (empty($recipients)) {
                $this->logger->info("No email recipients found for call $callId");
                return;
            }

            // Send email
            $emailSent = $this->emailService->sendTranscriptEmail(
                $recipients,
                $transcript,
                $fileName,
                $callStartedAt
            );

            if ($emailSent) {
                // Mark email as sent
                $this->participantService->markEmailSent($callId, $recipients);
                $this->logger->info("Sent transcript email for call $callId to " . count($recipients) . " recipients");
            }

        } catch (\Throwable $e) {
            $this->logger->error('Failed to send transcript email for call ' . $callId . ': ' . $e->getMessage());
        }
    }
}
