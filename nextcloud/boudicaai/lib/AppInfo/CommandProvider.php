<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\AppInfo;

use OCA\BoudicaAi\Command\TranscribeCallsCommand;
use OCA\BoudicaAi\Command\JanusTranscriptionCommand;
use Symfony\Component\Console\Command\Command;

class CommandProvider {
    private $container;

    public function __construct($container) {
        $this->container = $container;
    }

    public function getCommands(): array {
        return [
            new TranscribeCallsCommand(
                $this->container->get('OCP\IDBConnection'),
                $this->container->get('OCA\BoudicaAi\Service\TranscriptionService'),
                $this->container->get('OCA\BoudicaAi\Service\CallParticipantService'),
                $this->container->get('OCA\BoudicaAi\Service\TranscriptEmailService'),
                $this->container->get('OCP\Log\ILogFactory')->get('boudicaai')
            ),
            new JanusTranscriptionCommand(
                $this->container->get('OCP\IConfig'),
                $this->container->get('OCP\IDBConnection'),
                $this->container->get('OCP\Log\ILogFactory')->get('boudicaai')
            ),
        ];
    }
}
