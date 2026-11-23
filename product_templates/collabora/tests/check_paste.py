#!/usr/bin/env python3
"""Checks a document Collabora made from the widget's paste (paste_fixture.md).

    check_paste.py <converted.odt>

Exit 0 when everything arrived as the real thing; 1 with the problems listed.
"""
import re
import sys
import zipfile


def para_texts(xml):
    """Text of each paragraph/heading, spaces (<text:s/>) and line breaks kept."""
    out = []
    for m in re.finditer(r'<text:(p|h)\b[^>]*>(.*?)</text:\1>', xml, re.S):
        t = m.group(2)
        t = re.sub(r'<text:s text:c="(\d+)"\s*/>', lambda s: ' ' * int(s.group(1)), t)
        t = re.sub(r'<text:s\s*/>', ' ', t)
        t = re.sub(r'<text:line-break\s*/>', '\n', t)
        t = re.sub(r'<text:tab\s*/>', '\t', t)
        t = re.sub(r'<[^>]+>', '', t)
        t = t.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&apos;', "'").replace('&quot;', '"')
        out.append(t)
    return out


def list_depth(xml, needle):
    """How many lists the first paragraph containing needle sits inside (0 = none, None = not found)."""
    depth = 0
    # (?<!/)> skips empty self-closing paragraphs, which would otherwise swallow
    # the list tags up to the next paragraph's end.
    for m in re.finditer(r'<text:list[ >]|</text:list>|<text:(p|h)\b[^>]*(?<!/)>(.*?)</text:\1>', xml, re.S):
        t = m.group(0)
        if t.startswith('<text:list'):
            depth += 1
        elif t == '</text:list>':
            depth -= 1
        elif needle in re.sub(r'<[^>]+>', '', m.group(2)):
            return depth
    return None


def main():
    xml = zipfile.ZipFile(sys.argv[1]).read('content.xml').decode('utf-8')
    texts = para_texts(xml)
    lines = [l for t in texts for l in t.split('\n')]
    problems = []

    if xml.count('<table:table ') != 2:
        problems.append(f"expected 2 real tables, found {xml.count('<table:table ')}")
    if any(re.match(r'\s*\|', l) for l in lines):
        problems.append('a table arrived as "| ... |" text lines')
    if any(re.match(r'\s*\|?\s*:?-{3,}', l) for l in lines):
        problems.append('a table separator ("|---|") arrived as text')
    if 'BOUDICA' in xml.replace('Boudica', ''):
        problems.append('a widget placeholder (BOUDICAPRE/BOUDICATABLE) reached the document')
    if '```' in xml:
        problems.append('code fences reached the document as text')

    # The drawn diagram: every line on its own line, inner spacing kept.
    for want in ['┌──────────────┐     ┌──────────────┐',
                 '│  NEW EMAIL   │ ──▶ │  FLOW RUNS   │',
                 '└──────────────┘     └──────────────┘']:
        if want not in lines:
            got = [l for l in lines if want[0] in l]
            problems.append(f'drawn diagram line lost or re-spaced: {want!r}; arrived as {got!r}')

    headings = xml.count('<text:h ')
    if headings != 6:
        problems.append(f'expected 6 headings, found {headings}')
    for cell in ['Less triage', 'Sovereign', 'Spring', '340']:
        if not re.search(r'<table:table-cell[^>]*>(?:(?!</table:table-cell>).)*' + re.escape(cell), xml, re.S):
            problems.append(f'table cell {cell!r} is not inside a table')
    if '<text:span' not in xml or 'right person' not in xml:
        problems.append('bold text inside a table cell was lost')
    for item in ['A resident applies on the website.', 'First bullet point']:
        if item not in ''.join(texts):
            problems.append(f'list item missing: {item!r}')
    if any(l.lstrip().startswith(('- ', '* ', '1. ')) for l in lines):
        problems.append('a list arrived as "- item" / "1. item" text')
    # Nested lists (2026-11-23): the model writes "1. **Area**" with indented
    # "   - point" lines under it; those points reached the document as body
    # text starting "- ", several joined into one paragraph.
    for item, want in [('Knowledge Access', 1), ('Answers from the lab', 2), ('Shows the bibliography', 2),
                       ('Maker Space', 1), ('Projects, such as', 2), ('A dress with Arduino lights', 3),
                       ('Audio-guided mouse training', 3), ('Room to experiment', 2)]:
        got = list_depth(xml, item)
        if got != want:
            problems.append(f'nested list item {item!r} at list depth {got}, expected {want}')

    # AI text marker (EU AI Act Art. 50(2)): U+2063, 16 bits of 0xB0DA
    # (U+200B = 0, U+2060 = 1), U+2063 must reach the document intact.
    mark = '\u2063' + ''.join('\u2060' if (0xB0DA >> b) & 1 else '\u200b' for b in range(15, -1, -1)) + '\u2063'
    if mark not in xml:
        problems.append('the AI text marker did not reach the document')

    if problems:
        print('PASTE CHECK FAILED:')
        for p in problems:
            print('  - ' + p)
        sys.exit(1)
    print('paste check passed: 2 tables, drawn diagram intact, 6 headings, lists real (nested too), AI marker kept')


if __name__ == '__main__':
    main()
