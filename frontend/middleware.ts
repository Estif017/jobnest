import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token    = req.nextauth.token;
    const { pathname } = req.nextUrl;

    if (!token) return NextResponse.next();

    // Authenticated but onboarding not done → redirect to /onboarding
    if (!token.onboarding_complete && pathname !== "/onboarding") {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    // Onboarding done but trying to visit /onboarding → redirect to dashboard
    if (token.onboarding_complete && pathname === "/onboarding") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!api/auth|login|signup|auth/verify-email|auth/verify-email-sent|auth/forgot-password|auth/reset-password|_next/static|_next/image|favicon.ico).*)",
  ],
};
