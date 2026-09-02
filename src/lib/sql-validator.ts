export interface SqlValidationResult {
  isValid: boolean;
  error?: string;
  statementType?: 'SELECT' | 'WITH' | 'INVALID';
}

const FORBIDDEN_KEYWORDS = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'CALL',
  'COPY',
  'VACUUM',
  'REINDEX',
  'CLUSTER',
  'LOCK',
  'REFRESH',
  'SECURITY',
  'SET',
  'RESET',
  'DISCARD',
  'DO',
  'ANALYZE',
]);

interface SqlLexResult {
  tokens: string[];
  statementCount: number;
  hasCode: boolean;
  error?: string;
}

function isWordStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isWordPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

/**
 * Extracts code tokens while respecting PostgreSQL strings, quoted identifiers,
 * dollar strings, line comments, nested block comments, and separators.
 */
function lexSql(sql: string): SqlLexResult {
  const tokens: string[] = [];
  let statementCount = 0;
  let statementHasCode = false;
  let hasCode = false;

  const finishStatement = () => {
    if (statementHasCode) {
      statementCount++;
      statementHasCode = false;
    }
  };

  for (let i = 0; i < sql.length;) {
    const char = sql[i];
    const next = sql[i + 1];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (char === '-' && next === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    if (char === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      if (depth > 0)
        return {
          tokens,
          statementCount,
          hasCode,
          error: 'Unterminated block comment.',
        };
      continue;
    }

    if (char === "'") {
      statementHasCode = true;
      hasCode = true;
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i++;
          closed = true;
          break;
        } else i++;
      }
      if (!closed)
        return {
          tokens,
          statementCount,
          hasCode,
          error: 'Unterminated string literal.',
        };
      continue;
    }

    if (char === '"') {
      statementHasCode = true;
      hasCode = true;
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') {
          i++;
          closed = true;
          break;
        } else i++;
      }
      if (!closed)
        return {
          tokens,
          statementCount,
          hasCode,
          error: 'Unterminated quoted identifier.',
        };
      continue;
    }

    if (char === '$') {
      const tagMatch = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (tagMatch) {
        statementHasCode = true;
        hasCode = true;
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1)
          return {
            tokens,
            statementCount,
            hasCode,
            error: 'Unterminated dollar-quoted string.',
          };
        i = end + tag.length;
        continue;
      }
    }

    if (char === ';') {
      finishStatement();
      i++;
      continue;
    }

    if (isWordStart(char)) {
      const start = i++;
      while (i < sql.length && isWordPart(sql[i])) i++;
      tokens.push(sql.slice(start, i).toUpperCase());
      statementHasCode = true;
      hasCode = true;
      continue;
    }

    statementHasCode = true;
    hasCode = true;
    i++;
  }

  finishStatement();
  return { tokens, statementCount, hasCode };
}

/** Validates that input is one read-only SELECT or WITH statement. */
export function validateReadOnlySql(rawSql: string): SqlValidationResult {
  if (!rawSql.trim()) {
    return {
      isValid: false,
      error: 'Query cannot be empty.',
      statementType: 'INVALID',
    };
  }

  const lexed = lexSql(rawSql);
  if (lexed.error)
    return { isValid: false, error: lexed.error, statementType: 'INVALID' };
  if (!lexed.hasCode) {
    return {
      isValid: false,
      error: 'Query contains only comments.',
      statementType: 'INVALID',
    };
  }
  if (lexed.statementCount !== 1) {
    return {
      isValid: false,
      error:
        'Multiple statements are not permitted. Please execute one query at a time.',
      statementType: 'INVALID',
    };
  }

  const leadingKeyword = lexed.tokens[0];
  if (leadingKeyword !== 'SELECT' && leadingKeyword !== 'WITH') {
    return {
      isValid: false,
      error: `Only read-only SELECT / WITH queries are allowed in the workbench (received "${leadingKeyword || 'UNKNOWN'}"). Index mutations must use the structured index tools.`,
      statementType: 'INVALID',
    };
  }

  const forbidden = lexed.tokens.find((token) => FORBIDDEN_KEYWORDS.has(token));
  if (forbidden) {
    return {
      isValid: false,
      error: `Potentially mutating or unsafe keyword "${forbidden}" detected. The workbench strictly sandboxes read-only queries.`,
      statementType: 'INVALID',
    };
  }

  return { isValid: true, statementType: leadingKeyword };
}
