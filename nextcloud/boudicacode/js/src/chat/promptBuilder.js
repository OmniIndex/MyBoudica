/**
 * promptBuilder.js
 *
 * Frames the actual prompts sent to Boudica, and cleans up its
 * responses — ported from the Python CLI's boudica_integration.py
 * (BoudicaCodegen). Classic script, no dependencies — pure functions
 * over strings, safe to load any time before chatPanel.js.
 *
 * Runs client-side (not server-side) now that boudicaApi.js talks to
 * Boudica directly from the browser — see boudicaApi.js's docblock
 * for why. Build/debug-specific prompts (fix_build_error,
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
 *
 * Every prompt here starts with "No Memory\n\n" by design: it's the
 * literal phrase boudicaApi.js's shouldIsolateSession() looks for, so
 * every one of these requests automatically gets an isolated session
 * rather than polluting the project's persistent chat memory.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    /**
     * Rejects change requests that embed literal code snippets, which
     * tend to confuse the model into echoing them back verbatim rather
     * than understanding the intent. Ported from validate_edit_request().
     * @returns {[boolean, string]} [isValid, errorMessage]
     */
    function validateEditRequest(changeDescription) {
        const patterns = [
            [/<<\s*["']/, 'C++ stream operator with quotes'],
            [/>>\s*["']/, 'C++ stream operator with quotes'],
            [/\{[^}]*\}/, 'code block with braces'],
            [/["'][^"']*;[^"']*["']/, 'code snippet with a semicolon'],
        ];
        for (const [pattern, desc] of patterns) {
            if (pattern.test(changeDescription)) {
                return [
                    false,
                    `Your request contains embedded code (${desc}). Describe the change in plain ` +
                        `language instead — e.g. "add color to the word-count output" rather than ` +
                        `pasting the line you want changed.`,
                ];
            }
        }
        return [true, ''];
    }

    /** Ported from generate_code()'s prompt. */
    /** @param {string} [headerContext] - if given, the .cpp must implement exactly this header (see buildHeaderPrompt + chatPanel.js's _createCppPair). */
    function buildCreatePrompt(stack, description, headerContext) {
        const headerClause = headerContext
            ? `\n\nThis is the implementation file for a header that already exists. It must match this header ` +
              `exactly — same function signatures, same class members, same names, nothing added or renamed:\n` +
              `${headerContext}\n`
            : '';
        return (
            `No Memory\n\n` +
            `Create a ${stack} program that: ${description}${headerClause}\n\n` +
            `You are ONLY writing source code — do not attempt to actually browse the web, fetch URLs, ` +
            `call tools, or perform any of the program's actions yourself, and do not break this into ` +
            `sub-tasks or ask for anything to be fetched. The finished program will do all of that itself ` +
            `when someone runs it later; your job is only to write the code that will do it, not to do it now.\n` +
            `Use only cross-platform standard library facilities (no OS-specific headers/APIs).\n` +
            `Output only the complete working code. No markdown, no explanations, no code fences.`
        );
    }

    /** Companion to buildCreatePrompt: asks for ONLY the header/interface, no implementation — see chatPanel.js's _createCppPair. */
    function buildHeaderPrompt(stack, description) {
        return (
            `No Memory\n\n` +
            `Design ONLY the header file (declarations/interface, no implementation) for a ${stack} program ` +
            `that: ${description}\n\n` +
            `Include proper header guards (#pragma once). Declare classes/functions with full signatures but ` +
            `no function bodies (except trivial inline getters/setters if truly appropriate).\n` +
            `You are ONLY writing source code — do not attempt to actually browse the web, fetch URLs, call ` +
            `tools, or perform any of the program's actions yourself.\n` +
            `Output only the complete header file. No markdown, no explanations, no code fences.`
        );
    }

    /** Ported from clarify_request()'s prompt. */
    function buildClarifyPrompt(userRequest, stack) {
        return (
            `No Memory\n\n` +
            `Clarify this prompt: '${userRequest}'\n\n` +
            `The code language will be ${stack}\n\n` +
            `Do not request the code. Just improve the prompt so that when it and the code are sent, ` +
            `the instruction will be clear and actionable.\n\nClarified prompt:`
        );
    }

    /**
     * Ported from clarify_request()'s response validation: falls back
     * to the original request if the clarification looks truncated,
     * corrupted, or otherwise untrustworthy rather than risking a bad
     * prompt going into the actual edit.
     */
    function cleanClarifiedResponse(raw, originalRequest) {
        let clarified = (raw || '').trim();
        if (clarified === '') {
            return originalRequest.trim();
        }

        for (const prefix of ['Restate this request:', 'Clarified request:', 'Request:', 'Output:']) {
            if (clarified.toLowerCase().startsWith(prefix.toLowerCase())) {
                clarified = clarified.slice(prefix.length).trim();
            }
        }

        if (clarified.endsWith('"') || clarified.endsWith("'")) {
            const doubles = (clarified.match(/"/g) || []).length;
            const singles = (clarified.match(/'/g) || []).length;
            if (doubles % 2 !== 0 || singles % 2 !== 0) {
                return originalRequest.trim();
            }
        }

        if (clarified.length < originalRequest.length * 0.3 || clarified.length < 10) {
            return originalRequest.trim();
        }

        for (const indicator of ['<<', '>>', 'please provide']) {
            if (clarified.toLowerCase().includes(indicator.toLowerCase())) {
                return originalRequest.trim();
            }
        }

        if (clarified.length > 3 && clarified.length < 1000) {
            return clarified;
        }
        return originalRequest.trim();
    }

    /** Simplified full-file edit prompt (see module docblock re: the diff-vs-full-file tradeoff). */
    function buildEditPrompt(filepath, currentCode, changeDescription, stack) {
        const preview = currentCode
            .split('\n')
            .map((line, i) => `${String(i + 1).padStart(3, ' ')}: ${line}`)
            .join('\n');

        return (
            `No Memory\n\n` +
            `Modify this ${stack} file (${filepath}) as follows:\n${changeDescription}\n\n` +
            `You are ONLY writing source code — do not attempt to actually browse the web, fetch URLs, ` +
            `call tools, or perform any of the program's actions yourself. The finished program will do ` +
            `that itself when someone runs it later; your job is only to write the code that will do it.\n` +
            `Current file (line numbers shown for reference only, do not include them in your output):\n` +
            `${preview}\n\n` +
            `Output ONLY the complete, updated file contents. No markdown, no explanations, no code fences, ` +
            `no line numbers.`
        );
    }

    /** Ported from chat_planning()'s prompt. */
    function buildPlanningPrompt(stack, status, question) {
        const languages = (status.languages || []).join(', ');
        return (
            `No Memory\n\n` +
            `You are an expert software architect helping plan a ${stack} project. This is a discussion ` +
            `only — do not attempt to browse the web, fetch URLs, or perform any actions; just advise.\n\n` +
            `Project:\n` +
            `- Name: ${status.name || 'unknown'}\n` +
            `- Languages: ${languages}\n` +
            `- Files: ${status.files ?? '?'}\n\n` +
            `User question: ${question}\n\n` +
            `Provide helpful, concise advice for the project.`
        );
    }

    /**
     * Ported from _extract_code_from_response(): unwraps HTML-wrapped
     * responses some inference backends return, then strips a leading
     * markdown code fence (```lang ... ```) if present.
     */
    function cleanCodeResponse(responseText) {
        let text = (responseText || '').trim();

        if (/^<!doctype|^<html/i.test(text)) {
            const preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i) || text.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
            if (preMatch) {
                text = decodeHtmlEntities(preMatch[1].trim());
            } else {
                const div = document.createElement('div');
                div.innerHTML = text;
                text = decodeHtmlEntities((div.textContent || '').trim());
            }
        }

        if (text.startsWith('```')) {
            const lines = text.split('\n');
            if (lines[0].startsWith('```')) {
                lines.shift();
            }
            if (lines.length && lines[lines.length - 1].trim() === '```') {
                lines.pop();
            }
            text = lines.join('\n').trim();
        }

        return text;
    }

    function decodeHtmlEntities(text) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    }

    BoudicaCode.PromptBuilder = {
        validateEditRequest,
        buildCreatePrompt,
        buildHeaderPrompt,
        buildClarifyPrompt,
        cleanClarifiedResponse,
        buildEditPrompt,
        buildPlanningPrompt,
        cleanCodeResponse,
    };
})(window);
