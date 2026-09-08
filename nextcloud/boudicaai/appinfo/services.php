<?php

declare(strict_types=1);

namespace OCA\BoudicaAi;

use OCA\BoudicaAi\BackgroundJob\DigestPollJob;
use OCA\BoudicaAi\Command\TranscribeCallsCommand;
use OCA\BoudicaAi\Command\JanusTranscriptionCommand;
use OCA\BoudicaAi\Listener\TalkBotInvokeListener;
use OCA\BoudicaAi\Service\BoudicaService;
use OCA\BoudicaAi\Service\CalendarSuggestionService;
use OCA\BoudicaAi\Service\CallParticipantService;
use OCA\BoudicaAi\Service\DigestService;
use OCA\BoudicaAi\Service\TranscriptionService;
use OCA\BoudicaAi\Service\TranscriptEmailService;
use OCP\IContainer;

$container = \OC::$server;

// Register core services
$container->registerService(TranscriptionService::class, function (IContainer $c) {
    return new TranscriptionService(
        $c->get('OCP\IConfig'),
        $c->get('OCP\Log\ILogFactory')->get('boudicaai')
    );
});

$container->registerService(TranscriptEmailService::class, function (IContainer $c) {
    return new TranscriptEmailService(
        $c->get('OCP\Mail\IMailer'),
        $c->get('OCP\Log\ILogFactory')->get('boudicaai')
    );
});

$container->registerService(CallParticipantService::class, function (IContainer $c) {
    return new CallParticipantService(
        $c->get('OCP\IDBConnection'),
        $c->get('OCP\IUserManager'),
        $c->get('OCP\Log\ILogFactory')->get('boudicaai')
    );
});

$container->registerService(CalendarSuggestionService::class, function (IContainer $c) {
    return new CalendarSuggestionService(
        $c->get('OCP\Calendar\IManager'),
        $c->get('OCP\IDBConnection'),
        $c->get('OCP\IUserManager'),
        $c->get('OCP\Log\ILogFactory')->get('boudicaai')
    );
});

// Register event listener with dependencies
$container->registerService(TalkBotInvokeListener::class, function (IContainer $c) {
    return new TalkBotInvokeListener(
        $c->get(BoudicaService::class),
        $c->get(TranscriptionService::class),
        $c->get(CallParticipantService::class),
        $c->get(TranscriptEmailService::class),
        $c->get(CalendarSuggestionService::class),
        $c->get('OCP\Log\ILogFactory')->get('boudicaai'),
        $c->get('OCP\IDBConnection'),
        $c->get('OCP\IUserManager')
    );
});

// Register commands
$container->registerService(TranscribeCallsCommand::class, function (IContainer $c) {
    return new TranscribeCallsCommand(
        $c->get('OCP\IDBConnection'),
        $c->get(TranscriptionService::class),
        $c->get(CallParticipantService::class),
        $c->get(TranscriptEmailService::class),
        $c->get('OCP\Log\ILogFactory')->get('boudicaai')
    );
});

$container->registerService(JanusTranscriptionCommand::class, function (IContainer $c) {
    return new JanusTranscriptionCommand(
        $c->get('OCP\IConfig'),
        $c->get('OCP\IDBConnection'),
        $c->get('OCP\Log\ILogFactory')->get('boudicaai')
    );
});

// Talk digest (quiet/active room summarization)
$container->registerService(DigestService::class, function (IContainer $c) {
    return new DigestService(
        $c->get('OCP\IDBConnection'),
        $c->get(BoudicaService::class),
        $c->get(CalendarSuggestionService::class),
        $c->get(TranscriptEmailService::class),
        $c->get('OCP\IUserManager'),
        $c->get('OCP\Log\ILogFactory')->get('boudicaai')
    );
});

$container->registerService(DigestPollJob::class, function (IContainer $c) {
    return new DigestPollJob(
        $c->get('OCP\AppFramework\Utility\ITimeFactory'),
        $c->get(DigestService::class),
        $c->get('OCP\Log\ILogFactory')->get('boudicaai')
    );
});
