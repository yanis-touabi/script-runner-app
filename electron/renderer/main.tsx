import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import ReconcilerApp from "../../src/features/reconciler/ReconcilerApp";
import "../../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReconcilerApp />
  </StrictMode>,
);
