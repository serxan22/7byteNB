import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// First visit: NEXT_LOCALE cookie if set (a manual choice is never overridden), else Accept-Language (en* → en, else az).
export default createMiddleware(routing);

export const config = {
  // pages only — API routes, Next internals, static data and files with an extension are untouched
  matcher: ["/((?!api|_next|_vercel|data|.*\\..*).*)"],
};
