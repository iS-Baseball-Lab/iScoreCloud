// filepath: src/components/liff/BaseballBoardOnlineModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Wifi,
  RefreshCw,
  Share2,
  Copy,
  LogOut,
  Play,
  PlusCircle,
  Hash,
  ShieldAlert,
  Loader2,
  X,
} from "lucide-react";
import type {
  OnlineRoomDetail,
  OnlineRoomSummary,
} from "@/types/baseball-board-online";

interface BaseballBoardOnlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDemoTeam: boolean;
  teamDisplayName: string;
  myDefaultName: string;
  rooms: OnlineRoomSummary[];
  activeRoom: OnlineRoomDetail | null;
  isLoadingRooms: boolean;
  isSubmitting: boolean;
  onRefreshRooms: () => void;
  onCreateRoom: (params: {
    totalInnings: number;
    hostBatsFirst: boolean;
    displayName: string;
  }) => Promise<void>;
  onJoinByRoomId: (roomId: string, displayName: string) => Promise<void>;
  onJoinByCode: (roomCode: string, displayName: string) => Promise<void>;
  onShareRoomLine: (room: OnlineRoomDetail) => Promise<void>;
  onCopyRoomCode: (roomCode: string) => Promise<void>;
  onLeaveRoom: (roomId: string) => Promise<void>;
}

const INNING_CHOICES = [1, 3, 5, 7] as const;

