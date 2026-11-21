// filepath: src/db/schema/special-event.ts
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { teams } from "./team";

// ==========================================
// 🎉 チーム特別イベント・アンケート（忘年会・卒団式・親子レク・日程調整等）
// ※通常の練習・試合スケジュール (`events` / `attendances`) とは完全分離
// ==========================================
export const teamSpecialEvents = sqliteTable(
  "team_special_events",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("party"), // 'party' | 'ceremony' | 'recreation' | 'meeting' | 'survey' | 'other'
    mode: text("mode").notNull().default("rsvp"), // 'rsvp' (出欠・同伴家族・会費・アンケート) | 'date_poll' (候補日アンケート)
    status: text("status").notNull().default("open"), // 'open' | 'closed' | 'archived'
    eventDate: text("event_date"), // 'YYYY-MM-DD' (開催日確定時・チームカレンダー連動用)
    startTime: text("start_time"), // 'HH:mm'
    endTime: text("end_time"), // 'HH:mm'
    location: text("location"),
    locationUrl: text("location_url"),
    deadlineDate: text("deadline_date"), // 'YYYY-MM-DD'
    description: text("description"),
    allowCompanions: integer("allow_companions", { mode: "boolean" })
      .notNull()
      .default(true),
    useFeeCalculation: integer("use_fee_calculation", { mode: "boolean" })
      .notNull()
      .default(true),
    feeTiersJson: text("fee_tiers_json"), // JSON: SpecialEventFeeTier[]
    candidateDatesJson: text("candidate_dates_json"), // JSON: SpecialEventCandidateDate[]
    questionsJson: text("questions_json"), // JSON: SpecialEventQuestion[]
    createdByUserId: text("created_by_user_id"),
    createdByName: text("created_by_name"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
  },
  (table) => ({
    teamStatusDateIdx: index("idx_special_events_team_status_date").on(
      table.teamId,
      table.status,
      table.eventDate
    ),
  })
);

// ==========================================
// 👨‍👩‍👧‍👦 特別イベント 世帯・メンバー単位の回答テーブル（同伴家族・アンケート・集金状況込み）
// ==========================================
export const teamSpecialEventResponses = sqliteTable(
  "team_special_event_responses",
  {
    id: text("id").primaryKey(),
    specialEventId: text("special_event_id")
      .notNull()
      .references(() => teamSpecialEvents.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    householdKey: text("household_key").notNull(), // 世帯または個人識別キー (例: 'hh_p_xxx', 'hh_m_xxx')
    householdLabel: text("household_label").notNull(), // 例: '山田 家', '佐藤 監督'
    memberEntriesJson: text("member_entries_json").notNull().default("[]"), // JSON: SpecialEventMemberAttendance[]
    companionsJson: text("companions_json").notNull().default("[]"), // JSON: SpecialEventCompanion[] (兄弟・名簿外家族)
    dateVotesJson: text("date_votes_json").notNull().default("[]"), // JSON: SpecialEventDateVote[]
    surveyAnswersJson: text("survey_answers_json").notNull().default("{}"), // JSON: Record<questionId, string | string[]>
    comment: text("comment"),
    feePaid: integer("fee_paid", { mode: "boolean" }).notNull().default(false),
    updatedByUserId: text("updated_by_user_id"),
    updatedByName: text("updated_by_name"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
  },
  (table) => ({
    eventHouseholdUniq: uniqueIndex("idx_special_event_resp_uniq").on(
      table.specialEventId,
      table.householdKey
    ),
    teamEventIdx: index("idx_special_event_resp_team_ev").on(
      table.teamId,
      table.specialEventId
    ),
  })
);
