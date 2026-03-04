import fs from 'fs';
import path from 'path';

function walkDir(dir: string, fileList: string[] = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      walkDir(filePath, fileList);
    } else if (filePath.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = [
  ...walkDir(path.join(process.cwd(), 'app/(app)/requester')),
  ...walkDir(path.join(process.cwd(), 'components/requester'))
];

const cardClass = 'bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0';
const tableHeaderClass = 'text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent';

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let changed = false;

  // Replace plain <Card>
  if (content.match(/<Card>/)) {
    content = content.replace(/<Card>/g, `<Card className="${cardClass}">`);
    changed = true;
  }

  // Replace <Card className="...">
  const cardRegex = /<Card\s+className="([^"]+)"/g;
  if (content.match(cardRegex)) {
    content = content.replace(cardRegex, (match, p1) => {
      let newClasses = p1
        .replace(/\bborder-border\b/g, '')
        .replace(/\bshadow-none\b/g, '')
        .replace(/\bborder\b/g, '')
        .replace(/\bbg-card\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      const combined = `${cardClass} ${newClasses}`.trim();
      return `<Card className="${combined}"`;
    });
    changed = true;
  }

  if (content.match(/<TableHead>/)) {
    content = content.replace(/<TableHead>/g, `<TableHead className="${tableHeaderClass}">`);
    changed = true;
  }

  const tableHeadRegex = /<TableHead\s+className="([^"]+)"/g;
  if (content.match(tableHeadRegex)) {
    content = content.replace(tableHeadRegex, (match, p1) => {
      return `<TableHead className="${tableHeaderClass} ${p1}"`;
    });
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Updated ${file}`);
  }
}
