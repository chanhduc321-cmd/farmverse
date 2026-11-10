import { readFile, writeFile } from 'node:fs/promises';

const dashboards = [
  {
    name: 'TASKS',
    rows: /^\|\s*T-\d+\s*\|/,
    fields: ['id', 'phase', 'target', 'title', 'owner', 'scope', 'branch', 'status', 'dependsOn', 'acceptance'],
    statuses: ['TODO', 'DOING', 'BLOCKED', 'REVIEW', 'DONE'],
  },
  {
    name: 'BUGS',
    rows: /^\|\s*BUG-\d+\s*\|/,
    fields: ['id', 'phase', 'title', 'owner', 'severity', 'status', 'foundIn', 'repro', 'actual', 'expected'],
    statuses: ['OPEN', 'DOING', 'BLOCKED', 'REVIEW', 'FIXED'],
  },
];
const severities = ['LOW', 'MEDIUM', 'HIGH'];
const dataBlock = /(<script id="(?:task|bug)-data" type="application\/json">)\s*[\s\S]*?(<\/script>)/;
const checkOnly = process.argv.includes('--check');

for (const { name, rows, fields, statuses } of dashboards) {
  const sourcePath = new URL(`../${name}.md`, import.meta.url);
  const dashboardPath = new URL(`../${name}.html`, import.meta.url);
  const [source, dashboard] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile(dashboardPath, 'utf8'),
  ]);
  const ids = new Set();
  const records = source.split(/\r?\n/).filter((line) => rows.test(line)).map((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('`', ''));
    if (cells.length !== fields.length || cells.some((cell) => !cell)) {
      throw new Error(`${name}.md needs ${fields.length} populated columns: ${line}`);
    }

    const record = Object.fromEntries(fields.map((field, index) => [field, cells[index]]));
    if (ids.has(record.id) || !/^P[0-5]$/.test(record.phase) || !statuses.includes(record.status)
        || (record.severity && !severities.includes(record.severity))) {
      throw new Error(`Invalid or duplicate row in ${name}.md: ${line}`);
    }

    ids.add(record.id);
    return record;
  });

  if (!dataBlock.test(dashboard) || (name === 'TASKS' && !records.length)) {
    throw new Error(`Missing rows or dashboard data block for ${name}.`);
  }

  const newline = dashboard.includes('\r\n') ? '\r\n' : '\n';
  const serialized = JSON.stringify(records, null, 2).replaceAll('<', '\\u003c').replaceAll('\n', newline);
  const updated = dashboard.replace(dataBlock, (_, start, end) => [start, serialized, end].join(newline));

  if (updated !== dashboard) {
    if (checkOnly) throw new Error(`${name}.html is out of date. Run node tools/build-task-dashboard.mjs.`);
    await writeFile(dashboardPath, updated, 'utf8');
  }

  console.log(`${name}.html matches ${name}.md (${records.length} entries).`);
}
