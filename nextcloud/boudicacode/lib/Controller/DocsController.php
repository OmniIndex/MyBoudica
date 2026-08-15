<?php

namespace OCA\BoudicaCode\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\NotFoundResponse;
use OCP\AppFramework\Http\Response;
use OCP\IRequest;

/**
 * Serves files from this app's own docs/ folder directly — same
 * workaround shape as MonacoAssetsController, different root cause:
 * Nextcloud's own .htaccess only serves a fixed extension allowlist
 * (css/js/svg/png/ttf/woff/... — not .md, .txt, etc.) as plain static
 * files off disk; anything outside that list gets routed through
 * index.php instead, and since there's no app route matching an
 * arbitrary docs/ path, it 404s there even though the file genuinely
 * exists on disk. This controller reads it directly and streams it
 * back with an appropriate Content-Type, bypassing that limitation —
 * exactly what editorPanel.js's Home tab needs to fetch a markdown
 * user guide bundled inside the app itself.
 */
class DocsController extends Controller {

    private const MIME_TYPES = [
        'md' => 'text/markdown',
        'txt' => 'text/plain',
        'html' => 'text/html',
        'json' => 'application/json',
    ];

    public function __construct(string $appName, IRequest $request) {
        parent::__construct($appName, $request);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function serve(string $path): Response {
        // Guard against path traversal — only allow characters real
        // filenames use; realpath() below catches anything this regex
        // alone might miss (symlink tricks, encoded '..', etc.).
        if (str_contains($path, '..') || !preg_match('#^[A-Za-z0-9/_.\-]+$#', $path)) {
            return new NotFoundResponse();
        }

        $baseDir = realpath(__DIR__ . '/../../docs');
        if ($baseDir === false) {
            return new NotFoundResponse(); // docs/ doesn't exist in this deployment
        }

        $fullPath = realpath($baseDir . '/' . $path);
        if ($fullPath === false || !str_starts_with($fullPath, $baseDir . DIRECTORY_SEPARATOR)) {
            return new NotFoundResponse();
        }
        if (!is_file($fullPath)) {
            return new NotFoundResponse();
        }

        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
        $mime = self::MIME_TYPES[$ext] ?? 'text/plain';

        $content = file_get_contents($fullPath);
        return new DataDisplayResponse($content, 200, ['Content-Type' => $mime . '; charset=utf-8']);
    }
}
