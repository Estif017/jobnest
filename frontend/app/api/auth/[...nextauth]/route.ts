import NextAuth, { DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

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

// Server-side only — not exposed to the browser
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

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
          return null;  // Backend unreachable
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
          });
          if (res.ok) {
            const dbUser             = await res.json();
            token.userId             = String(dbUser.user_id);
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
