"use client";

import React, { useEffect, useState } from "react";
import { User, Mail, Shield, Save, Crown, Loader2, Camera, Calendar, Activity, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { UserSession } from "@/types/auth";

interface AuthResponse {
  success: boolean;
  data: UserSession;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) throw new Error("Failed to fetch");
        const json = (await response.json()) as AuthResponse;
        if (json.success) {
          setUser(json.data);
          setName(json.data.name || "");
        }
      } catch (error) {
        toast.error("ユーザー情報の取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };
    fetchUser();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast.success("プロフィールを更新しました");
    if (user) setUser({ ...user, name });
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = user?.systemRole === 'SYSTEM_ADMIN';

  return (
    // 🔥 全体の余白も通常に戻しました
    <div className="w-full animate-in fade-in duration-500">

      {/* ヒーローセクション (A-3 Dark Solid Header Cap) */}
      <div className="w-full bg-[#0f172a] text-slate-50 border-b-[3px] border-primary shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {/* プロフィールヘッダー */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
            <div className="relative group shrink-0 self-start sm:self-auto">
              <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-slate-800 shadow-xl bg-slate-900">
                <AvatarImage src={user.avatarUrl || ""} className="object-cover" />
                <AvatarFallback className="text-3xl sm:text-4xl font-black text-blue-300 bg-primary/20">
                  {(user.name || "U").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <button className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 p-2.5 bg-primary text-primary-foreground rounded-full shadow-lg hover:scale-110 active:scale-95 transition-transform border-2 border-[#0f172a] cursor-pointer">
                <Camera className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </button>
            </div>

            <div className="flex flex-col flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2 mb-1.5 sm:mb-2">
                {isAdmin && (
                  <span className="flex items-center px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] sm:text-xs font-black tracking-widest uppercase border border-amber-500/40">
                    <Crown className="h-3 w-3 mr-1" />
                    System Admin
                  </span>
                )}
                <span className="flex items-center text-slate-300 text-[10px] sm:text-xs font-bold bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded-full">
                  <Calendar className="h-3 w-3 mr-1" />
                  Joined 2024
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
                {user.name}
              </h1>
              <p className="text-sm font-bold text-slate-300 mt-1 flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-blue-400" />
                {user.email}
              </p>
            </div>

            <div className="hidden sm:flex pb-1">
              <Button
                size="lg"
                onClick={handleSave}
                disabled={isSaving || name === user.name}
                className="h-12 px-8 rounded-full font-bold shadow-md hover:scale-105 active:scale-95 transition-all"
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                {isSaving ? "更新中..." : "変更を保存"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 sm:mt-8">

        {/* 設定パネル */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="rounded-2xl bg-card border border-border shadow-xs overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-5 py-3.5 flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center">
                  <User className="h-4 w-4" />
                </span>
                <h2 className="text-base font-black text-white">
                  基本情報
                </h2>
              </div>
              <div className="p-5 sm:p-8 space-y-6">
                <div className="space-y-2.5">
                  <Label htmlFor="name" className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-widest">
                    表示名 (Display Name)
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-14 rounded-2xl border-border bg-muted text-lg font-bold focus-visible:ring-primary/50 transition-colors px-4"
                    placeholder="グラウンドでの名前を入力"
                  />
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-widest">
                    メールアドレス (Email Address)
                  </Label>
                  <Input
                    id="email"
                    value={user.email}
                    disabled
                    className="h-14 rounded-2xl border-border bg-muted text-lg font-bold text-muted-foreground cursor-not-allowed opacity-70 px-4"
                  />
                </div>
                {/* 🌟 ソーシャルログイン同期ガイダンス */}
                <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-muted border border-border text-xs font-bold text-muted-foreground leading-normal">
                  <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                  <p>
                    LINE や Google などの連携アカウント側でメールアドレスやプロフィール画像を変更した場合、
                    <strong>一度ログアウトし、再度ログイン</strong>していただくことで最新情報が自動的に同期されます。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6">
            <div className="rounded-2xl bg-card border border-border shadow-xs overflow-hidden group">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-5 py-3 flex items-center justify-between">
                <span className="text-xs font-black text-white uppercase tracking-widest">Teams</span>
                <Activity className="h-4 w-4 text-blue-400" />
              </div>
              <div className="p-5 sm:p-6 relative overflow-hidden">
                <Activity className="absolute -right-2 -bottom-2 h-20 w-20 text-primary/10 group-hover:scale-110 transition-transform duration-500" />
                <div className="flex items-baseline gap-1.5 relative z-10">
                  <span className="text-4xl font-black text-primary tracking-tighter">
                    {user.memberships?.length || 0}
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">所属</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-card border border-border shadow-xs overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-5 py-3 flex items-center justify-between">
                <span className="text-xs font-black text-white uppercase tracking-widest">Account Role</span>
                <Shield className="h-4 w-4 text-blue-400" />
              </div>
              <div className="p-5 sm:p-6 flex items-start gap-3 sm:gap-4">
                {isAdmin ? (
                  <>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl shrink-0">
                      <Crown className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="font-black text-amber-600 dark:text-amber-400 text-sm sm:text-base">システム管理者</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 font-bold leading-relaxed">
                        i-Scoreの全ての機能と設定にアクセスできる最高権限です。
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl shrink-0">
                      <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-black text-foreground text-sm sm:text-base">一般ユーザー</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 font-bold leading-relaxed">
                        所属チームの権限に基づき機能を利用できます。
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 🔥 スマホ用保存ボタン（元の位置であるコンテンツの一番下に戻しました） */}
        <div className="mt-8 sm:hidden flex justify-end pb-8">
          <Button
            size="lg"
            onClick={handleSave}
            disabled={isSaving || name === user.name}
            className="w-full h-14 rounded-2xl font-black text-base shadow-md shadow-primary/20 active:scale-95 transition-all"
          >
            {isSaving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
            {isSaving ? "更新中..." : "変更を保存"}
          </Button>
        </div>

      </div>
    </div>
  );
}