"use client";

import { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { setApiUserId } from "@/lib/api";

function UserIdSync() {
  const { data: session } = useSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setApiUserId(session?.user?.userId);
  }, [session?.user?.userId]);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <UserIdSync />
      {children}
    </SessionProvider>
  );
}