export function BaseballBoardOnlineModal({
  isOpen,
  onClose,
  isDemoTeam,
  teamDisplayName,
  myDefaultName,
  rooms,
  activeRoom,
  isLoadingRooms,
  isSubmitting,
  onRefreshRooms,
  onCreateRoom,
  onJoinByRoomId,
  onJoinByCode,
  onShareRoomLine,
  onCopyRoomCode,
  onLeaveRoom,
}: BaseballBoardOnlineModalProps) {
  const [displayName, setDisplayName] = useState<string>(myDefaultName);
  const [createInnings, setCreateInnings] = useState<number>(3);
  const [hostBatsFirst, setHostBatsFirst] = useState<boolean>(true);
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");

  useEffect(() => {
    if (myDefaultName && !displayName.trim()) {
      setDisplayName(myDefaultName);
    }
  }, [myDefaultName, displayName]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  const cleanName = displayName.trim() || myDefaultName || "メンバー";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md max-h-[89dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
        {/* A-3 上帯ダークキャップ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3.5 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-sm font-black truncate">
                チーム内オンライン対戦
              </span>
            </div>
            <p className="text-[10.5px] font-bold text-slate-300 truncate mt-0.5">
              対象チーム: {teamDisplayName}（メンバー限定ロビー）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {isDemoTeam ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-slate-900 dark:border-amber-500/50 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span className="text-xs font-black">
                  承認済みの所属チーム限定機能です
                </span>
              </div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed">
                チーム内オンライン対戦は、外部ユーザー混入を防ぐため同じチームに所属・承認されたメンバー同士のみで遊べる安全設計になっています。
                <br />
                体験デモ中は「1P vs CPU」「2P 1台対戦」「HR競争」をお楽しみください！
              </p>
            </div>
          ) : (
            <>
              {/* 現在入室中のルームがある場合のステータスカード */}
              {activeRoom && activeRoom.status !== "closed" && (
                <div className="rounded-2xl border-2 border-primary bg-muted/50 overflow-hidden">
                  <div className="bg-[#0f172a] text-white px-3.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-black flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px]">
                        #{activeRoom.roomCode}
                      </span>
                      <span>
                        {activeRoom.status === "waiting"
                          ? "対戦相手の参加待ち"
                          : activeRoom.status === "playing"
                          ? "オンライン対戦中"
                          : "対戦終了"}
                      </span>
                    </span>
                    <span className="text-[10.5px] font-bold text-slate-300">
                      {activeRoom.totalInnings}回制
                    </span>
                  </div>

                  <div className="p-3 space-y-2.5 bg-card">
                    <div className="flex items-center justify-between text-xs font-black text-foreground">
                      <span>👑 {activeRoom.hostName}</span>
                      <span className="text-muted-foreground">vs</span>
                      <span>
                        {activeRoom.guestName
                          ? `⚾ ${activeRoom.guestName}`
                          : "（相手待ち…）"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {activeRoom.status === "waiting" && (
                        <button
                          type="button"
                          onClick={() => void onShareRoomLine(activeRoom)}
                          className="col-span-2 h-9 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-97 transition-all cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>LINEでチーム仲間に招待を送る</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void onCopyRoomCode(activeRoom.roomCode)}
                        className="h-9 rounded-xl bg-muted hover:bg-accent border border-border text-foreground text-xs font-black flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-primary" />
                        <span>番号 #{activeRoom.roomCode}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => void onLeaveRoom(activeRoom.id)}
                        className="h-9 rounded-xl bg-muted hover:bg-red-50 dark:hover:bg-red-950/40 border border-border text-[#dc2626] text-xs font-black flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>
                          {activeRoom.status === "waiting"
                            ? "募集をやめる"
                            : "退出する"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* プレイヤー表示名 */}
              <div className="space-y-1">
                <label
                  htmlFor="baseball-board-online-name"
                  className="text-xs font-black text-foreground block"
                >
                  あなたのプレイヤー表示名
                </label>
                <input
                  id="baseball-board-online-name"
                  type="text"
                  maxLength={16}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={myDefaultName || "名前を入力"}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* ① チーム内の募集中ルーム一覧 */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="bg-muted px-3.5 py-2 border-b border-border flex items-center justify-between">
                  <span className="text-xs font-black text-foreground">
                    1. チーム内の募集中ルーム（{rooms.length}件）
                  </span>
                  <button
                    type="button"
                    disabled={isLoadingRooms}
                    onClick={onRefreshRooms}
                    className="h-7 px-2.5 rounded-lg bg-card hover:bg-accent border border-border text-[11px] font-black text-foreground flex items-center gap-1 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        isLoadingRooms ? "animate-spin text-primary" : ""
                      }`}
                    />
                    <span>更新</span>
                  </button>
                </div>

                <div className="p-3">
                  {rooms.length === 0 ? (
                    <p className="text-xs font-bold text-muted-foreground text-center py-3">
                      現在募集中のルームはありません。
                      <br />
                      下の「新しくルームを作る」から対戦相手を募集できます！
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {rooms.map((rm) => (
                        <div
                          key={rm.id}
                          className="p-2.5 rounded-xl border border-border bg-background flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-[#0f172a] text-amber-300 text-[10px] font-black">
                                #{rm.roomCode}
                              </span>
                              <span className="text-xs font-black text-foreground truncate">
                                {rm.hostName}さん
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-bold text-muted-foreground shrink-0">
                                {rm.totalInnings}回制
                              </span>
                            </div>
                            <p className="text-[10.5px] font-bold text-muted-foreground mt-0.5">
                              {rm.status === "playing"
                                ? `対戦中（${rm.inning}回${
                                    rm.isTop ? "表" : "裏"
                                  } ${rm.awayScore}-${rm.homeScore}）`
                                : rm.hostSide === "away"
                                ? "ホスト先攻（あなたは後攻）"
                                : "ホスト後攻（あなたは先攻）"}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => void onJoinByRoomId(rm.id, cleanName)}
                            className={`h-9 px-3 rounded-xl text-xs font-black flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer disabled:opacity-50 ${
                              rm.isMine
                                ? "bg-[#0f172a] text-white"
                                : "bg-primary text-primary-foreground"
                            }`}
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>{rm.isMine ? "復帰" : "参加する"}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ② 新しく対戦ルームを作る */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="bg-muted px-3.5 py-2 border-b border-border flex items-center gap-1.5">
                  <PlusCircle className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-black text-foreground">
                    2. 新しく対戦ルームを作る
                  </span>
                </div>

                <div className="p-3 space-y-2.5">
                  <div className="grid grid-cols-4 gap-1.5">
                    {INNING_CHOICES.map((inn) => {
                      const active = createInnings === inn;
                      return (
                        <button
                          key={inn}
                          type="button"
                          onClick={() => setCreateInnings(inn)}
                          className={`h-8 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer ${
                            active
                              ? "bg-[#0f172a] text-white border-primary"
                              : "bg-background text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {inn}回制
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setHostBatsFirst(true)}
                      className={`h-8 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer ${
                        hostBatsFirst
                          ? "bg-[#0f172a] text-white border-primary"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      🏏 自分が先攻
                    </button>
                    <button
                      type="button"
                      onClick={() => setHostBatsFirst(false)}
                      className={`h-8 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer ${
                        !hostBatsFirst
                          ? "bg-[#0f172a] text-white border-primary"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      ⚾ 自分が後攻
                    </button>
                  </div>

                  <button
                    type="button"
                    id="btn-baseball-board-create-online-room"
                    disabled={isSubmitting}
                    onClick={() =>
                      void onCreateRoom({
                        totalInnings: createInnings,
                        hostBatsFirst,
                        displayName: cleanName,
                      })
                    }
                    className="w-full h-10 rounded-xl bg-primary hover:brightness-105 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4" />
                    )}
                    <span>ルームを作成して相手を待つ</span>
                  </button>
                </div>
              </div>

              {/* ③ 4桁のルーム番号で参加 */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="bg-muted px-3.5 py-2 border-b border-border flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-black text-foreground">
                    3. 4桁のルーム番号で参加
                  </span>
                </div>
                <div className="p-3 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={joinCodeInput}
                    onChange={(e) =>
                      setJoinCodeInput(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    placeholder="例: 4829"
                    className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-black tracking-widest text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    disabled={isSubmitting || joinCodeInput.length < 4}
                    onClick={() => void onJoinByCode(joinCodeInput, cleanName)}
                    className="h-10 px-4 rounded-xl bg-[#0f172a] text-white text-xs font-black active:scale-95 transition-all cursor-pointer disabled:opacity-45 shrink-0"
                  >
                    番号で参加
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-10 rounded-xl bg-muted hover:bg-accent border border-border text-foreground font-black text-xs cursor-pointer"
          >
            盤面へ戻る
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
