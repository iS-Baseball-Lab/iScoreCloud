// src/config/navigation.ts
/**
 * 💡 ナビゲーション構成定義
 * 1. 役割: アプリ全体のメニュー項目を一元管理。
 * 2. 構成: 上段 (Main) と 下段 (Admin/Settings) の二段構成。
 */
import {
  LayoutGrid,
  Users,
  Users2,
  Trophy,
  History,
  PlusSquare,
  UserCheck,
  Settings
} from "lucide-react";
import { NavItem } from "@/types/navigation";

export const MAIN_NAV_ITEMS: NavItem[] = [
  { name: "TEAM HUB", href: "/dashboard", icon: LayoutGrid, show: true, exact: true },
  { name: "チーム", href: "/team", icon: Users, show: true },
  { name: "名簿・組織管理", href: "/players", icon: Users2, show: true },
  { name: "大会マップ", href: "/tournaments/map", icon: Trophy, show: true },
  { name: "試合記録", href: "/matches/history", icon: History, show: true },
];

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { name: "大会管理", href: "/tournaments", icon: PlusSquare, show: true },
  { name: "参加申請", href: "/teams/requests", icon: UserCheck, show: true },
  { name: "設定", href: "/settings", icon: Settings, show: true },
];