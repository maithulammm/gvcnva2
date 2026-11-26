import {YEAR} from '../firebase/functions/model.mjs';

/** Cache only change notifications, never authorization or student data.
 * Writes/conflict checks always use Firebase's current transaction values.
 */
export function createRevisionCache(db,{clock=()=>Date.now(),ttlMs=60000}={}){
  if(!db)return null;
  return {
    async read(ids){
      if(!ids.length)return {};
      const placeholders=ids.map(()=>'?').join(',');
      const result=await db.prepare(`SELECT class_id,revision FROM gvcn_revision_cache
        WHERE year=? AND class_id IN (${placeholders}) AND observed_at>=?`)
        .bind(YEAR,...ids,clock()-ttlMs).all();
      if(!result.success)throw Error('Revision cache unavailable');
      return Object.fromEntries(result.results.map(row=>[row.class_id,row.revision]));
    },
    async write(entries,observedAt=clock()){
      if(!entries.length)return;
      const result=await db.prepare(`INSERT INTO gvcn_revision_cache (year,class_id,revision,observed_at)
        SELECT ?,json_extract(value,'$[0]'),json_extract(value,'$[1]'),? FROM json_each(?) WHERE 1
        ON CONFLICT(year,class_id) DO UPDATE SET revision=excluded.revision,observed_at=excluded.observed_at
        WHERE excluded.observed_at>=gvcn_revision_cache.observed_at AND excluded.revision>=gvcn_revision_cache.revision`)
        .bind(YEAR,observedAt,JSON.stringify(entries)).run();
      if(!result.success)throw Error('Revision cache write failed');
    },
    now:clock
  };
}
