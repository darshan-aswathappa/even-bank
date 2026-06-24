// Attach the authenticated user/device to the request after auth middleware.
import "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      deviceId?: string;
      deviceAuthId?: string; // set by requireClaim for the onboarding Plaid window
    }
  }
}

export {};
