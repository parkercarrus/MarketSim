import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic"; // avoids static export error

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <DashboardClient />
    </Suspense>
  );
}
