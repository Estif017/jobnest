import NextAuth, { DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";

// ---------------------------------------------------------------------------
// Extend NextAuth types to carry userId and onboarding_complete
// ---------------------------------------------------------------------------

declare module "next-auth" {
  interface User {
    userId?: string;
    onboarding_complete?: boolean;
  }
  interface Session {
    user: {
      userId?: string;
      onboarding_complete?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    onboarding_complete?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Prefer API_URL (127.0.0.1) over NEXT_PUBLIC_API_URL (localhost) for
// server-side fetches — Node.js 18+ resolves "localhost" to ::1 (IPv6) but
// uvicorn binds to 127.0.0.1 (IPv4), causing silent hangs on Windows.
const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

const FETCH_TIMEOUT = 5000; // ms — fail fast instead of hanging forever

const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

const githubConfigured =
  !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET;

const handler = NextAuth({
  providers: [
    // -----------------------------------------------------------------------
    // Credentials — delegates to FastAPI POST /auth/login
    // -----------------------------------------------------------------------
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              email:    credentials.email,
              password: credentials.password,
            }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
          });

          if (!res.ok) return null;

          const user = await res.json();
          return {
            id:                  String(user.user_id),
            email:               user.email,
            userId:              String(user.user_id),
            onboarding_complete: user.onboarding_complete,
          };
        } catch {
          return null;
        }
      },
    }),

    // -----------------------------------------------------------------------
    // Google — only registered when env vars are set
    // -----------------------------------------------------------------------
    ...(googleConfigured
      ? [
          GoogleProvider({
            clientId:     process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),

    // -----------------------------------------------------------------------
    // GitHub — only registered when env vars are set
    // -----------------------------------------------------------------------
    ...(githubConfigured
      ? [
          GitHubProvider({
            clientId:     process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],

  callbacks: {
    // -----------------------------------------------------------------------
    // jwt — runs on sign-in and on every session access
    // -----------------------------------------------------------------------
    async jwt({ token, user, account }) {
      // Credentials: user comes from authorize() above
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.userId             = (user as any).userId ?? user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.onboarding_complete = (user as any).onboarding_complete ?? false;
      }

      // Google: upsert in our DB on first sign-in (account is only present then)
      if (account?.provider === "google" && token.email) {
        try {
          const res = await fetch(`${API_URL}/auth/google`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email: token.email }),
            signal:  AbortSignal.timeout(FETCH_TIMEOUT),
          });
          if (res.ok) {
            const dbUser              = await res.json();
            token.userId              = String(dbUser.user_id);
            token.onboarding_complete = dbUser.onboarding_complete;
          }
        } catch {
          // Backend unavailable — session still works, onboarding will re-check
        }
      }

      // GitHub: upsert in our DB on first sign-in
      if (account?.provider === "github" && token.email) {
        try {
          const res = await fetch(`${API_URL}/auth/github`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email: token.email }),
            signal:  AbortSignal.timeout(FETCH_TIMEOUT),
          });
          if (res.ok) {
            const dbUser              = await res.json();
            token.userId              = String(dbUser.user_id);
            token.onboarding_complete = dbUser.onboarding_complete;
          }
        } catch {
          // Backend unavailable — session still works, onboarding will re-check
        }
      }

      return token;
    },

    // -----------------------------------------------------------------------
    // session — expose token fields to the frontend via useSession()
    // -----------------------------------------------------------------------
    async session({ session, token }) {
      session.user.userId             = token.userId;
      session.user.onboarding_complete = token.onboarding_complete;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge:   30 * 24 * 60 * 60,  // 30 days
  },
});

export { handler as GET, handler as POST };
