<?php

namespace OCA\BoudicaCode\Controller;

use OCA\BoudicaCode\Service\BoudicaAiClient;
use OCA\BoudicaCode\Service\BoudicaAiException;
use OCA\BoudicaCode\Service\ProjectScaffolder;
use OCA\BoudicaCode\Service\PromptBuilder;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Implements the /api/command and /api/chat endpoints that
 * chatPanel.js already posts to (see the handoff doc — these were the
 * "almost certainly next session" placeholders). Wires together:
 *   - ProjectScaffolder  -> what files a new project needs
 *   - PromptBuilder      -> how to phrase requests to the model
 *   - BoudicaAiClient    -> actually talking to the inference server
 * and writes results to the user's Nextcloud storage via IRootFolder,
 * the same Files API ProjectDownloadController already uses (so this
 * works identically whether or not WebDAV is involved).
 *
 * Deliberately out of scope, per this app's design: build, run, and
 * debug. This controller only creates/edits source files; the
 * existing "▶ Check" button (CompileController) remains the only
 * thing that ever invokes a toolchain.
 */
class AgentController extends Controller {

    private IRootFolder $rootFolder;
    private IUserSession $userSession;
    private ProjectScaffolder $scaffolder;
    private PromptBuilder $prompts;
    private BoudicaAiClient $ai;

    private const EXTENSION_TO_STACK = [
        'cpp' => 'cpp', 'cc' => 'cpp', 'cxx' => 'cpp', 'h' => 'cpp', 'hpp' => 'cpp',
        'py' => 'python',
        'js' => 'nodejs', 'jsx' => 'nodejs',
        'ts' => 'typescript', 'tsx' => 'typescript',
        'java' => 'java',
        'sh' => 'bash',
        'bat' => 'batch', 'cmd' => 'batch',
    ];

    public function __construct(
        string $appName,
        IRequest $request,
        IRootFolder $rootFolder,
        IUserSession $userSession,
        ProjectScaffolder $scaffolder,
        PromptBuilder $prompts,
        BoudicaAiClient $ai
    ) {
        parent::__construct($appName, $request);
        $this->rootFolder = $rootFolder;
        $this->userSession = $userSession;
        $this->scaffolder = $scaffolder;
        $this->prompts = $prompts;
        $this->ai = $ai;
    }

    /**
     * @NoAdminRequired
     */
    public function command(
        string $projectRoot = '',
        string $command = '',
        string $argsRaw = '',
        ?string $currentFile = null,
        ?string $currentContent = null
    ): JSONResponse {
        try {
            $userFolder = $this->getUserFolderOrFail();
        } catch (\RuntimeException $e) {
            return new JSONResponse(['message' => $e->getMessage()], 401);
        }

        switch (strtolower($command)) {
            case 'new':
                return $this->handleNew($userFolder, $argsRaw);
            case 'create':
                return $this->handleCreate($userFolder, $projectRoot, $argsRaw);
            case 'edit':
                return $this->handleEdit($userFolder, $projectRoot, $argsRaw, $currentFile, $currentContent);
            case 'status':
                return new JSONResponse(['message' => $this->describeStatus($userFolder, $projectRoot)]);
            case 'help':
            case '':
                return new JSONResponse(['message' => $this->helpText()]);
            default:
                return new JSONResponse(['message' => "Unknown command \"/{$command}\". {$this->helpText()}"]);
        }
    }

    /**
     * @NoAdminRequired
     */
    public function chat(
        string $projectRoot = '',
        string $message = '',
        ?string $currentFile = null,
        ?string $currentContent = null
    ): JSONResponse {
        try {
            $userFolder = $this->getUserFolderOrFail();
        } catch (\RuntimeException $e) {
            return new JSONResponse(['reply' => $e->getMessage()], 401);
        }

        if (trim($message) === '') {
            return new JSONResponse(['reply' => 'Say something, or try /help for commands.']);
        }

        // A file is open in the editor -> treat free text as an edit
        // request against it (auto-applied), matching this app's
        // "editing in the window -> auto-edit" requirement.
        if ($currentFile !== null && $currentContent !== null) {
            return $this->handleEdit($userFolder, $projectRoot, $message, $currentFile, $currentContent);
        }

        // No file open -> planning/discussion chat about the project.
        $stack = $this->readProjectStack($userFolder, $projectRoot) ?? 'general';
        $status = $this->buildStatus($userFolder, $projectRoot);
        try {
            $reply = $this->ai->chat($this->prompts->buildPlanningPrompt($stack, $status, $message));
        } catch (BoudicaAiException $e) {
            return new JSONResponse(['reply' => "Couldn't reach Boudica: {$e->getMessage()}"]);
        }
        return new JSONResponse(['reply' => $reply !== '' ? $reply : '(no response)']);
    }

    // ─── Command handlers ────────────────────────────────────────────

