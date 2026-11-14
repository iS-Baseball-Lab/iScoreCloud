// filepath: src/api/teams/stats.ts
import { Hono } from 'hono'
import { classifyAtBatResultToken } from '@/lib/liff/baseball-official-rules'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

interface RawTeamBatterRow {
  batterId: string;
  playerName: string | null;
  result: string | null;
}

interface RawTeamPitcherRow {
  atBatId: string;
  pitcherId: string;
  playerName: string | null;
  result: string | null;
}

interface RawTeamRunnerOutRow {
  atBatId: string;
  fromBase: number;
  isOut: number | boolean;
  reason: string | null;
}

app.get('/:id/stats', async (c) => {
  const teamId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT ab.batter_id as batterId, p.name as playerName, ab.result as result
      FROM at_bats ab
      JOIN matches m ON ab.match_id = m.id
      LEFT JOIN players p ON ab.batter_id = p.id
      WHERE m.team_id = ? AND m.status = 'finished' AND ab.batter_id IS NOT NULL
    `).bind(teamId).all<RawTeamBatterRow>();

    const map = new Map<
      string,
      {
        playerName: string | null;
        plateAppearances: number;
        atBats: number;
        hits: number;
        singles: number;
        doubles: number;
        triples: number;
        homeRuns: number;
        walks: number;
        strikeouts: number;
      }
    >();

    for (const row of results || []) {
      const cls = classifyAtBatResultToken(row.result, null);
      if (cls.isUnfinishedRunnerOut) continue;
      let acc = map.get(row.batterId);
      if (!acc) {
        acc = {
          playerName: row.playerName,
          plateAppearances: 0,
          atBats: 0,
          hits: 0,
          singles: 0,
          doubles: 0,
          triples: 0,
          homeRuns: 0,
          walks: 0,
          strikeouts: 0,
        };
        map.set(row.batterId, acc);
      }
      acc.plateAppearances += 1;
      if (cls.isOfficialAtBat) acc.atBats += 1;
      if (cls.isHit) acc.hits += 1;
      if (cls.isSingle) acc.singles += 1;
      if (cls.isDouble) acc.doubles += 1;
      if (cls.isTriple) acc.triples += 1;
      if (cls.isHomeRun) acc.homeRuns += 1;
      if (cls.isWalk) acc.walks += 1;
      if (cls.isStrikeout) acc.strikeouts += 1;
    }

    const sorted = Array.from(map.values()).sort(
      (a, b) => b.hits - a.hits || b.plateAppearances - a.plateAppearances
    );
    return c.json(sorted);
  } catch {
    return c.json({ error: '成績の取得に失敗しました' }, 500);
  }
});

app.get('/:id/pitcher-stats', async (c) => {
  const teamId = c.req.param('id');
  try {
    const [{ results: abRows }, { results: advRows }] = await Promise.all([
      c.env.DB.prepare(`
        SELECT ab.id as atBatId, ab.pitcher_id as pitcherId, p.name as playerName, ab.result as result
        FROM at_bats ab
        JOIN matches m ON ab.match_id = m.id
        LEFT JOIN players p ON ab.pitcher_id = p.id
        WHERE m.team_id = ? AND m.status = 'finished' AND ab.pitcher_id IS NOT NULL
      `).bind(teamId).all<RawTeamPitcherRow>(),
      c.env.DB.prepare(`
        SELECT ba.at_bat_id as atBatId, ba.from_base as fromBase, ba.is_out as isOut, ba.reason as reason
        FROM base_advances ba
        JOIN matches m ON ba.match_id = m.id
        WHERE m.team_id = ? AND m.status = 'finished' AND ba.is_out = 1
      `).bind(teamId).all<RawTeamRunnerOutRow>(),
    ]);

    const runnerOutsByAbId = new Map<string, RawTeamRunnerOutRow[]>();
    for (const r of advRows || []) {
      const list = runnerOutsByAbId.get(r.atBatId) || [];
      list.push(r);
      runnerOutsByAbId.set(r.atBatId, list);
    }

    const map = new Map<
      string,
      {
        playerName: string | null;
        battersFaced: number;
        strikeouts: number;
        walks: number;
        hitsAllowed: number;
        outs: number;
      }
    >();

    for (const row of abRows || []) {
      const cls = classifyAtBatResultToken(row.result, null);
      let acc = map.get(row.pitcherId);
      if (!acc) {
        acc = {
          playerName: row.playerName,
          battersFaced: 0,
          strikeouts: 0,
          walks: 0,
          hitsAllowed: 0,
          outs: 0,
        };
        map.set(row.pitcherId, acc);
      }
      if (!cls.isUnfinishedRunnerOut) {
        acc.battersFaced += 1;
      }
      if (cls.isStrikeout) acc.strikeouts += 1;
      if (cls.isWalk) acc.walks += 1;
      if (cls.isHit) acc.hitsAllowed += 1;

      const rOuts = runnerOutsByAbId.get(row.atBatId) || [];
      if (cls.isUnfinishedRunnerOut) {
        acc.outs += rOuts.length;
      } else if (cls.isDoublePlay || cls.isTriplePlay) {
        acc.outs += cls.intrinsicBatterOuts;
      } else if (cls.intrinsicBatterOuts > 0) {
        const extraNonForce = rOuts.filter((ro) => {
          const rs = String(ro.reason || '');
          return ro.fromBase > 0 && rs !== 'fc' && !rs.includes('封');
        }).length;
        acc.outs += cls.intrinsicBatterOuts + extraNonForce;
      } else {
        acc.outs += rOuts.length;
      }
    }

    const sorted = Array.from(map.values()).sort(
      (a, b) => b.outs - a.outs || b.strikeouts - a.strikeouts
    );
    return c.json(sorted);
  } catch {
    return c.json({ error: '成績の取得に失敗しました' }, 500);
  }
});

app.get('/:id/spray-chart', async (c) => {
  const teamId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT p.zone_x as zoneX, p.zone_y as zoneY, p.result, pl.name as batterName
      FROM pitches p 
      JOIN at_bats ab ON p.at_bat_id = ab.id 
      JOIN matches m ON ab.match_id = m.id
      LEFT JOIN players pl ON ab.batter_id = pl.id
      WHERE m.team_id = ? AND m.status = 'finished' AND p.zone_x IS NOT NULL AND p.zone_y IS NOT NULL AND ab.batter_id IS NOT NULL
    `).bind(teamId).all();
    return c.json(results);
  } catch (e) { return c.json({ error: 'データの取得に失敗しました' }, 500); }
});

