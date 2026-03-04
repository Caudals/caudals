const fs = require('fs');
const path = require('path');

const walk = (dir, done) => {
  let results = [];
  fs.readdir(dir, (err, list) => {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(file => {
      file = path.resolve(dir, file);
      fs.stat(file, (err, stat) => {
        if (stat && stat.isDirectory()) {
          walk(file, (err, res) => {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
          }
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

const dirs = [
  'app/(app)/admin',
  'app/(app)/contributor',
  'app/(app)/requester',
  'components/admin',
  'components/browse',
  'components/contributor',
  'components/requester'
];

dirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) return;
  walk(fullPath, (err, files) => {
    if (err) throw err;
    files.forEach(file => {
      let content = fs.readFileSync(file, 'utf8');
      let originalContent = content;

      // Table cleanups
      content = content.replace(/<TableRow className="bg-muted\/40">/g, '<TableRow>');
      content = content.replace(/className="hover:bg-muted\/30"/g, '');
      content = content.replace(/className="align-top hover:bg-muted\/30"/g, 'className="align-top"');
      content = content.replace(/className="([^"]*)hover:bg-muted\/30([^"]*)"/g, (match, p1, p2) => {
        let newClasses = `${p1}${p2}`.replace(/\s+/g, ' ').trim();
        return newClasses ? `className="${newClasses}"` : '';
      });
      content = content.replace(/className={"([^"]*)hover:bg-muted\/30([^"]*)"}/g, (match, p1, p2) => {
        let newClasses = `${p1}${p2}`.replace(/\s+/g, ' ').trim();
        return newClasses ? `className="${newClasses}"` : '';
      });

      // Stat cards: Remove bg-muted/* and ensure pure white or default background with soft border
      content = content.replace(/bg-muted\/\d+/g, '');
      content = content.replace(/border-border\/70/g, 'border-border');
      
      // Additional cleanups for empty classNames
      content = content.replace(/ className=""/g, '');
      content = content.replace(/ className=" "/g, '');
      content = content.replace(/ className={""}/g, '');
      
      if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
      }
    });
  });
});
