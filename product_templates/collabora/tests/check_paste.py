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

    if problems:
        print('PASTE CHECK FAILED:')
        for p in problems:
            print('  - ' + p)
        sys.exit(1)
    print('paste check passed: 2 tables, drawn diagram intact, 6 headings, lists real')


if __name__ == '__main__':
    main()
