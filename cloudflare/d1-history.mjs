import {YEAR} from '../firebase/functions/model.mjs';

/** Server-only archive. Bind GVCN_HISTORY to a migrated D1 database to enable it. */
export function createD1History(db){
  if(!db)return null;
  const statement=(sql,...args)=>db.prepare(sql).bind(...args);
  return {
    async write(classId,snapshots,events){
      const statements=[];
      // JSON expansion inserts many rows with one SQL query (D1 Free has a query
      // budget per Worker invocation). Bound values also prevent SQL injection.
      for(const [table,column,values]of [['gvcn_snapshots','snapshot_key',snapshots],['gvcn_events','event_key',events]]){
        let chunk=[],bytes=0;
        const flush=()=>{
          if(!chunk.length)return;
          statements.push(statement(`INSERT OR IGNORE INTO ${table} (year,class_id,${column},at,payload)
            SELECT ?,?,json_extract(value,'$[0]'),json_extract(value,'$[1].at'),json_extract(value,'$[1]') FROM json_each(?)`,
            YEAR,classId,JSON.stringify(chunk)));
          chunk=[];bytes=0;
        };
        for(const row of Object.entries(values)){
          const size=new TextEncoder().encode(JSON.stringify(row)).length;
          if(bytes+size>256*1024)flush();
          chunk.push(row);bytes+=size;
        }
        flush();
      }
      // Batches are transactional; retrying after interruption is idempotent.
      for(let offset=0;offset<statements.length;offset+=40){
        const result=await db.batch(statements.slice(offset,offset+40));
        if(result.some(row=>!row.success))throw Error('D1 archive write failed; Firebase history retained.');
      }
    },
    async read(classId){
      const [snapshots,events]=await Promise.all([
        statement('SELECT snapshot_key,payload FROM gvcn_snapshots WHERE year=? AND class_id=? ORDER BY at DESC LIMIT 50',YEAR,classId).all(),
        statement('SELECT event_key,payload FROM gvcn_events WHERE year=? AND class_id=? ORDER BY at DESC LIMIT 100',YEAR,classId).all()
      ]);
      if(!snapshots.success||!events.success)throw Error('D1 archive read failed.');
      return {snapshots:Object.fromEntries(snapshots.results.map(row=>[row.snapshot_key,JSON.parse(row.payload)])),
        events:Object.fromEntries(events.results.map(row=>[row.event_key,JSON.parse(row.payload)]))};
    },
    async snapshot(classId,key){
      const row=await statement('SELECT payload FROM gvcn_snapshots WHERE year=? AND class_id=? AND snapshot_key=?',YEAR,classId,key).first();
      return row?JSON.parse(row.payload):null;
    }
  };
}
