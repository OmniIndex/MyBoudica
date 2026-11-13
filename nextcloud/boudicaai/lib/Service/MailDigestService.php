<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Service;

use OCP\Http\Client\IClientService;
use OCP\IAppConfig;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\Security\ICrypto;
use Psr\Log\LoggerInterface;

/**
 * Boudica Mail part of the Boudica Mail Digest page (2026-11-13).
 *
 * For each Boudica Mail mailbox the user has, asks that mail server's
 * /api/digest (product_templates/mail/autoconfig/server.py) for Boudica's
 * one-line verdicts on the last day's mail. The mail server only answers
 * with the mailbox's own app password, so a digest is never shown to
 * someone who could not open the mailbox anyway.
 *
 * Where the mailboxes come from:
 *   1. accounts the user added in Nextcloud Mail (oc_mail_accounts) whose
 *      incoming server is a Boudica Mail server; their stored password is
 *      decrypted the way Nextcloud Mail stores it (ICrypto);
 *   2. mailboxes linked on the digest page itself (for people who read mail
 *      on a phone only), stored encrypted in this app's user settings.
 *
 * Credentials only ever go to hosts on the admin list (app config
 * boudicaai/mail_digest_hosts, default mail.myboudica.com), over HTTPS.
 * For a local test box only, an admin can point all of them at one internal
 * address instead (app config boudicaai/mail_digest_base_url, e.g.
 * http://172.17.0.1:8187); leave it unset on real servers.
 */
class MailDigestService {

    private const LINKED_KEY = 'mail_digest_links';
    private const DEFAULT_HOSTS = 'mail.myboudica.com';

    public function __construct(
        private IDBConnection $db,
        private ICrypto $crypto,
        private IConfig $config,
        private IAppConfig $appConfig,
        private IClientService $clients,
        private LoggerInterface $logger,
    ) {
    }

