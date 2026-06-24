import { Router } from "express";
import path from "path";

// Serves the phone-side Plaid Link onboarding page. No auth (user-facing page).
export const onboardingRouter = Router();

onboardingRouter.get("/onboarding", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "onboarding.html"));
});

// The page's script (external so it's allowed under CSP script-src 'self').
onboardingRouter.get("/onboarding.js", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "onboarding.js"));
});
