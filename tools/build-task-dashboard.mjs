import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../TASKS.md', import.meta.url);
const dashboardPath = new URL('../TASKS.html', import.meta.url);
const fields = ['id', 'phase', 'title', 'owner', 'scope', 'branch', 'status', 'dependsOn', 'acceptance'];
const statuses = new Set(['TODO', 'DOING', 'BLOCKED', 'REVIEW', 'DONE']);
const dataBlock = /(<script id="task-data" type="application\/json">)\s*[\s\S]*?(<\/script>)/;

const [source, dashboard] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readFile(dashboardPath, 'utf8'),
]);

const ids = new Set();
const tasks = source.split(/\r?\n/).filter((line) => /^\|\s*T-\d+\s*\|/.test(line)).map((line) => {
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('`', ''));
  if (cells.length !== fields.length || cells.some((cell) => !cell)) {
    throw new Error(`Expected ${fields.length} populated task columns: ${line}`);
  }

  const task = Object.fromEntries(fields.map((field, index) => [field, cells[index]]));
  if (ids.has(task.id) || !/^P[0-5]$/.test(task.phase) || !statuses.has(task.status)) {
    throw new Error(`Invalid or duplicate task: ${line}`);
  }

  ids.add(task.id);
  return task;
});

if (!tasks.length || !dataBlock.test(dashboard)) {
  throw new Error('Missing task rows in TASKS.md or task-data block in TASKS.html.');
}

const newline = dashboard.includes('\r\n') ? '\r\n' : '\n';
const serialized = JSON.stringify(tasks, null, 2).replaceAll('<', '\\u003c').replaceAll('\n', newline);
const updated = dashboard.replace(dataBlock, (_, start, end) => [start, serialized, end].join(newline));

if (process.argv.includes('--check')) {
  if (updated !== dashboard) {
    throw new Error('TASKS.html is out of date. Run node tools/build-task-dashboard.mjs.');
  }
} else if (updated !== dashboard) {
  await writeFile(dashboardPath, updated, 'utf8');
}

console.log(`Dashboard matches TASKS.md (${tasks.length} tasks).`);
