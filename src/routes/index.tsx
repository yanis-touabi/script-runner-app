import { createFileRoute } from "@tanstack/react-router";

import ReconcilerApp from "@/features/reconciler/ReconcilerApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Resiliate — Réconciliation des SIM résiliées" },
      {
        name: "description",
        content:
          "Application bureau pour déposer les fichiers de résiliation MOBILIS, DJEZZY et OOREDOO et lancer la réconciliation SIM_DB en un clic.",
      },
      { property: "og:title", content: "Resiliate — Réconciliation des SIM résiliées" },
      {
        property: "og:description",
        content:
          "Déposez les fichiers de résiliation, lancez le script et suivez le journal en direct depuis une seule fenêtre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReconcilerApp,
});
