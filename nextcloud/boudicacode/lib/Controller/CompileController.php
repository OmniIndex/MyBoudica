<?php

namespace OCA\BoudicaCode\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

/**
 * Runs a compile-check OR a safe BUILD step (compile-to-object-file,
 * transpile) against whatever toolchains are already installed on this
 * container. Content is written to a private temp directory, processed,
 * then cleaned up — nothing touches the user's actual Nextcloud storage.
 *
 * SAFETY INVARIANT — never relaxed by the "build" support below: no code
 * path here ever EXECUTES anything the request body contains, and no
 * artifact this controller produces (a .o file, transpiled .js, a .class
 * file, a .pyc) is ever invoked. Every entry in resolveCommand() either:
 *  - parses/type-checks only and produces no artifact at all (g++/gcc
 *    -fsyntax-only for headers, python's py_compile, node --check,
 *    bash -n — all explicitly documented as execute-nothing checks), or
 *  - performs a real build step that deliberately stops short of
 *    anything runnable: gcc/g++ -c (compiles a .c/.cpp to a .o object
 *    file — NOT linked to a final executable, so there is never a
 *    runnable binary sitting around to accidentally invoke), tsc
 *    (type-checks and transpiles to .js, which this controller never
 *    executes), javac (already did exactly this before — compiles to
 *    .class, never run).
 *
 * -c instead of a full link is used for C/C++ specifically so a .cpp
 * with no main() — the normal case for most files in a multi-file
 * project, see the scaffolded CMakeLists.txt's
 * `file(GLOB SOURCES "src/*.cpp" "*.cpp")` — still checks correctly
 * instead of spuriously failing with "undefined reference to main".
 *
 * ACTUALLY RUNNING a build (linking + invoking the result) or a test
 * suite is a deliberately separate, much bigger decision: it means
 * executing arbitrary, potentially malicious code, which the
 * proc_open+timeout model in this controller was never designed to
 * contain safely (no network isolation, no filesystem isolation beyond
 * the temp dir, no resource ceilings beyond a wall-clock timeout). That
 * belongs in its own fully sandboxed service (its own container, full
 * toolchain, gVisor/Firecracker-grade isolation) — not bolted onto this
 * controller. Deliberately out of scope here.
 *
 * Every command still runs through `timeout` and PHP's array-form
 * `proc_open` (no shell interpolation, so file content/filenames can't
 * inject commands).
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
        $entry = $this->resolveCommand($ext);

        if ($entry === null) {
            return new JSONResponse([
                'success' => false,
                'output' => "No compile/build check available for .$ext files yet.",
            ]);
        }

        $tmpDir = sys_get_temp_dir() . '/boudicacode-compile-' . bin2hex(random_bytes(8));
        mkdir($tmpDir, 0700, true);

        $safeName = preg_replace('/[^A-Za-z0-9_.\-]/', '_', basename($filename)) ?: 'input';
        $tmpFile = $tmpDir . '/' . $safeName;
        file_put_contents($tmpFile, $content);

        [$stdout, $stderr, $exitCode] = $this->runCommand($entry['command']($tmpFile, $tmpDir), $tmpDir);

        // Clean up regardless of outcome — this also sweeps up any real
        // build artifact (.o, .js, .class) the command above produced;
        // none of them are ever read or executed first.
        foreach (glob("$tmpDir/*") ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($tmpDir);

        $output = trim($stdout . "\n" . $stderr);
        $success = $exitCode === 0;

        if ($output === '') {
            // Previously this always showed "No errors found" here, even
            // on a non-zero exit with nothing captured — which happens
            // when the toolchain itself isn't installed and "command not
            // found" never made it into stdout/stderr. That was a latent
            // bug even before this change, but covering more toolchains
            // (tsc/node/bash aren't as universally preinstalled as
            // gcc/python3) makes a missing binary a real possibility
            // rather than a theoretical one — report it honestly instead
            // of a false "no errors" success.
            $output = $success
                ? $entry['successLabel']
                : "✗ Exited with code {$exitCode} but produced no output — the toolchain may not be installed on this container.";
        }

        return new JSONResponse([
            'success' => $success,
            'output' => $output,
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

    /**
     * @return array{command: callable, successLabel: string}|null
     */
    private function resolveCommand(string $ext): ?array {
        $timeout = self::TIMEOUT_SECONDS;

        $entries = [
            'py' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'python3', '-m', 'py_compile', $f],
                'successLabel' => '✓ Syntax OK — compiled to bytecode, not executed.',
            ],
            // -c: compile to a .o object file, don't link — see class
            // docblock for why this replaced a full link.
            'c' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'gcc', '-Wall', '-c', $f, '-o', "$dir/out.o"],
                'successLabel' => '✓ Compiled to an object file (not linked or executed).',
            ],
            'cpp' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-Wall', '-c', $f, '-o', "$dir/out.o"],
                'successLabel' => '✓ Compiled to an object file (not linked or executed).',
            ],
            'cc' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-Wall', '-c', $f, '-o', "$dir/out.o"],
                'successLabel' => '✓ Compiled to an object file (not linked or executed).',
            ],
            'cxx' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-Wall', '-c', $f, '-o', "$dir/out.o"],
                'successLabel' => '✓ Compiled to an object file (not linked or executed).',
            ],
            // Headers aren't a translation unit on their own the way a
            // .cpp is, so building one to a .o doesn't mean much — stays
            // a syntax/type check only, same as before this change.
            'h' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-fsyntax-only', '-Wall', $f],
                'successLabel' => '✓ Syntax/type check passed (headers aren\'t compiled standalone).',
            ],
            'hpp' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'g++', '-fsyntax-only', '-Wall', $f],
                'successLabel' => '✓ Syntax/type check passed (headers aren\'t compiled standalone).',
            ],
            'java' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'javac', '-d', $dir, $f],
                'successLabel' => '✓ Compiled to bytecode (not executed).',
            ],
            // tsc type-checks AND transpiles to .js — a real build step,
            // not just a syntax check, same safety invariant as C/C++
            // above (the .js it produces is never executed here). No
            // tsconfig.json/node_modules exists in this isolated temp
            // dir, so — same pre-existing limitation as javac above,
            // which can't resolve external Maven deps either — imports
            // of other project files or npm packages won't resolve.
            'ts' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'tsc', $f, '--outDir', $dir, '--target', 'ES2020', '--module', 'commonjs', '--jsx', 'react', '--skipLibCheck'],
                'successLabel' => '✓ Type-checked and transpiled to JS (not executed).',
            ],
            'tsx' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'tsc', $f, '--outDir', $dir, '--target', 'ES2020', '--module', 'commonjs', '--jsx', 'react', '--skipLibCheck'],
                'successLabel' => '✓ Type-checked and transpiled to JS (not executed).',
            ],
            // node --check parses without executing — same safety tier
            // as py_compile/bash -n below. .jsx is deliberately NOT
            // included: plain node doesn't understand JSX syntax, so
            // valid JSX would fail here as if it were a syntax error,
            // which is worse than having no check at all.
            'js' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'node', '--check', $f],
                'successLabel' => '✓ Syntax OK (not executed).',
            ],
            // bash -n reads and parses the script without executing any
            // of it — explicitly documented bash behavior, not an
            // approximation.
            'sh' => [
                'command' => fn($f, $dir) => ['timeout', $timeout, 'bash', '-n', $f],
                'successLabel' => '✓ Syntax OK (not executed).',
            ],
        ];

        return $entries[$ext] ?? null;
    }
}