    /** @return string[] lower-case host names allowed to receive mailbox credentials */
    public function allowedHosts(): array {
        $raw = $this->appConfig->getValueString('boudicaai', 'mail_digest_hosts', self::DEFAULT_HOSTS);
        $hosts = array_filter(array_map(fn($h) => strtolower(trim($h)), explode(',', $raw)),
            fn($h) => (bool)preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $h));
        return array_values(array_unique($hosts));
    }

    /**
     * @return array<int, array{email: string, host: string, password: string, source: string}>
     */
    private function mailboxes(string $userId): array {
        $allowed = $this->allowedHosts();
        $out = [];
        // 1. Nextcloud Mail accounts (only when the Mail app's table exists).
        try {
            $qb = $this->db->getQueryBuilder();
            $qb->select('email', 'inbound_host', 'inbound_user', 'inbound_password')
               ->from('mail_accounts')
               ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
            $res = $qb->executeQuery();
            foreach ($res->fetchAll() as $row) {
                $host = strtolower(trim((string)$row['inbound_host']));
                if (!in_array($host, $allowed, true) || empty($row['inbound_password'])) {
                    continue;
                }
                try {
                    $pw = $this->crypto->decrypt((string)$row['inbound_password']);
                } catch (\Throwable $e) {
                    continue;
                }
                $login = strtolower(trim((string)($row['inbound_user'] ?: $row['email'])));
                $out[$login] = ['email' => $login, 'host' => $host, 'password' => $pw, 'source' => 'nextcloud_mail'];
            }
            $res->closeCursor();
        } catch (\Throwable $e) {
            // Nextcloud Mail not installed: only linked mailboxes.
        }
        // 2. Mailboxes linked on the digest page.
        foreach ($this->linked($userId) as $l) {
            $email = strtolower($l['email'] ?? '');
            if (isset($out[$email]) || !in_array($l['host'] ?? '', $allowed, true)) {
                continue;
            }
            try {
                $pw = $this->crypto->decrypt((string)$l['password']);
            } catch (\Throwable $e) {
                continue;
            }
            $out[$email] = ['email' => $email, 'host' => $l['host'], 'password' => $pw, 'source' => 'linked'];
        }
        return array_values($out);
    }

    private function linked(string $userId): array {
        $raw = $this->config->getUserValue($userId, 'boudicaai', self::LINKED_KEY, '[]');
        $list = json_decode($raw, true);
        return is_array($list) ? $list : [];
    }

    /**
     * @return array{ok: bool, status: int, items?: array, error?: string}
     */
    private function fetch(string $host, string $email, string $password, int $hours = 24): array {
        try {
            $base = rtrim($this->appConfig->getValueString('boudicaai', 'mail_digest_base_url', ''), '/');
            $url = ($base !== '' ? $base : 'https://' . $host) . '/api/digest?hours=' . $hours;
            $resp = $this->clients->newClient()->get($url, [
                'auth' => [$email, $password],
                'timeout' => 15,
                'http_errors' => false,
                'headers' => ['Accept' => 'application/json'],
            ]);
            $status = $resp->getStatusCode();
            $data = json_decode((string)$resp->getBody(), true);
            if ($status === 200 && is_array($data) && is_array($data['items'] ?? null)) {
                return ['ok' => true, 'status' => 200, 'items' => $data['items']];
            }
            $msg = match ($status) {
                401 => 'The mail server did not accept this mailbox\'s app password.',
                429 => 'Too many failed attempts; try again in a few minutes.',
                default => 'The mail server did not answer (' . $status . ').',
            };
            return ['ok' => false, 'status' => $status, 'error' => $msg];
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica Mail digest: ' . $host . ' unreachable: ' . $e->getMessage());
            return ['ok' => false, 'status' => 0, 'error' => 'The mail server could not be reached.'];
        }
    }

    /**
     * The mail section of the digest page.
     * @return array{mailboxes: array, hosts: string[]}
     */
    public function digestForUser(string $userId): array {
        $boxes = [];
        foreach ($this->mailboxes($userId) as $mb) {
            $r = $this->fetch($mb['host'], $mb['email'], $mb['password']);
            $boxes[] = ['email' => $mb['email'], 'source' => $mb['source'], 'ok' => $r['ok'],
                        'items' => $r['items'] ?? [], 'error' => $r['error'] ?? ''];
        }
        return ['mailboxes' => $boxes, 'hosts' => $this->allowedHosts()];
    }

    /** Link a mailbox from the digest page (the password is checked first). */
    public function link(string $userId, string $email, string $password, string $host): array {
        $email = strtolower(trim($email));
        $host = strtolower(trim($host));
        if (!preg_match('/^[a-z0-9._+-]{1,64}@[a-z0-9.-]{1,190}$/', $email) || $password === '' || strlen($password) > 200) {
            return ['ok' => false, 'error' => 'Enter the mailbox address and an app password.'];
        }
        if (!in_array($host, $this->allowedHosts(), true)) {
            return ['ok' => false, 'error' => 'That mail server is not a Boudica Mail server on this site.'];
        }
        $r = $this->fetch($host, $email, $password, 1);
        if (!$r['ok']) {
            return ['ok' => false, 'error' => $r['error'] ?? 'Not linked.'];
        }
        $list = array_values(array_filter($this->linked($userId), fn($l) => ($l['email'] ?? '') !== $email));
        $list[] = ['email' => $email, 'host' => $host, 'password' => $this->crypto->encrypt($password)];
        $this->config->setUserValue($userId, 'boudicaai', self::LINKED_KEY, json_encode(array_slice($list, -10)));
        return ['ok' => true];
    }

    public function unlink(string $userId, string $email): void {
        $email = strtolower(trim($email));
        $list = array_values(array_filter($this->linked($userId), fn($l) => ($l['email'] ?? '') !== $email));
        $this->config->setUserValue($userId, 'boudicaai', self::LINKED_KEY, json_encode($list));
    }
}
