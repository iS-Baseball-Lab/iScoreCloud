// filepath: src/components/liff/LiffProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Liff } from "@line/liff";
import { initLiff, getLiffProfile, type LiffUserProfile } from "@/lib/liff/liff-client";

interface LiffContextType {
  liff: Liff | null;
  isReady: boolean;
  isInClient: boolean;
  isLoggedIn: boolean;
  isMock: boolean;
  reason?: string;
  profile: LiffUserProfile | null;
  error: string | null;
}

const LiffContext = createContext<LiffContextType>({
  liff: null,
  isReady: false,
  isInClient: false,
  isLoggedIn: false,
  isMock: false,
  profile: null,
  error: null,
});

export function LiffProvider({
  children,
  liffId,
}: {
  children: React.ReactNode;
  liffId?: string;
}) {
  const [liff, setLiff] = useState<Liff | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInClient, setIsInClient] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMock, setIsMock] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [profile, setProfile] = useState<LiffUserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function setup() {
      try {
        const { liff: instance, isMock: mockMode, reason: mockReason } = await initLiff(liffId);
        if (!isMounted) return;

        setIsMock(mockMode);
        setReason(mockReason);

        if (instance) {
          setLiff(instance);
          const inClient = instance.isInClient();
          setIsInClient(inClient);

          // LINEアプリ内またはログイン済みの場合
          if (instance.isLoggedIn()) {
            const userProfile = await getLiffProfile();
            if (isMounted) {
              setProfile(userProfile);
              setIsLoggedIn(true);
            }
          } else if (inClient) {
            // LINEアプリ内の場合は自動ログインをトリガー
            instance.login();
          }
        }
        setIsReady(true);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("LiffProvider init error:", err);
        setError(err?.message || "LIFF initialization failed");
        setIsReady(true);
      }
    }

    setup();

    return () => {
      isMounted = false;
    };
  }, [liffId]);

  return (
    <LiffContext.Provider
      value={{
        liff,
        isReady,
        isInClient,
        isLoggedIn,
        isMock,
        reason,
        profile,
        error,
      }}
    >
      {children}
    </LiffContext.Provider>
  );
}

export function useLiff() {
  return useContext(LiffContext);
}
