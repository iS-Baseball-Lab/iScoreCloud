// src/app/(protected)/teams/_components/org-modals.tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X, Trash2, Settings, Info, Check, Swords, Tag, Building2 } from "lucide-react";
import { RiTeamFill } from "react-icons/ri";
import { Organization } from "@/types/teams";
import { cn } from "@/lib/utils";

interface CreateOrgModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isCreating: boolean;
  isExternalOrgCreate?: boolean;
  defaultCategory?: string;
  onSubmit: (name: string, category: string) => Promise<void>;
}

export function CreateOrgModal({ isOpen, onOpenChange, isCreating, isExternalOrgCreate, defaultCategory, onSubmit }: CreateOrgModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");

  useEffect(() => {
    if (isOpen) {
      setName("");
      setCategory(defaultCategory || "other");
    }
  }, [isOpen, defaultCategory]);

  if (!isOpen) return null;

  return (
    // 🔥 究極UI: モーダルの背景と光彩
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0 bg-background/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={() => !isCreating && onOpenChange(false)} />

      <div className="relative w-full max-w-lg bg-card/60 backdrop-blur-3xl shadow-[0_0_80px_rgba(0,0,0,0.2)] rounded-[32px] sm:rounded-[40px] overflow-hidden animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-8 duration-500 border border-border/50 flex flex-col max-h-[90vh]">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="mx-auto mt-4 h-1.5 w-16 rounded-full bg-border/50 sm:hidden" />

        <div className="relative z-10 text-left px-6 sm:px-8 pt-6 pb-4 flex items-center justify-between border-b border-border/40 bg-transparent shrink-0">
          <h2 className="text-xl sm:text-2xl font-black flex items-center gap-3 text-foreground tracking-tight drop-shadow-sm">
            <div className="p-2.5 bg-primary/10 rounded-2xl shadow-sm border border-primary/20 text-primary backdrop-blur-sm">
              {isExternalOrgCreate ? <Swords className="h-6 w-6" /> : <RiTeamFill className="h-6 w-6" />}
            </div>
            {isExternalOrgCreate ? "対戦相手を追加" : "チームを作る"}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-10 w-10 rounded-full hover:bg-background/80 text-muted-foreground transition-all"><X className="h-5 w-5" /></Button>
        </div>

        <div className="relative z-10 px-6 sm:px-8 py-6 space-y-6 overflow-y-auto">
          <form onSubmit={(e) => { e.preventDefault(); onSubmit(name, category); }} className="space-y-6">
            {/* 🔥 究極UI: フォームの半透明化 */}
            <div className="space-y-3">
              <label className="text-base font-black text-foreground/90 pl-1 flex items-center gap-2 drop-shadow-sm"><Building2 className="h-4 w-4 text-primary" />{isExternalOrgCreate ? "対戦相手のチーム名" : "チーム名"}</label>
              <input type="text" required placeholder={isExternalOrgCreate ? "例: 〇〇クラブ" : "例: 〇〇ベースボールクラブ"} className="flex h-14 w-full rounded-[20px] border border-border/50 bg-background px-5 text-lg font-bold shadow-xs focus-visible:ring-2 focus-visible:ring-primary transition-all text-foreground" value={name} onChange={(e) => setName(e.target.value)} disabled={isCreating} autoFocus />
            </div>

            <div className="space-y-3">
              <label className="text-base font-black text-foreground/90 pl-1 flex items-center gap-2 drop-shadow-sm"><Tag className="h-4 w-4 text-primary" />カテゴリ</label>
              <select className="flex h-14 w-full appearance-none rounded-[20px] border border-border/50 bg-background/40 backdrop-blur-sm px-5 pr-10 text-base font-bold text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-primary transition-all cursor-pointer bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke-width%3D%222.5%22%20stroke%3D%22%2371717a%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:18px_18px] bg-[position:right_18px_center] bg-no-repeat" value={category} onChange={(e) => setCategory(e.target.value)} disabled={isCreating}>
                <option value="gakudo">🧢 学童野球（少年野球）</option>
                <option value="junior">⚾️ 中学野球（シニア/ボーイズ等）</option>
                <option value="high">🏫 高校野球</option>
                <option value="adult">🍺 一般・草野球</option>
                <option value="other">📝 その他</option>
              </select>
              {isExternalOrgCreate && (
                <p className="text-xs font-bold text-muted-foreground pl-1 mt-2 flex items-center gap-1.5 bg-background/30 p-2 rounded-lg border border-border/50 w-fit backdrop-blur-sm">
                  <Info className="h-3.5 w-3.5 text-primary" /> 作成後、相手の編成（1軍など）を追加してください。
                </p>
              )}
            </div>
            <div className="pt-4">
              <Button type="submit" disabled={isCreating} className="w-full h-14 rounded-[20px] font-black text-base bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02] active:scale-95">
                {isCreating ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : "作成する"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

interface OrgDetailModalProps {
  isOpen: boolean;
  data?: Organization;
  isUpdating: boolean;
  onClose: () => void;
  onUpdate: (newName: string, newCategory?: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function OrgDetailModal({ isOpen, data, isUpdating, onClose, onUpdate, onDelete }: OrgDetailModalProps) {
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("other");

  useEffect(() => {
    if (data) {
      setEditName(data.name);
      setEditCategory(data.category || "other");
    }
  }, [data]);

  if (!isOpen || !data) return null;

  const myRole = data.myRole;
  const canEdit = myRole === 'OWNER' || myRole === 'OPPONENT_MANAGER';
  const isOpponent = myRole === 'OPPONENT_MANAGER';

  const hasChanges = editName.trim() !== "" && (editName !== data.name || editCategory !== data.category);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0 bg-background/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={() => !isUpdating && onClose()} />

      <div className="relative w-full max-w-lg bg-card/60 backdrop-blur-3xl shadow-[0_0_80px_rgba(0,0,0,0.2)] rounded-[32px] sm:rounded-[40px] overflow-hidden animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-8 duration-500 border border-border/50 flex flex-col max-h-[90vh]">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="mx-auto mt-4 h-1.5 w-16 rounded-full bg-border/50 sm:hidden" />

        <div className="relative z-10 flex items-center justify-between p-6 sm:p-8 pb-4 border-b border-border/40 bg-transparent shrink-0">
          <h2 className="text-xl sm:text-2xl font-black flex items-center gap-3 text-foreground tracking-tight drop-shadow-sm">
            <div className="p-2.5 bg-primary/10 rounded-2xl shadow-sm border border-primary/20 text-primary backdrop-blur-sm">
              {isOpponent ? <Swords className="h-5 w-5" /> : <RiTeamFill className="h-5 w-5" />}
            </div>
            {isOpponent ? "対戦相手 詳細情報" : "チーム詳細情報"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10 rounded-full hover:bg-background/80 text-muted-foreground transition-all"><X className="h-5 w-5" /></Button>
        </div>

        <div className="relative z-10 p-6 sm:p-8 space-y-6 overflow-y-auto">
          <div className="space-y-4">
            {/* 🔥 究極UI: 詳細情報のパネルも半透明化 */}
            <div className="flex items-center gap-4 p-4 bg-background/40 backdrop-blur-sm rounded-[24px] border border-border/50 shadow-sm">
              <div className="h-14 w-14 shrink-0 rounded-full bg-background border border-border/50 flex items-center justify-center text-primary shadow-sm">
                {isOpponent ? <Swords className="h-7 w-7" /> : <RiTeamFill className="h-7 w-7" />}
              </div>
              <div className="overflow-hidden">
                <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">登録名</div>
                <div className="text-lg sm:text-xl font-black truncate drop-shadow-sm">{data.name}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-background/40 backdrop-blur-sm rounded-[20px] border border-border/50 shadow-sm">
                <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">ID</div>
                <div className="text-xs font-mono font-bold text-foreground/80 truncate mt-2">{data.id.split('-')[0]}...</div>
              </div>
              <div className="p-4 bg-background/40 backdrop-blur-sm rounded-[20px] border border-border/50 shadow-sm">
                <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">権限・ロール</div>
                <div className="text-xs font-black text-primary truncate mt-2">{myRole === 'OPPONENT_MANAGER' ? '対戦相手' : (myRole === 'OWNER' ? '代表' : myRole)}</div>
              </div>
            </div>
          </div>

          {canEdit ? (
            <>
              <div className="h-px w-full bg-border/40 my-2" />
              <div className="space-y-4">
                <label className="text-base font-black text-foreground/90 flex items-center gap-2 drop-shadow-sm">
                  <Settings className="h-4 w-4 text-primary" /> 情報の編集
                </label>
                <div className="space-y-3">
                  <input type="text" placeholder="チーム名" className="flex h-12 w-full rounded-[20px] border border-border/50 bg-background/40 backdrop-blur-sm px-4 text-base font-bold shadow-sm focus-visible:ring-2 focus-visible:ring-primary transition-all text-foreground" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={isUpdating} />
                  <select className="flex h-12 w-full appearance-none rounded-[20px] border border-border/50 bg-background/40 backdrop-blur-sm px-4 pr-10 text-base font-bold text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-primary transition-all cursor-pointer bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke-width%3D%222.5%22%20stroke%3D%22%2371717a%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:18px_18px] bg-[position:right_16px_center] bg-no-repeat" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} disabled={isUpdating}>
                    <option value="gakudo">🧢 学童野球（少年野球）</option>
                    <option value="junior">⚾️ 中学野球（シニア/ボーイズ等）</option>
                    <option value="high">🏫 高校野球</option>
                    <option value="adult">🍺 一般・草野球</option>
                    <option value="other">📝 その他</option>
                  </select>
                  <Button onClick={() => onUpdate(editName, editCategory)} disabled={isUpdating || !hasChanges} className="h-12 w-full rounded-[20px] font-black mt-4 shadow-md shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95">
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-2" /> 更新を保存する</>}
                  </Button>
                </div>
              </div>
              <div className="pt-4">
                <Button variant="outline" onClick={onDelete} disabled={isUpdating} className="w-full h-12 rounded-[20px] font-extrabold border-red-500/30 text-red-500 bg-red-500/5 hover:bg-red-500 hover:text-white transition-all shadow-sm">
                  <Trash2 className="h-4 w-4 mr-2" /> このチームを完全に削除
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-4 p-4 bg-primary/10 backdrop-blur-sm rounded-[20px] border border-primary/20 text-center shadow-inner">
              <p className="text-xs font-bold text-primary">設定を変更するにはチームの代表者権限が必要です。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}