const tn = require('@tailwindcss/node');
const fs = require('fs');
const path = require('path');

async function compileCss() {
  const compiler = await tn.compile('@import "tailwindcss";', {
    base: __dirname,
    onDependency: () => {},
  });

  // Recursively find all files in app and components
  function getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getFiles(fullPath));
      } else if (/\.(tsx|ts|js|jsx)$/.test(file)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const files = [...getFiles(path.join(__dirname, 'app')), ...getFiles(path.join(__dirname, 'components'))];
  const candidates = new Set();
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const matches = content.match(/[\w\-/:[\]#%.'"]+/g) || [];
    matches.forEach(m => candidates.add(m.replace(/['"]/g, '')));
  }

  const css = compiler.build([...candidates]);
  console.log('CSS built successfully! Length:', css.length);
  fs.writeFileSync(path.join(__dirname, 'app', 'tailwind.css'), css);
}

compileCss().catch(console.error);

