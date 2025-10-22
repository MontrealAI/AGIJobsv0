declare module 'better-sqlite3' {
  interface DatabaseOptions {
    readonly readonly?: boolean;
  }
  interface Statement<T = unknown> {
    all(...params: unknown[]): T[];
  }
  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    prepare<T = unknown>(sql: string): Statement<T>;
    close(): void;
  }
  export default Database;
}
