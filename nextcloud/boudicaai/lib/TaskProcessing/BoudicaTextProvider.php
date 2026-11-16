<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\TaskProcessing;

use GuzzleHttp\Client;
use OCP\IAppConfig;
use OCP\IL10N;
use OCP\IUserManager;
use OCP\TaskProcessing\Exception\ProcessingException;
use OCP\TaskProcessing\ISynchronousProvider;
use Psr\Log\LoggerInterface;

/**
 * Nextcloud's AI tasks on Boudica (2026-11-16, Boudica Mail phase 3c,
 * boudica_slm product_templates/mail/PLAN.md "Phase 3c design").
 *
 * Nextcloud Mail asks TaskProcessing for core:text2text (smart replies,
 * "needs follow-up", event details) and core:text2text:summary (thread
 * summary). These providers send each task to Boudica's /api/boudica/nc/task
 * as the person who created it (their email), with this server's token
 * (app config nc_task_token = Boudica's BOUDICA_NC_TASK_TOKEN). Boudica
 * accepts it only from Nextcloud's private address and only for an active
 * Boudica user. Nothing goes to an outside AI service.
 *
 * Registered only while nc_task_token is set (Application::register), so
 * installing or upgrading the app never switches AI on by itself; an admin
 * then picks Boudica in Administration settings > Artificial intelligence.
 */
abstract class BoudicaTextProvider implements ISynchronousProvider {
    private Client $http;

    public function __construct(
        private IAppConfig $appConfig,
        private IUserManager $userManager,
        private IL10N $l,
        private LoggerInterface $logger,
    ) {
        // Raw Guzzle, as in BoudicaService: IClientService's SSRF guard refuses
        // Boudica's address on the private Docker network.
        $this->http = new Client();
    }

    abstract public function getTaskTypeId(): string;

    public function getId(): string {
        return 'boudicaai-' . str_replace(':', '-', $this->getTaskTypeId());
    }

    public function getName(): string {
        return 'Boudica';
    }

    public function getExpectedRuntime(): int {
        return 30;
    }

    public function getOptionalInputShape(): array { return []; }
    public function getOptionalOutputShape(): array { return []; }
    public function getInputShapeEnumValues(): array { return []; }
    public function getInputShapeDefaults(): array { return []; }
    public function getOptionalInputShapeEnumValues(): array { return []; }
    public function getOptionalInputShapeDefaults(): array { return []; }
    public function getOutputShapeEnumValues(): array { return []; }
    public function getOptionalOutputShapeEnumValues(): array { return []; }

    /** Where tasks go: app config nc_task_endpoint, else the Talk flow / API endpoint with /chat replaced. */
    private function endpoint(): string {
        $direct = $this->appConfig->getValueString('boudicaai', 'nc_task_endpoint', '');
        if ($direct !== '') {
            return $direct;
        }
        $base = $this->appConfig->getValueString('boudicaai', 'talk_flow_endpoint', '');
        if ($base === '') {
            $base = $this->appConfig->getValueString('boudicaai', 'api_endpoint', '');
        }
        return preg_replace('#/chat/?$#', '', $base) . '/nc/task';
    }

    public function process(?string $userId, array $input, callable $reportProgress): array {
        $token = $this->appConfig->getValueString('boudicaai', 'nc_task_token', '');
        if (strlen($token) < 32) {
            throw new ProcessingException('Boudica is not set up for Nextcloud tasks (nc_task_token)');
        }
        $text = $input['input'] ?? '';
        if (!is_string($text) || trim($text) === '') {
            throw new ProcessingException('Empty input');
        }
        $email = '';
        if ($userId !== null) {
            $user = $this->userManager->get($userId);
            $email = $user?->getEMailAddress() ?? '';
            if ($email === '' && str_contains($userId, '@')) {
                $email = $userId;
            }
        }
        if ($email === '') {
            // Boudica runs every task as a person; a task with no person is refused.
            throw new ProcessingException('Boudica runs tasks only for a user with an email address');
        }
        try {
            $response = $this->http->post($this->endpoint(), [
                'headers' => ['X-Boudica-NC-Token' => $token],
                'json' => ['nc_user' => $email, 'task_type' => $this->getTaskTypeId(), 'input' => mb_substr($text, 0, 24000)],
                'timeout' => 90,
                'verify' => false,
                'http_errors' => false,
            ]);
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica task failed: ' . $e->getMessage(), ['app' => 'boudicaai']);
            throw new ProcessingException('Boudica is not reachable');
        }
        $data = json_decode((string)$response->getBody(), true);
        if (!is_array($data) || empty($data['success']) || !isset($data['output']) || !is_string($data['output'])) {
            $why = is_array($data) && isset($data['error']) && is_string($data['error']) ? $data['error'] : ('HTTP ' . $response->getStatusCode());
            $this->logger->info('Boudica task not done: ' . $why, ['app' => 'boudicaai']);
            throw new ProcessingException('Boudica could not do this task: ' . $why);
        }
        return ['output' => $data['output']];
    }
}
