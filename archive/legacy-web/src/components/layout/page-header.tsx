// src/components/layout/page-header.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

interface PageHeaderProps {
    href: string;            // 戻る先のURL (例: "/dashboard")
    icon: React.ElementType; // Lucideアイコン
    title: string;           // 画面のタイトル
    subtitle: string;        // サブタイトル（簡易説明）
}

export function PageHeader({ href, icon: Icon, title, subtitle }: PageHeaderProps) {
    return (
        // 💡 headerタグ自体は幅100%になり、背景色とシャドウを画面いっぱいに広げます
        <header className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md transition-colors duration-300">

            {/* 💡 中身のコンテナに max-w-5xl と mx-auto を設定し、メインコンテンツと幅を揃えます */}
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-4 flex items-center gap-3">

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/20 text-primary-foreground border-none transition-all group shrink-0"
                    asChild
                >
                    <Link href={href}>
                        <ChevronLeft className="h-6 w-6 pr-0.5" />
                    </Link>
                </Button>

                <div className="flex flex-col min-w-0">
                    <h1 className="font-black text-lg sm:text-xl tracking-tight flex items-center gap-2 truncate">
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="truncate">{title}</span>
                    </h1>
                    <p className="text-xs text-primary-foreground/80 font-bold truncate mt-0.5 tracking-wider">
                        {subtitle}
                    </p>
                </div>

            </div>
        </header>
    );
}