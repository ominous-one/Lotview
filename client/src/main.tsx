import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import { initializeTracking } from "./lib/tracking";

// Initialize tracking pixels (Facebook, Google Ads, GA4) from API config
initializeTracking();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
