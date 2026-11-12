"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserCircle, CheckCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function UserPage() {
  const { data: session } = authClient.useSession();

  if (!session) return null;

  // better-auth の adminClient 拡張により role フィールドが存在する
  const user = session.user as { name: string; email: string; role?: string };
  const { name, role, email } = user;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center pt-12 p-4 md:p-8">
      <main className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-center space-x-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 py-2 rounded-full border border-green-100 dark:border-green-900">
          <CheckCircle2 className="h-4 w-4" />
          <span className="font-medium">セッションは正常です：標準アクセス権限</span>
        </div>

        <Card className="border-t-4 border-t-primary shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-2xl">一般ユーザー向けポータル</CardTitle>
                <CardDescription>ログイン中のすべてのユーザーが利用可能なリソース</CardDescription>
              </div>
              <UserCircle className="h-10 w-10 text-primary/40" />
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <Separator />

            <div className="rounded-xl border bg-card p-6">
              <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-200">
                認証プロファイル
              </h3>
              <div className="flex items-center space-x-4">
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">{name}</p>
                  <p className="text-sm text-muted-foreground">{email}</p>
                </div>
                <Badge variant="outline" className="ml-auto bg-primary/5">
                  {role}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="flex justify-center">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">トップページへ戻る</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
