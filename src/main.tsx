import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { I18nProvider } from "./i18n/I18nContext";
import { registerServiceWorkerV55 } from "./pwa/serviceWorkerV55";
import "./app/tokens.css";
import "./app/app-v3.css";
import "./app/recommend-v3.css";
import "./app/motion-v3.css";
import "./app/mobile-v3.css";
import "./app/product-v4.css";
import "./app/ingame-v41.css";
import "./app/assets-v42.css";
import "./app/v45-guided-analysis.css";
import "./app/v46-tree-core.css";
import "./app/v47-player-intelligence.css";
import "./app/v47-new-features.css";
import "./app/v48-account-intelligence.css";
import "./app/v49-rival-account.css";
import "./app/v50-tier-maker.css";
import "./app/v52-account-optimizer.css";
import "./app/accessibility.css";
import "./app/v53-responsive-ux.css";
import "./app/polish-v55.css";
import "./app/v55-trust-resilience.css";
import "./app/v56-control-graph.css";
import "./app/v58-online-platform.css";
import "./app/v59-client-110.css";
import "./app/v60-diceify.css";
import "./app/v60-diceify-deck.css";
import "./app/v61-diceify-dark.css";
import "./app/v63-atmosphere.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

registerServiceWorkerV55();
