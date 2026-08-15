<?php

namespace OCA\BoudicaCode\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

/**
 * Runs a compile/syntax check (not a full build, and never executes
 * the result) against whatever compiler toolchains are already
 * installed on this container. Content is written to a private temp
 * directory, checked, then cleaned up — nothing touches the user's
 * actual Nextcloud storage.
 *
 * Deliberately syntax-check only:
 *  - gcc/g++ use -fsyntax-only (parses/type-checks, never links)
 *  - python uses py_compile (compiles to bytecode, never executes)
 *  - javac does compile to .class, since Java has no syntax-only flag,
 *    but compiling still never executes anything
 *
 * Every command runs under `timeout` and via proc_open's array form
 * (bypasses the shell entirely — no injection surface from filenames
 * or content).
 */
class CompileController extends Controller {

    private const TIMEOUT_SECONDS = '10';

    public function __construct(string $appName, IRequest $request) {
        parent::__construct($appName, $request);
    }

    /**
     * @NoAdminRequired
     */
    public function check(string $filename, string $content): JSONResponse {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $commandBuilder = $this->resolveCommand($ext);

        if ($commandBuilder === null) {
            return new JSONResponse([
                'success' => false,
                'output' => "No compile-check available for .$ext files yet.",
            ]);
        }

        $tmpDir = sys_get_temp_dir() . '/boudicacode-compile-' . bin2hex(random_bytes(8));
        mkdir($tmpDir, 0700, true);

        $safeName = preg_replace('/[^A-Za-z0-9_.\-]/', '_', basename($filename)) ?: 'input';
        $tmpFile = $tmpDir . '/' . $safeName;
        file_put_contents($tmpFile, $content);

        [$stdout, $stderr, $exitCode] = $this->runCommand($commandBuilder($tmpFile, $tmpDir), $tmpDir);

        // Clean up regardless of outcome.
        foreach (glob("$tmpDir/*") ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($tmpDir);

        $output = trim($stdout . "\n" . $stderr);

        return new JSONResponse([
            'success' => $exitCode === 0,
            'output' => $output !== '' ? $output : '✓ No errors found.',
            'exitCode' => $exitCode,
        ]);
    }

    /** @return array{0: string, 1: string, 2: int} [stdout, stderr, exitCode] */
    private function runCommand(array $command, string $cwd): array {
        $descriptorSpec = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $process = @proc_open($command, $descriptorSpec, $pipes, $cwd);

        if (!is_resource($process)) {
            return ['', 'Could not start the compiler process — is it installed on this container?', 127];
        }

        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);

        return [$stdout ?: '', $stderr ?: '', $exitCode];
    }

    private function resolveCommand(string $ext): ?callable {
        $timeout = self::TIMEOUT_SECONDS;
        $map = [
            'py' => fn($f, $dir) => ['timeout', $timeout, 'python3', '-m', 'py_compile', $f],
            'c' => fn($f, $dir) => ['timeout', $timeout, 'gcc', '-fsyntax-only', '-Wall', $f],
            'cpp' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-fsyntax-only', '-Wall', $f],
            'cc' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-fsyntax-only', '-Wall', $f],
            'cxx' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-fsyntax-only', '-Wall', $f],
            'h' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-fsyntax-only', '-Wall', $f],
            'hpp' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-fsyntax-only', '-Wall', $f],
            'java' => fn($f, $dir) => ['timeout', $timeout, 'javac', '-d', $dir, $f],
        ];
        return $map[$ext] ?? null;
    }
}
