// MIT License

// Copyright (c) 2022 Aiden Wallis

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// The below code is a modified version of the code found in the
// Kysely-d1 repository. The original published npm package is broken
// and does not work with CloudflareWorkers.

import { SqlDatabase } from '@liquidmetal-ai/raindrop-framework';
import {
  CompiledQuery,
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';

/**
 * Config for the D1 dialect. Pass your D1 instance to this object that you bound in `wrangler.toml`.
 */
export interface D1DialectConfig {
  database: SqlDatabase;
}

/**
 * D1 dialect that adds support for [Cloudflare D1][0] in [Kysely][1].
 * The constructor takes the instance of your D1 database that you bound in `wrangler.toml`.
 *
 * ```typescript
 * new D1Dialect({
 *   database: env.DB,
 * })
 * ```
 *
 * [0]: https://blog.cloudflare.com/introducing-d1/
 * [1]: https://github.com/koskimas/kysely
 */
export class D1Dialect implements Dialect {
  #config: D1DialectConfig;

  constructor(config: D1DialectConfig) {
    this.#config = config;
  }

  createAdapter() {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new D1Driver(this.#config);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

class D1Driver implements Driver {
  #config: D1DialectConfig;

  constructor(config: D1DialectConfig) {
    this.#config = config;
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1Connection(this.#config);
  }

  async beginTransaction(conn: D1Connection): Promise<void> {
    return await conn.beginTransaction();
  }

  async commitTransaction(conn: D1Connection): Promise<void> {
    return await conn.commitTransaction();
  }

  async rollbackTransaction(conn: D1Connection): Promise<void> {
    return await conn.rollbackTransaction();
  }

  async releaseConnection(_conn: D1Connection): Promise<void> {}

  async destroy(): Promise<void> {}
}

class D1Connection implements DatabaseConnection {
  #config: D1DialectConfig;
  //   #transactionClient?: D1Connection

  constructor(config: D1DialectConfig) {
    this.#config = config;
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    // Transactions are not supported yet.
    // if (this.#transactionClient) return this.#transactionClient.executeQuery(compiledQuery)

    const results = await this.#config.database
      .prepare(compiledQuery.sql)
      .bind(...compiledQuery.parameters)
      .all();
    if (results.error) {
      throw new Error(results.error);
    }

    const numAffectedRows = results.meta.changes > 0 ? BigInt(results.meta.changes) : undefined;

    return {
      insertId:
        results.meta.last_row_id === undefined || results.meta.last_row_id === null
          ? undefined
          : BigInt(results.meta.last_row_id),
      rows: (results?.results as O[]) || [],
      numAffectedRows,
    };
  }

  async beginTransaction() {
    // this.#transactionClient = this.#transactionClient ?? new PlanetScaleConnection(this.#config)
    // this.#transactionClient.#conn.execute('BEGIN')
    throw new Error('Transactions are not supported yet.');
  }

  async commitTransaction() {
    // if (!this.#transactionClient) throw new Error('No transaction to commit')
    // this.#transactionClient.#conn.execute('COMMIT')
    // this.#transactionClient = undefined
    throw new Error('Transactions are not supported yet.');
  }

  async rollbackTransaction() {
    // if (!this.#transactionClient) throw new Error('No transaction to rollback')
    // this.#transactionClient.#conn.execute('ROLLBACK')
    // this.#transactionClient = undefined
    throw new Error('Transactions are not supported yet.');
  }

  // eslint-disable-next-line require-yield
  async *streamQuery<O>(_compiledQuery: CompiledQuery, _chunkSize: number): AsyncIterableIterator<QueryResult<O>> {
    throw new Error('D1 Driver does not support streaming');
  }
}
