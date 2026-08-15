<?php

namespace OCA\BoudicaCode\Service;

/**
 * Frames the actual prompts sent to Boudica, and cleans up its
 * responses — ported from the Python CLI's boudica_integration.py
 * (BoudicaCodegen). Build/debug-specific prompts (fix_build_error,
 * analyze_crash, linker-error handling) are NOT ported — out of scope
 * per this app's compile-check-only design.
 *
 * One deliberate simplification vs. the Python CLI: edits ask the
 * model to return the FULL updated file rather than a unified diff.
 * The original CLI used diffs (via a ~250-line hand-rolled diff
 * applier) to save tokens against a human reviewing each hunk in a
 * terminal. Here, edits are auto-applied straight into the open
 * Monaco tab — the person sees the result live and can just Ctrl+Z —
 * so a full-file response is more robust (no diff-apply failure mode)
 * at the cost of a few more tokens per edit.
 */
class PromptBuilder {

    /**
     * Rejects change requests that embed literal code snippets, which
     * tend to confuse the model into echoing them back verbatim rather
     * than understanding the intent. Ported from validate_edit_request().
     * @return array{0: bool, 1: string} [isValid, errorMessage]
     */
    public function validateEditRequest(string $changeDescription): array {
        $patterns = [
            '/<<\s*["\']/' => 'C++ stream operator with quotes',
            '/>>\s*["\']/' => 'C++ stream operator with quotes',
            '/\{[^}]*\}/' => 'code block with braces',
            '/["\'][^"\']*;[^"\']*["\']/' => 'code snippet with a semicolon',
        ];
        foreach ($patterns as $pattern => $desc) {
            if (preg_match($pattern, $changeDescription)) {
                return [false, "Your request contains embedded code ({$desc}). Describe the change in "
                    . "plain language instead — e.g. \"add color to the word-count output\" rather than "
                    . "pasting the line you want changed."];
            }
        }
        return [true, ''];
    }

    /** Ported from generate_code()'s prompt. */
    public function buildCreatePrompt(string $stack, string $description): string {
        return "No Memory\n\n"
            . "Create a {$stack} program that: {$description}\n\n"
            . "Use only cross-platform standard library facilities (no OS-specific headers/APIs).\n"
            . "Output only the complete working code. No markdown, no explanations, no code fences.";
    }

    /** Ported from clarify_request()'s prompt. */
    public function buildClarifyPrompt(string $userRequest, string $stack): string {
        return "No Memory\n\n"
            . "Clarify this prompt: '{$userRequest}'\n\n"
            . "The code language will be {$stack}\n\n"
            . "Do not request the code. Just improve the prompt so that when it and the code are sent, "
            . "the instruction will be clear and actionable.\n\nClarified prompt:";
    }

    /**
     * Ported from clarify_request()'s response validation: falls back
     * to the original request if the clarification looks truncated,
     * corrupted, or otherwise untrustworthy rather than risking a bad
     * prompt going into the actual edit.
     */
    public function cleanClarifiedResponse(string $raw, string $originalRequest): string {
        $clarified = trim($raw);
        if ($clarified === '') {
            return trim($originalRequest);
        }

        foreach (['Restate this request:', 'Clarified request:', 'Request:', 'Output:'] as $prefix) {
            if (stripos($clarified, $prefix) === 0) {
                $clarified = trim(substr($clarified, strlen($prefix)));
            }
        }

        if (str_ends_with($clarified, '"') || str_ends_with($clarified, "'")) {
            $doubles = substr_count($clarified, '"');
            $singles = substr_count($clarified, "'");
            if ($doubles % 2 !== 0 || $singles % 2 !== 0) {
                return trim($originalRequest);
            }
        }

        if (strlen($clarified) < strlen($originalRequest) * 0.3 || strlen($clarified) < 10) {
            return trim($originalRequest);
        }

        foreach (['<<', '>>', 'please provide'] as $indicator) {
            if (stripos($clarified, $indicator) !== false) {
                return trim($originalRequest);
            }
        }

        if (strlen($clarified) > 3 && strlen($clarified) < 1000) {
            return $clarified;
        }
        return trim($originalRequest);
    }

    /**
     * Simplified full-file edit prompt (see class docblock re: the
     * diff-vs-full-file tradeoff).
     */
    public function buildEditPrompt(string $filepath, string $currentCode, string $changeDescription, string $stack): string {
        $lines = explode("\n", $currentCode);
        $numbered = [];
        foreach ($lines as $i => $line) {
            $numbered[] = sprintf('%3d: %s', $i + 1, $line);
        }
        $preview = implode("\n", $numbered);

        return "No Memory\n\n"
            . "Modify this {$stack} file ({$filepath}) as follows:\n{$changeDescription}\n\n"
            . "Current file (line numbers shown for reference only, do not include them in your output):\n"
            . "{$preview}\n\n"
            . "Output ONLY the complete, updated file contents. No markdown, no explanations, no code fences, "
            . "no line numbers.";
    }

    /** Ported from chat_planning()'s prompt. */
    public function buildPlanningPrompt(string $stack, array $status, string $question): string {
        $languages = implode(', ', $status['languages'] ?? []);
        return "No Memory\n\n"
            . "You are an expert software architect helping plan a {$stack} project.\n\n"
            . "Project:\n"
            . "- Name: " . ($status['name'] ?? 'unknown') . "\n"
            . "- Languages: {$languages}\n"
            . "- Files: " . ($status['files'] ?? '?') . "\n\n"
            . "User question: {$question}\n\n"
            . "Provide helpful, concise advice for the project.";
    }

    /**
     * Ported from _extract_code_from_response(): unwraps HTML-wrapped
     * responses some inference backends return, then strips a leading
     * markdown code fence (```lang ... ```) if present.
     */
    public function cleanCodeResponse(string $responseText): string {
        $text = trim($responseText);

        if (preg_match('/^<!doctype|^<html/i', $text)) {
            if (preg_match('/<pre[^>]*>(.*?)<\/pre>/is', $text, $m) || preg_match('/<code[^>]*>(.*?)<\/code>/is', $text, $m)) {
                $text = html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5);
            } else {
                $text = trim(html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5));
            }
        }

        if (str_starts_with($text, '```')) {
            $lines = explode("\n", $text);
            if (str_starts_with($lines[0], '```')) {
                array_shift($lines);
            }
            if (!empty($lines) && trim(end($lines)) === '```') {
                array_pop($lines);
            }
            $text = trim(implode("\n", $lines));
        }

        return $text;
    }
}
