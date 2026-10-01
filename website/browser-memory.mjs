import ts from 'typescript';

/** Reuse the desktop fact validator verbatim, with unrelated host services
 * removed at build time. Fail on a structural change instead of guessing. */
export function portableMemoryDomain(code, storeImport) {
  const source = ts.createSourceFile('domain.mjs', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = new Map(source.statements.filter(ts.isFunctionDeclaration).map(node => [node.name?.text, node]));
  const helpers = ['text', 'choice', 'refs'].map(name => {
    const node = functions.get(name);
    if (!node) throw new Error(`Missing memory validator: ${name}`);
    return node.getText(source);
  });
  const entity = functions.get('createEntity'), statements = entity?.body?.statements;
  if (!statements || statements.length !== 5 || !ts.isSwitchStatement(statements[3]) || !ts.isReturnStatement(statements[4])) throw new Error('Review changed createEntity before publishing the browser importer');
  const facts = statements[3].caseBlock.clauses.find(node => ts.isCaseClause(node) && node.expression.text === 'facts');
  if (!facts) throw new Error('Missing canonical fact constructor');
  return `import {HttpError,id,now} from ${JSON.stringify(storeImport)};\n${helpers.join('\n')}\nexport function createEntity(store,collection,body,existing){\n${statements.slice(0,3).map(node=>node.getText(source)).join('\n')}\nswitch(collection){${facts.getText(source)}\ndefault:throw new HttpError(405,'Browser memory imports only create facts');}\n${statements[4].getText(source)}\n}`;
}

export function portableMemoryImport(code) {
  const needle = 'Buffer.byteLength(body.content)';
  if (code.split(needle).length !== 2) throw new Error('Review changed memory byte validation before publishing');
  return code.replace(needle, 'new TextEncoder().encode(body.content).byteLength');
}
