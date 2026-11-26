import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {recordMetric,readMetrics,metricRoute} from '../../../cloudflare/metrics.mjs';
test('API metrics aggregate timing status and count without retaining student identifiers',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../../../cloudflare/migrations/0002_api_metrics.sql',import.meta.url),'utf8'));
  const db={prepare(query){return {bind(...args){const s=sql.prepare(query);return {
    async run(){s.run(...args);return {success:true};},async all(){return {success:true,results:s.all(...args)};}
  };}};}};
  try{
    for(const durationMs of [100,4000])await recordMetric(db,{path:'/api/classes/8C3',method:'PUT',status:200,durationMs});
    await recordMetric(db,{path:'/api/classes/8C4',method:'PUT',status:409,durationMs:40});
    const result=await readMetrics(db),row=result.rows.find(row=>row.status===200);
    assert.equal(row.requests,2);assert.equal(row.average_ms,2050);assert.equal(row.max_ms,4000);assert.equal(row.slow_requests,1);
    assert.equal(row.route,'/api/classes/:id');assert(!JSON.stringify(result).includes('8C3'));
    assert.equal(metricRoute('/api/evidence/8C3/private-photo-id'),'/api/evidence/:id/:id');
  }finally{sql.close();}
});
