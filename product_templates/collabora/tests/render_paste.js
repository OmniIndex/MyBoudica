// Renders a markdown file exactly as the widget pastes it into a document:
// renderMarkdown(text, true) from boudica_widget.js (the shipping copy).
//   node render_paste.js <boudica_widget.js> <in.md> <out.md>
const fs = require('fs');
const [widget, input, output] = process.argv.slice(2);
const src = fs.readFileSync(widget, 'utf8');
const start = src.search(/\n\s*function renderMarkdown\(/);
const end = src.indexOf('}  //end renderMarkdown', start);
if (start < 0 || end < 0) {
    console.error('renderMarkdown not found in ' + widget + ' (was it renamed?)');
    process.exit(2);
}
eval(src.slice(start, end + 1));
if (renderMarkdown.length < 1) process.exit(2);
// pasteMarkdown() adds the AI text marker (EU AI Act Art. 50(2), 2026-11-20)
// to everything it pastes into a text document: apply it here too, so the
// check sees the real paste and proves the marker survives the import.
const mStart = src.search(/\n\s*const AI_TEXT_MARK = /);
const mEnd = src.indexOf('}  //end aiMarkMarkdown', mStart);
if (mStart < 0 || mEnd < 0) {
    console.error('aiMarkMarkdown not found in ' + widget + ' (was it renamed?)');
    process.exit(2);
}
eval(src.slice(mStart, mEnd + 1).replace('const AI_TEXT_MARK', 'var AI_TEXT_MARK'));
fs.writeFileSync(output, aiMarkMarkdown(renderMarkdown(fs.readFileSync(input, 'utf8'), true)));
