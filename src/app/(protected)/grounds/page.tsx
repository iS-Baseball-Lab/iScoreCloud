"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GroundsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/venues");
  }, [router]);
  return null;
}
