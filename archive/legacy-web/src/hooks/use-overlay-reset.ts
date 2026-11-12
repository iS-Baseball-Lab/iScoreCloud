// filepath: src/hooks/use-overlay-reset.ts
"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * 💡 画面遷移時にオーバーレイを自動リセットするフック
 */
export const useOverlayReset = (closeCallback: () => void) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // パスやクエリが変わったら、開いているオーバーレイを閉じる
    closeCallback();
  }, [pathname, searchParams, closeCallback]);
};
