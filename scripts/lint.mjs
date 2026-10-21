import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';
let failed = false;
for (const file of (await readdir('src')).filter(f => f.endsWith('.ts'))) {
 const text = await readFile(`src/${file}`, 'utf8');
 const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
 const visit = node => {
  if (node.kind === ts.SyntaxKind.AnyKeyword || (ts.isCallExpression(node) && node.expression.getText(ast) === 'eval')) {
   console.error(`${file}: unsafe any/eval syntax`); failed=true;
  }
  ts.forEachChild(node, visit);
 };
 visit(ast);
 if (/[ \t]+$/m.test(text)) { console.error(`${file}: trailing whitespace`); failed=true; }
}
if(failed) process.exitCode=1;
