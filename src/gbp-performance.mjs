// Google Performance reads only. Credentials remain in the existing server session.
export const DAILY_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS', 'BUSINESS_BOOKINGS'
];
const day = 86400000;
export function performanceRange(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const part = key => parts.find(p => p.type === key).value;
  const midnight = Date.parse(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  return {rangeStart:new Date(midnight-90*day).toISOString().slice(0,10),rangeEnd:new Date(midnight-day).toISOString().slice(0,10)};
}
export function keywordMonth(value, range) {
  if (!/^\d{4}-\d{2}-01$/.test(value??'') || !Number.isFinite(Date.parse(value+'T00:00:00Z')) || value.slice(0,7)<range.rangeStart.slice(0,7) || value.slice(0,7)>range.rangeEnd.slice(0,7)) throw new Error('INVALID_PERFORMANCE_MONTH');
  return value;
}
function date(value) {
  if (!value || !['year','month','day'].every(k=>Number.isInteger(value[k]))) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
  const iso = `${String(value.year).padStart(4,'0')}-${String(value.month).padStart(2,'0')}-${String(value.day).padStart(2,'0')}`;
  const stamp = Date.parse(iso+'T00:00:00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10)!==iso) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
  return iso;
}
function count(value) {
  if (!(typeof value==='number' || (typeof value==='string' && /^\d+$/.test(value))) || !Number.isSafeInteger(Number(value)) || Number(value)<0) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
  return Number(value);
}
export function summarizeDaily(data, range) {
  const groups=data?.multiDailyMetricTimeSeries, seen=new Set(), dates=new Map();
  if (!Array.isArray(groups) || !groups.length) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
  const summary=Object.fromEntries(DAILY_METRICS.map(metric=>[metric,0]));
  for (const group of groups) {
    if (!Array.isArray(group?.dailyMetricTimeSeries)) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
    for (const series of group.dailyMetricTimeSeries) {
      const metric=series?.dailyMetric, points=series?.timeSeries?.datedValues;
      if (!DAILY_METRICS.includes(metric) || seen.has(metric) || !Array.isArray(points) || (series.dailySubEntityType && Object.keys(series.dailySubEntityType).length)) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
      seen.add(metric);
      for (const point of points) {
        const iso=date(point?.date);
        if (iso<range.rangeStart || iso>range.rangeEnd) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
        if (!dates.has(iso)) dates.set(iso,new Set());
        if (dates.get(iso).has(metric)) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
        dates.get(iso).add(metric);
        // Only an existing dated point with an omitted value means zero.
        summary[metric]+=Object.hasOwn(point,'value')?count(point.value):0;
        if (!Number.isSafeInteger(summary[metric])) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
      }
    }
  }
  if (seen.size!==DAILY_METRICS.length || !dates.size || [...dates.values()].some(metrics=>metrics.size!==DAILY_METRICS.length)) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
  const ordered=[...dates.keys()].sort();
  return {reportingDays:ordered.length,firstReportDate:ordered[0],lastReportDate:ordered.at(-1),summary};
}
export function keywordRows(data) {
  if (!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).some(k=>!['searchKeywordsCounts','nextPageToken'].includes(k)) || (data.nextPageToken!==undefined && (typeof data.nextPageToken!=='string' || data.nextPageToken.length>2048))) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
  const rows=data.searchKeywordsCounts??[];
  if (!Array.isArray(rows) || rows.length>100 || data.searchKeywordsCounts===null) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
  const seen=new Set();
  for (const row of rows) {
    const insight=row?.insightsValue;
    if (typeof row?.searchKeyword!=='string' || !row.searchKeyword.trim() || seen.has(row.searchKeyword) || !insight || Object.hasOwn(insight,'value')===Object.hasOwn(insight,'threshold')) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
    seen.add(row.searchKeyword);
    if (Object.hasOwn(insight,'value')) count(insight.value);
    else if (count(insight.threshold)<1) throw new Error('GOOGLE_INCOMPLETE_PERFORMANCE');
  }
  return rows.length;
}
