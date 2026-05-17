// src/types/auth.ts

/**
 * 💡 権限ユニット (後から追加可能)
 */
export type Permission =
  | 'score_write'      // 試合スコア入力
  | 'roster_edit'      // 選手名簿の編集
  | 'match_manage'     // 試合の作成・削除
  | 'stats_view'       // チーム統計の閲覧
  | 'team_settings'    // チーム基本情報・役割の管理
  | 'billing_manage';  // 支払い管理

/**
 * 💡 チーム内での役割
 * ID（固定）とラベル（変更可）を分けることで柔軟性を確保。
 */
export interface TeamRole {
  id: string;          // 'manager', 'coach', 'custom_scouter' など
  label: string;       // "監督", "専属スコアラー" など
  permissions: Permission[];
}

export interface UserTeamMembership {
  teamId: string;
  teamName: string;
  teamLogo?: string;
  roleId: string;      // どの役割 ID か
  roleLabel: string;   // 表示用の役割名
  isMainTeam: boolean;
}

export interface UserSession {
  id: string;
  name: string;
  email: string;
  systemRole: 'SYSTEM_ADMIN' | 'USER' | 'GUEST';
  memberships: UserTeamMembership[];
  currentTeamId?: string;
  avatarUrl?: string;
}

/**
 * 💡 デフォルトの役割セット (プリセット)
 */
export const DEFAULT_ROLES: Record<string, TeamRole> = {
  manager: {
    id: 'manager',
    label: '監督',
    permissions: ['score_write', 'roster_edit', 'match_manage', 'stats_view', 'team_settings', 'billing_manage'],
  },
  coach: {
    id: 'coach',
    label: 'コーチ',
    permissions: ['score_write', 'roster_edit', 'match_manage', 'stats_view'],
  },
  Parent: {
    id: 'parent',
    label: '保護者',
    permissions: ['stats_view'],
  }
};
