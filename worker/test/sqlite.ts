import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

/** Real SQL execution with D1's transaction-shaped API. No production fixtures. */
export function testDatabase() {
  const sqlite=new DatabaseSync(":memory:");
  for(const file of ["0001_platform.sql","0002_phase2_integrity.sql","0003_operations.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),"utf8"));
  class Statement {
    constructor(readonly sql:string,readonly args:unknown[]=[]){}
    bind(...args:unknown[]){return new Statement(this.sql,args);}
    async first(column?:string){const result=sqlite.prepare(this.sql).get(...this.args as never[])??null;return column&&result?result[column]:result;}
    async all(){return {success:true,results:sqlite.prepare(this.sql).all(...this.args as never[]),meta:{}};}
    async run(){const result=sqlite.prepare(this.sql).run(...this.args as never[]);return {success:true,results:[],meta:{changes:Number(result.changes)}};}
  }
  const db={
    prepare:(sql:string)=>new Statement(sql),
    batch:async(statements:Statement[])=>{sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error;}},
  } as unknown as D1Database;
  return {db,sqlite,close:()=>sqlite.close()};
}