// 最近の試合結果（3件）を取得するAPI
app.get('/:id/recent-matches', async (c) => {
  const teamId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, date, opponent, my_score as myScore, opponent_score as opponentScore, match_type as matchType, status
      FROM matches 
      WHERE team_id = ? AND status = 'finished'
      ORDER BY date DESC, created_at DESC
      LIMIT 3
    `).bind(teamId).all();

    return c.json(results);
  } catch (e) {
    return c.json({ error: '試合結果の取得に失敗しました' }, 500);
  }
});

// チームの全試合結果を取得するAPI（勝率計算用）
app.get('/:id/all-matches', async (c) => {
  const teamId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, date, opponent, my_score as myScore, opponent_score as opponentScore, match_type as matchType, status
      FROM matches 
      WHERE team_id = ? AND status = 'finished'
    `).bind(teamId).all();

    return c.json(results);
  } catch (e) {
    return c.json({ error: '試合結果の取得に失敗しました' }, 500);
  }
});

// チームの全試合予定と結果、および出欠日程を取得するAPI（カレンダー用）
app.get('/:id/calendar-matches', async (c) => {
  const teamId = c.req.param('id');
  try {
    // 1. matches (試合) を取得
    const { results: matchesList } = await c.env.DB.prepare(`
      SELECT m.id, m.date, m.opponent, m.my_score as myScore, m.opponent_score as opponentScore, 
             m.match_type as matchType, m.status, m.batting_order as battingOrder,
             v.name as venueName, v.short_name as venueShortName
      FROM matches m
      LEFT JOIN venues v ON m.venue_id = v.id
      WHERE m.team_id = ?
    `).bind(teamId).all();

    // 2. events (出欠日程) を取得
    const { results: eventsList } = await c.env.DB.prepare(`
      SELECT id, title, start_at as startAt, end_at as endAt, event_type as eventType, 
             description, location, duty_group as dutyGroup, pm_start_at as pmStartAt, 
             pm_end_at as pmEndAt, pm_location as pmLocation, status
      FROM events
      WHERE team_id = ?
    `).bind(teamId).all();

    // 2.5. venues (球場マスタ) を取得
    const { results: venuesList } = await c.env.DB.prepare(`
      SELECT id, name, short_name as shortName, map_url as mapUrl
      FROM venues
    `).all();

    // 3. 試合データを共通形式に整形
    const formattedMatches = matchesList.map((m: any) => ({
      id: m.id,
      type: 'match',
      source: 'match',
      date: m.date, // 'YYYY-MM-DD'
      title: `試合 vs ${m.opponent}`,
      opponent: m.opponent,
      myScore: m.myScore,
      opponentScore: m.opponentScore,
      matchType: m.matchType,
      status: m.status,
      battingOrder: m.battingOrder,
      venueName: m.venueName,
      venueShortName: m.venueShortName,
    }));

    // 4. イベントデータを共通形式に整形
    const formattedEvents = eventsList.map((e: any) => {
      let dateObj: Date;
      if (typeof e.startAt === 'number') {
        const val = e.startAt;
        if (val < 10000000000) {
          dateObj = new Date(val * 1000);
        } else {
          dateObj = new Date(val);
        }
      } else if (e.startAt) {
        dateObj = new Date(e.startAt);
      } else {
        dateObj = new Date();
      }

      // 日本時間 (JST) で確実に YYYY-MM-DD を生成する
      const formatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(dateObj);
      const y = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      const dateStr = `${y}-${month}-${d}`;

      // 場所に対応する球場マスタを探し、map_urlを紐づける
      const matchedVenue = venuesList.find((v: any) => 
        e.location && (
          e.location === v.name || 
          e.location === v.shortName || 
          (v.name && e.location.includes(v.name)) || 
          (v.shortName && e.location.includes(v.shortName))
        )
      );
      const pmMatchedVenue = venuesList.find((v: any) => 
        e.pmLocation && (
          e.pmLocation === v.name || 
          e.pmLocation === v.shortName || 
          (v.name && e.pmLocation.includes(v.name)) || 
          (v.shortName && e.pmLocation.includes(v.shortName))
        )
      );

      return {
        id: e.id,
        type: e.eventType || 'event',
        source: 'event',
        date: dateStr,
        title: e.title,
        description: e.description,
        venueName: e.location,
        location: e.location,
        mapUrl: matchedVenue?.mapUrl || null,
        pmLocation: e.pmLocation,
        pmMapUrl: pmMatchedVenue?.mapUrl || null,
        dutyGroup: e.dutyGroup,
        pmStartAt: e.pmStartAt,
        pmEndAt: e.pmEndAt,
        status: e.status || 'scheduled',
      };
    });

    // 5. マージして日付順にソート
    const allItems = [...formattedMatches, ...formattedEvents];
    allItems.sort((a, b) => a.date.localeCompare(b.date));

    return c.json(allItems);
  } catch (e: any) {
    return c.json({ error: 'スケジュールの取得に失敗しました', details: e.message }, 500);
  }
});

export default app;
