// filepath: src/components/providers/density-provider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

// 🔥 現場至上主義：極小画面端末や屋外での情報表示を限界まで凝縮する 'ultra' を追加
export type Density = "standard" | "compact" | "comfortable" | "ultra";

interface DensityContextType {
  density: Density;
  setDensity: (density: Density) => void;
}

const DensityContext = createContext<DensityContextType>({
  density: "standard",
  setDensity: () => { },
});

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<Density>("standard");

  useEffect(() => {
    // 初回読み込み時に設定を復元
    const saved = localStorage.getItem("iscore_density") as Density;
    
    // 安全・確実：古いキャッシュや不正な文字列によるデータ矛盾をシステムレベルで防ぐガード節
    const validDensities: Density[] = ["standard", "compact", "comfortable", "ultra"];
    
    if (saved && validDensities.includes(saved)) {
      setDensityState(saved);
      document.documentElement.setAttribute("data-density", saved);
    } else {
      // 不正値のデッドエンドを防止し、標準設定を強制セット
      document.documentElement.setAttribute("data-density", "standard");
    }
  }, []);

  const setDensity = (newDensity: Density) => {
    setDensityState(newDensity);
    localStorage.setItem("iscore_density", newDensity);
    document.documentElement.setAttribute("data-density", newDensity);
  };

  return (
    <DensityContext.Provider value={{ density, setDensity }}>
      {children}
    </DensityContext.Provider>
  );
}

// どのコンポーネントからも簡単に呼び出せるカスタムフック
export const useDensity = () => useContext(DensityContext);
