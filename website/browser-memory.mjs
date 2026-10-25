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
  const dispatchIndex=statements?.findIndex(ts.isSwitchStatement)??-1;
  // Agent-only host initialization cannot run for browser fact imports. Keep
  // rejecting any new shared or fact-related pre-dispatch statements.
  const agentOnly=statement=>ts.isIfStatement(statement)&&!statement.elseStatement&&ts.isBinaryExpression(statement.expression)&&statement.expression.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&ts.isIdentifier(statement.expression.left)&&statement.expression.left.text==='collection'&&ts.isStringLiteral(statement.expression.right)&&statement.expression.right.text==='agents';
  if (!statements || dispatchIndex<3 || statements.length!==dispatchIndex+2 || !statements.slice(3,dispatchIndex).every(agentOnly) || !ts.isReturnStatement(statements[dispatchIndex+1])) throw new Error('Review changed createEntity before publishing the browser importer');
  const facts = statements[dispatchIndex].caseBlock.clauses.find(node => ts.isCaseClause(node) && node.expression.text === 'facts');
  if (!facts) throw new Error('Missing canonical fact constructor');
  return `import {HttpError,id,now} from ${JSON.stringify(storeImport)};\n${helpers.join('\n')}\nexport function createEntity(store,collection,body,existing){\n${statements.slice(0,3).map(node=>node.getText(source)).join('\n')}\nswitch(collection){${facts.getText(source)}\ndefault:throw new HttpError(405,'Browser memory imports only create facts');}\n${statements[dispatchIndex+1].getText(source)}\n}`;
}

export function portableMemoryImport(code) {
  const needle = 'Buffer.byteLength(body.content)';
  if (code.split(needle).length !== 2) throw new Error('Review changed memory byte validation before publishing');
  return code.replace(needle, 'new TextEncoder().encode(body.content).byteLength');
}