    /** "/new <name> [stack]" — scaffold a brand-new project and switch into it. */
    private function handleNew(Folder $userFolder, string $argsRaw): JSONResponse {
        $parts = preg_split('/\s+/', trim($argsRaw), 2);
        $name = $parts[0] ?? '';
        $stack = $parts[1] ?? 'python';

        if ($name === '') {
            return new JSONResponse(['message' => 'Usage: /new <project-name> [stack]. Stacks: '
                . implode(', ', ProjectScaffolder::SUPPORTED_STACKS)]);
        }
        if (!in_array($stack, ProjectScaffolder::SUPPORTED_STACKS, true)) {
            return new JSONResponse(['message' => "Unknown stack \"{$stack}\". Choose one of: "
                . implode(', ', ProjectScaffolder::SUPPORTED_STACKS)]);
        }

        $safeName = trim(preg_replace('/[^A-Za-z0-9_\-]+/', '-', $name), '-');
        if ($safeName === '') {
            return new JSONResponse(['message' => "\"{$name}\" doesn't produce a usable folder name — try letters/numbers/dashes."]);
        }

        if ($userFolder->nodeExists($safeName)) {
            return new JSONResponse(['message' => "A file or folder named \"{$safeName}\" already exists."]);
        }

        $plan = $this->scaffolder->scaffold($safeName, $stack);

        $projectFolder = $userFolder->newFolder($safeName);
        foreach ($plan['dirs'] as $dir) {
            $this->ensureFolder($projectFolder, $dir);
        }
        $fileCount = 0;
        foreach ($plan['files'] as $relPath => $content) {
            $this->writeFileEnsuringParents($projectFolder, $relPath, $content);
            $fileCount++;
        }

        return new JSONResponse([
            'message' => "Created new {$stack} project \"{$safeName}\" ({$fileCount} files) and switched to it.",
            'projectRoot' => $safeName,
        ]);
    }

    /** "/create <path> <description...>" — generate a new file from a description. */
    private function handleCreate(Folder $userFolder, string $projectRoot, string $argsRaw): JSONResponse {
        $parts = preg_split('/\s+/', trim($argsRaw), 2);
        $path = $parts[0] ?? '';
        $description = trim($parts[1] ?? '');

        if ($path === '' || $description === '') {
            return new JSONResponse(['message' => 'Usage: /create <path/to/file.ext> <what it should do>']);
        }

        try {
            $projectFolder = $this->resolveProjectFolder($userFolder, $projectRoot);
            $this->assertSafeRelativePath($path);
        } catch (\RuntimeException $e) {
            return new JSONResponse(['message' => $e->getMessage()]);
        }

        if ($projectFolder->nodeExists($path)) {
            return new JSONResponse(['message' => "\"{$path}\" already exists — use /edit on it instead, or pick a different name."]);
        }

        $stack = $this->readProjectStack($userFolder, $projectRoot)
            ?? $this->stackFromExtension($path)
            ?? 'python';

        try {
            $raw = $this->ai->chat(
                $this->prompts->buildCreatePrompt($stack, $description),
                ['max_tokens' => 8192, 'temperature' => 0.7]
            );
        } catch (BoudicaAiException $e) {
            return new JSONResponse(['message' => "Couldn't reach Boudica: {$e->getMessage()}"]);
        }

        $code = $this->prompts->cleanCodeResponse($raw);
        if (trim($code) === '') {
            return new JSONResponse(['message' => 'Boudica returned an empty response — try rephrasing the description.']);
        }
        if (!str_ends_with($code, "\n")) {
            $code .= "\n";
        }

        $this->writeFileEnsuringParents($projectFolder, $path, $code);

        return new JSONResponse([
            'message' => "Created {$path}.",
            'openPath' => $path,
        ]);
    }

