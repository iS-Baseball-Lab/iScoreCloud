// filepath: src/lib/roles.ts

// 💡 8つのロールを厳密に定義（値は小文字で統一）
export const ROLES = {
  ADMIN: "admin",       // IT管理者
  MANAGER: "manager",   // 代表・監督
  COACH: "coach",       // コーチ
  SCORER: "scorer",     // スコアラー
  STAFF: "staff",       // スタッフ（マネージャーや用具係など）
  PARENT: "parent",     // 🔥 新設：保護者（選手サポート・内部データ閲覧）
  PLAYER: "player",     // 選手
  VIEWER: "viewer",     // OB・ファン・関係者
  PENDING: "pending",   // 認証待ちの仮ユーザー（デフォルト）
} as const;

// TypeScript用の型（'admin' | 'manager' | 'coach' ... となります）
export type Role = typeof ROLES[keyof typeof ROLES];

/**
 * 💡 チーム固有のロールカスタム呼称データを受け取るための型定義
 * バックエンドのDB（D1）やAPIレスポンスと共通化します
 */
export interface CustomRoleSetting {
  role: string;         // 'manager', 'coach' などのシステムロールキー
  customLabel: string;  // '総監督', '代表', '父母会長' などのカスタム呼称
}

// 💡 チームがカスタム設定していない場合のシステムデフォルトの日本語呼称
export const DEFAULT_ROLE_LABELS: Record<Role, string> = {
  [ROLES.ADMIN]: "IT管理者",
  [ROLES.MANAGER]: "監督",
  [ROLES.COACH]: "コーチ",
  [ROLES.SCORER]: "スコアラー",
  [ROLES.STAFF]: "スタッフ",
  [ROLES.PARENT]: "保護者", // 🌟 保護者のデフォルト呼称
  [ROLES.PLAYER]: "選手",
  [ROLES.VIEWER]: "閲覧者",
  [ROLES.PENDING]: "承認待ち",
};

/**
 * 💡 チーム固有のカスタム設定を考慮して、正しい日本語表示ラベルを返す共通関数
 * @param role ユーザーのロール文字列
 * @param customSettings チームごとのカスタム呼称設定（任意）
 */
export function resolveRoleLabel(
  role: string | null | undefined,
  customSettings?: CustomRoleSetting[] | null
): string {
  if (!role) return "メンバー";
  
  // 小文字に正規化してRole型にキャスト
  const normalizedRole = role.toLowerCase() as Role;

  // 1. チーム固有のカスタム設定があればそれを最優先で適用
  if (customSettings && Array.isArray(customSettings)) {
    const setting = customSettings.find(s => s.role.toLowerCase() === normalizedRole);
    if (setting?.customLabel) return setting.customLabel;
  }

  // 2. カスタム設定がなければシステムデフォルトの呼称を返す
  return DEFAULT_ROLE_LABELS[normalizedRole] ?? "メンバー";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 各アクションに対する権限チェック用のヘルパー関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 0. チームに承認されたメンバーか？（pending以外ならOK）
export const isApprovedMember = (role?: string | null): boolean => {
  if (!role) return false;
  return role.toLowerCase() !== ROLES.PENDING;
};

// 1. システム管理（IT担当）ができるか
export const canManageSystem = (role?: string | null): boolean => {
  if (!role) return false;
  return role.toLowerCase() === ROLES.ADMIN;
};

// 2. チーム管理（代表・監督・IT担当）ができるか
export const canManageTeam = (role?: string | null): boolean => {
  if (!role) return false;
  const r = role.toLowerCase();
  return (r === ROLES.ADMIN || r === ROLES.MANAGER);
};

// 3. スコアの入力・編集（管理者、監督、コーチ、スコアラー）ができるか
export const canEditScore = (role?: string | null): boolean => {
  if (!role) return false;
  const r = role.toLowerCase();
  return (r === ROLES.ADMIN || r === ROLES.MANAGER || r === ROLES.COACH || r === ROLES.SCORER);
};

// 4. チーム内部情報の閲覧（スタッフ・保護者以上）ができるか
export const canViewInternalData = (role?: string | null): boolean => {
  if (!role) return false;
  const r = role.toLowerCase();
  // 🌟 内部スケジュールや連絡網、選手データは「保護者」も見れるように追加！
  return (
    r === ROLES.ADMIN || 
    r === ROLES.MANAGER || 
    r === ROLES.COACH || 
    r === ROLES.SCORER || 
    r === ROLES.STAFF ||
    r === ROLES.PARENT
  );
};
