// ─── Utilitários JSON 100% client-side ───────────────────────────
// Validação sintática com relatório detalhado (linha/coluna aproximada),
// formatação com indentação configurável e minificação.

export interface JsonErrorReport {
  message: string;
  position: number; // offset em caracteres (0-based)
  line: number; // 1-based
  column: number; // 1-based
  snippet: string;
}

export type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: JsonErrorReport };

function isWhitespaceChar(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isDigitChar(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

function computeLineColumn(source: string, position: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const end = Math.min(position, source.length);
  for (let i = 0; i < end; i++) {
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function buildSnippet(source: string, position: number): string {
  const length = source.length;
  const pos = Math.min(position, length);
  const start = Math.max(0, pos - 40);
  const end = Math.min(length, pos + 40);
  let window = source.slice(start, end).replace(/[ \t\r\n]+/g, ' ');
  if (start > 0) window = `…${window}`;
  if (end < length) window = `${window}…`;
  return window;
}

function createReport(source: string, position: number, message: string): JsonErrorReport {
  const { line, column } = computeLineColumn(source, position);
  return { message, position, line, column, snippet: buildSnippet(source, position) };
}

class JsonValidationStop extends Error {
  readonly report: JsonErrorReport;

  constructor(report: JsonErrorReport) {
    super(report.message);
    this.name = 'JsonValidationStop';
    this.report = report;
  }
}

/**
 * Validador sintático recursivo-descendente de JSON. Não constrói árvore
 * de valores: apenas percorre a gramática para localizar erros com precisão
 * (vírgulas finais, chaves de objeto inválidas, escapes quebrados etc.).
 */
class JsonValidator {
  private pos = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  private get length(): number {
    return this.source.length;
  }

  private fail(position: number, message: string): never {
    throw new JsonValidationStop(createReport(this.source, position, message));
  }

  private skipWhitespace(): void {
    while (this.pos < this.length && isWhitespaceChar(this.source[this.pos])) {
      this.pos++;
    }
  }

  validateDocument(): void {
    this.skipWhitespace();

    if (this.pos >= this.length) {
      this.fail(this.pos, 'Texto vazio: não há nenhum JSON para analisar.');
    }

    this.parseValue();

    this.skipWhitespace();
    if (this.pos < this.length) {
      const rest = this.source.slice(this.pos, this.pos + 20);
      this.fail(this.pos, `Conteúdo inesperado após o fim do JSON ("${rest}").`);
    }
  }

  private parseValue(): void {
    this.skipWhitespace();

    if (this.pos >= this.length) {
      this.fail(this.pos, 'JSON interrompido: um valor era esperado antes do fim do texto.');
    }

    const char = this.source[this.pos];

    switch (char) {
      case '{':
        this.parseObject();
        return;
      case '[':
        this.parseArray();
        return;
      case '"':
        this.parseString();
        return;
      case 't':
      case 'f':
      case 'n':
        this.parseKeyword();
        return;
      case '-':
        this.parseNumber();
        return;
      default:
        if (isDigitChar(char)) {
          this.parseNumber();
          return;
        }
        this.fail(
          this.pos,
          `Caractere inesperado "${char}". Esperava-se um valor JSON válido (objeto, array, string, número, true, false ou null).`,
        );
    }
  }

  private parseKeyword(): void {
    const start = this.pos;
    while (this.pos < this.length && /[A-Za-z]/.test(this.source[this.pos])) {
      this.pos++;
    }
    const word = this.source.slice(start, this.pos);
    if (word === 'true' || word === 'false' || word === 'null') return;
    this.fail(start, `Literal "${word}" inválido. Em JSON os literais são true, false ou null (minúsculas).`);
  }

  private parseNumber(): void {
    const start = this.pos;

    if (this.source[this.pos] === '-') {
      this.pos++;
      if (this.pos >= this.length || !isDigitChar(this.source[this.pos])) {
        this.fail(start, 'Número inválido: esperava-se um dígito após o sinal de menos ("-").');
      }
    }

    if (this.source[this.pos] === '0') {
      this.pos++;
      if (isDigitChar(this.source[this.pos])) {
        this.fail(this.pos, 'Número inválido: zeros à esquerda não são permitidos em JSON.');
      }
    } else if (isDigitChar(this.source[this.pos])) {
      while (this.pos < this.length && isDigitChar(this.source[this.pos])) {
        this.pos++;
      }
    } else {
      this.fail(start, 'Número inválido: esperava-se ao menos um dígito.');
    }

    if (this.source[this.pos] === '.') {
      this.pos++;
      if (!isDigitChar(this.source[this.pos])) {
        this.fail(this.pos, 'Número inválido: esperava-se um dígito após o ponto decimal.');
      }
      while (this.pos < this.length && isDigitChar(this.source[this.pos])) {
        this.pos++;
      }
    }

    if (this.source[this.pos] === 'e' || this.source[this.pos] === 'E') {
      this.pos++;
      if (this.source[this.pos] === '+' || this.source[this.pos] === '-') {
        this.pos++;
      }
      if (!isDigitChar(this.source[this.pos])) {
        this.fail(this.pos, 'Número inválido: esperava-se um dígito no expoente.');
      }
      while (this.pos < this.length && isDigitChar(this.source[this.pos])) {
        this.pos++;
      }
    }
  }

  private parseString(): void {
    const stringStart = this.pos;
    this.pos++; // consome a aspa de abertura

    for (;;) {
      if (this.pos >= this.length) {
        this.fail(stringStart, 'String não terminada: faltou a aspa de fechamento (").');
      }

      const char = this.source[this.pos];

      if (char === '"') {
        this.pos++;
        return;
      }

      if (char === '\\') {
        const escapeStart = this.pos;
        this.pos++;
        if (this.pos >= this.length) {
          this.fail(escapeStart, 'String não terminada: faltou a aspa de fechamento (").');
        }

        const escaped = this.source[this.pos];

        if (escaped === 'u') {
          this.pos++;
          const hex = this.source.slice(this.pos, this.pos + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            this.fail(escapeStart, 'Escape inválido "\\u": são necessários exatamente 4 dígitos hexadecimais.');
          }
          this.pos += 4;
          continue;
        }

        if (escaped === '"' || escaped === '\\' || escaped === '/' || escaped === 'b' || escaped === 'f' || escaped === 'n' || escaped === 'r' || escaped === 't') {
          this.pos++;
          continue;
        }

        this.fail(escapeStart, `Sequência de escape inválida "\\${escaped}".`);
      }

      if (char.charCodeAt(0) < 0x20) {
        this.fail(this.pos, 'Caractere de controle não é permitido dentro de string JSON. Use escapes como \\n ou \\t.');
      }

      this.pos++;
    }
  }

  private parseObject(): void {
    this.pos++; // consome "{"

    this.skipWhitespace();
    if (this.source[this.pos] === '}') {
      this.pos++;
      return;
    }

    for (;;) {
      this.skipWhitespace();

      if (this.source[this.pos] !== '"') {
        this.fail(this.pos, 'Erro no objeto: toda chave deve ser uma string entre aspas duplas (" ").');
      }
      this.parseString();

      this.skipWhitespace();
      if (this.source[this.pos] !== ':') {
        this.fail(this.pos, 'Erro no objeto: esperava-se ":" após a chave.');
      }
      this.pos++;

      this.parseValue();

      this.skipWhitespace();

      if (this.source[this.pos] === ',') {
        this.pos++;
        this.skipWhitespace();
        if (this.source[this.pos] === '}') {
          this.fail(this.pos, 'Vírgula final (trailing comma) não é permitida em JSON.');
        }
        continue;
      }

      if (this.source[this.pos] === '}') {
        this.pos++;
        return;
      }

      this.fail(this.pos, 'Erro no objeto: esperava-se "," ou "}" após o valor.');
    }
  }

  private parseArray(): void {
    this.pos++; // consome "["

    this.skipWhitespace();
    if (this.source[this.pos] === ']') {
      this.pos++;
      return;
    }

    for (;;) {
      this.parseValue();

      this.skipWhitespace();

      if (this.source[this.pos] === ',') {
        this.pos++;
        this.skipWhitespace();
        if (this.source[this.pos] === ']') {
          this.fail(this.pos, 'Vírgula final (trailing comma) não é permitida em JSON.');
        }
        continue;
      }

      if (this.source[this.pos] === ']') {
        this.pos++;
        return;
      }

      this.fail(this.pos, 'Erro no array: esperava-se "," ou "]" após o valor.');
    }
  }
}

/**
 * Valida a sintaxe JSON e retorna um relatório detalhado. Em caso de
 * sucesso, `value` contém o valor já interpretado por JSON.parse.
 */
export function validateJson(source: string): JsonParseResult {
  try {
    new JsonValidator(source).validateDocument();
    return { ok: true, value: JSON.parse(source) };
  } catch (error) {
    if (error instanceof JsonValidationStop) {
      return { ok: false, error: error.report };
    }
    throw error;
  }
}

/** Erro sintático carregado com o relatório detalhado (linha/coluna). */
export class JsonSyntaxError extends Error {
  readonly report: JsonErrorReport;

  constructor(report: JsonErrorReport) {
    super(report.message);
    this.name = 'JsonSyntaxError';
    this.report = report;
  }
}

function assertValid(source: string): void {
  const result = validateJson(source);
  if (!result.ok) {
    throw new JsonSyntaxError(result.error);
  }
}

/** Formata com indentação de 2 ou 4 espaços. Lança JsonSyntaxError se inválido. */
export function formatJson(source: string, indent: 2 | 4 = 2): string {
  assertValid(source);
  return JSON.stringify(JSON.parse(source), null, indent);
}

/** Remove toda a formatação (minificado). Lança JsonSyntaxError se inválido. */
export function minifyJson(source: string): string {
  assertValid(source);
  return JSON.stringify(JSON.parse(source));
}
