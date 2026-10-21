#!/usr/bin/env node
import { inspectCompliance, OperationalError } from './index.js';
export async function run(args: string[], out: (text:string)=>void, err: (text:string)=>void): Promise<number> {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    out('Development foundation only: okf-checker-dev inspect <bundle-directory>\nCompliance core C001–C003 only. Quality/config/link validation are not implemented yet.\n'); return 0;
  }
  if (args.length !== 2 || args[0] !== 'inspect' || !args[1] || args[1].startsWith('-')) {
    err('Usage: okf-checker-dev inspect <bundle-directory>\n'); return 2;
  }
  try {
    const result = await inspectCompliance(args[1]);
    out(JSON.stringify({ foundationSchemaVersion:1, mode:'compliance-foundation', specVersion:'0.2', ...result })+'\n');
    return result.findings.length > 0 ? 1 : 0;
  } catch (error) {
    err(JSON.stringify({error:error instanceof OperationalError ? error.code : 'internal-error', message:error instanceof OperationalError ? error.message : 'Unable to complete inspection safely.'})+'\n'); return 2;
  }
}
// Deliberately thin CLI; engine and renderer contracts can grow independently.
process.exitCode = await run(process.argv.slice(2), text=>process.stdout.write(text), text=>process.stderr.write(text));