    /**
     * "/edit <description>" (or free-text chat with a file open) —
     * rewrite the currently-open file per the change description, then
     * auto-apply the result to the live editor via updatedPath/updatedContent.
     */
    private function handleEdit(
        Folder $userFolder,
        string $projectRoot,
        string $changeDescription,
        ?string $currentFile,
        ?string $currentContent
    ): JSONResponse {
        if (!$currentFile) {
            return new JSONResponse(['message' => 'No file is open in the editor — open one first, or use /create <path> <description> for a new file.']);
        }
        $changeDescription = trim($changeDescription);
        if ($changeDescription === '') {
            return new JSONResponse(['message' => 'Usage: /edit <description of the change>']);
        }

        [$isValid, $error] = $this->prompts->validateEditRequest($changeDescription);
        if (!$isValid) {
            return new JSONResponse(['message' => $error]);
        }

        try {
            $projectFolder = $this->resolveProjectFolder($userFolder, $projectRoot);
            $this->assertSafeRelativePath($currentFile);
        } catch (\RuntimeException $e) {
            return new JSONResponse(['message' => $e->getMessage()]);
        }

        $stack = $this->readProjectStack($userFolder, $projectRoot)
            ?? $this->stackFromExtension($currentFile)
            ?? 'python';

        try {
            $clarifiedRaw = $this->ai->generate(
                $this->prompts->buildClarifyPrompt($changeDescription, $stack),
                ['max_tokens' => 256, 'temperature' => 0.3, 'no_memory' => true]
            );
            $clarified = $this->prompts->cleanClarifiedResponse($clarifiedRaw, $changeDescription);

            $editedRaw = $this->ai->generate(
                $this->prompts->buildEditPrompt($currentFile, $currentContent ?? '', $clarified, $stack),
                ['max_tokens' => 8192, 'temperature' => 0.2, 'no_memory' => true]
            );
        } catch (BoudicaAiException $e) {
            return new JSONResponse(['message' => "Couldn't reach Boudica: {$e->getMessage()}"]);
        }

        $updatedCode = $this->prompts->cleanCodeResponse($editedRaw);
        if (trim($updatedCode) === '') {
            return new JSONResponse(['message' => 'Boudica returned an empty edit — nothing was changed.']);
        }
        if (!str_ends_with($updatedCode, "\n")) {
            $updatedCode .= "\n";
        }

        $this->writeFileEnsuringParents($projectFolder, $currentFile, $updatedCode);

        return new JSONResponse([
            'message' => "Updated {$currentFile}.",
            'updatedPath' => $currentFile,
            'updatedContent' => $updatedCode,
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private function getUserFolderOrFail(): Folder {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new \RuntimeException('Not logged in.');
        }
        return $this->rootFolder->getUserFolder($user->getUID());
    }

    /** @throws \RuntimeException if projectRoot is missing or unsafe */
    private function resolveProjectFolder(Folder $userFolder, string $projectRoot): Folder {
        if ($projectRoot === '') {
            return $userFolder;
        }
        $this->assertSafeRelativePath($projectRoot);
        try {
            $node = $userFolder->get($projectRoot);
        } catch (NotFoundException $e) {
            throw new \RuntimeException("Project \"{$projectRoot}\" no longer exists.");
        }
        if (!($node instanceof Folder)) {
            throw new \RuntimeException("\"{$projectRoot}\" is not a folder.");
        }
        return $node;
    }

    /** @throws \RuntimeException if the path tries to escape the project */
    private function assertSafeRelativePath(string $relativePath): void {
        if ($relativePath === '' || str_starts_with($relativePath, '/') || str_contains($relativePath, '..')) {
            throw new \RuntimeException("Refusing unsafe path: \"{$relativePath}\".");
        }
    }

    private function ensureFolder(Folder $root, string $relativePath): Folder {
        $current = $root;
        foreach (explode('/', trim($relativePath, '/')) as $segment) {
            if ($segment === '') {
                continue;
            }
            $current = $current->nodeExists($segment)
                ? $current->get($segment)
                : $current->newFolder($segment);
        }
        return $current;
    }

    private function writeFileEnsuringParents(Folder $root, string $relativePath, string $content): void {
        $relativePath = ltrim($relativePath, '/');
        $dir = dirname($relativePath);
        $name = basename($relativePath);
        $parent = ($dir === '.' || $dir === '') ? $root : $this->ensureFolder($root, $dir);

        if ($parent->nodeExists($name)) {
            $file = $parent->get($name);
        } else {
            $file = $parent->newFile($name);
        }
        $file->putContent($content);
    }

    private function readProjectStack(Folder $userFolder, string $projectRoot): ?string {
        try {
            $folder = $this->resolveProjectFolder($userFolder, $projectRoot);
            if (!$folder->nodeExists('.boudica_project.json')) {
                return null;
            }
            $config = json_decode($folder->get('.boudica_project.json')->getContent(), true);
            return is_array($config) ? ($config['stack'] ?? null) : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function stackFromExtension(string $path): ?string {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return self::EXTENSION_TO_STACK[$ext] ?? null;
    }

    private function buildStatus(Folder $userFolder, string $projectRoot): array {
        try {
            $folder = $this->resolveProjectFolder($userFolder, $projectRoot);
        } catch (\RuntimeException $e) {
            return ['name' => $projectRoot ?: '(home)', 'files' => 0, 'languages' => []];
        }

        $name = $projectRoot !== '' ? basename($projectRoot) : $folder->getName();
        $fileCount = 0;
        foreach ($folder->getDirectoryListing() as $node) {
            if ($node->getType() === \OCP\Files\FileInfo::TYPE_FILE && !str_starts_with($node->getName(), '.')) {
                $fileCount++;
            }
        }

        $stack = $this->readProjectStack($userFolder, $projectRoot);
        return [
            'name' => $name,
            'files' => $fileCount,
            'languages' => $stack ? [$stack] : [],
        ];
    }

    private function describeStatus(Folder $userFolder, string $projectRoot): string {
        $status = $this->buildStatus($userFolder, $projectRoot);
        $languages = implode(', ', $status['languages']) ?: 'unknown';
        return "Project \"{$status['name']}\" — {$status['files']} top-level files, language: {$languages}.";
    }

    private function helpText(): string {
        return "Commands: /new <name> <stack> (" . implode('|', ProjectScaffolder::SUPPORTED_STACKS)
            . "), /create <path> <description>, /edit <description> (edits the open file), /status. "
            . "Or just type normally to ask a question or, with a file open, request an edit.";
    }
}
