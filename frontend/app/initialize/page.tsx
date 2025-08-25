import { Suspense } from "react";
import InitializeClient from "./InitializeClient";

export const dynamic = "force-dynamic";

export default function InitializePage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <InitializeClient />
    </Suspense>
  );
}