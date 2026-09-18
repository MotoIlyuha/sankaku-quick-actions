const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const lines = src.split('\n');
const start = lines.findIndex((l) => l.startsWith('function core('));
let end = -1;
for (let i = start + 1; i < lines.length; i++) if (lines[i] === '}') { end = i; break; }
const core = lines.slice(start, end + 1).join('\n');
new Function('return (' + core + ')')();
const declared = new Set();
for (const m of core.matchAll(/\b(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
for (const m of core.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
  const n = m[1];
  if (declared.has(n)) continue;
  if (/^(if|for|while|switch|catch|return|typeof|new|function|await|do|else|case|delete|void|in|of|yield|throw)$/.test(n)) continue;
  if (n in globalThis) continue;
  console.log('UNKNOWN CALL:', n);
}
console.log('core lines', end - start + 1, 'OK');
