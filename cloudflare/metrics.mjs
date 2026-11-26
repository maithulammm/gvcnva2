/** Aggregate only: never log tokens, email, student content, URL queries or IDs. */
export function metricRoute(path){
  const parts=path.split('?')[0].split('/').filter(Boolean).slice(0,8);
  const known=new Set(['api','health','bootstrap','classes','changes','calendar','supabase','status','metrics','evidence','admin','upload','cleanup','teachers','users','directory','import','transition','recovery','oauth','callback','connect']);
  return '/'+parts.map(part=>known.has(part)?part:':id').join('/');
}
export async function recordMetric(db,{path,method,status,durationMs,at=Date.now()}){
  if(!db)return;
  await db.prepare(`INSERT INTO gvcn_api_metrics (bucket,route,method,status,requests,total_ms,max_ms,slow_requests)
    VALUES (?,?,?,?,1,?,?,?) ON CONFLICT(bucket,route,method,status) DO UPDATE SET
    requests=requests+1,total_ms=total_ms+excluded.total_ms,max_ms=MAX(max_ms,excluded.max_ms),slow_requests=slow_requests+excluded.slow_requests`)
    .bind(new Date(at).toISOString().slice(0,13),metricRoute(path),method,status,durationMs,durationMs,durationMs>=3000?1:0).run();
}
export async function readMetrics(db){
  if(!db)return {enabled:false,rows:[]};
  const since=new Date(Date.now()-86400000).toISOString().slice(0,13);
  const result=await db.prepare(`SELECT route,method,status,SUM(requests) AS requests,
    ROUND(SUM(total_ms)*1.0/SUM(requests),1) AS average_ms,MAX(max_ms) AS max_ms,SUM(slow_requests) AS slow_requests
    FROM gvcn_api_metrics WHERE bucket>=? GROUP BY route,method,status ORDER BY requests DESC LIMIT 100`).bind(since).all();
  if(!result.success)throw Error('Không đọc được thống kê API.');
  return {enabled:true,periodHours:24,rows:result.results};
}
