import type { NextAuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";

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

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

const FETCH_TIMEOUT = 5000;

const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

const githubConfigured =
  !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET;

export const authOptions: NextAuthOptions = {
  providers: [
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

    ...(googleConfigured
      ? [GoogleProvider({
          clientId:     process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        })]
      : []),

    ...(githubConfigured
      ? [GitHubProvider({
          clientId:     process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        })]
      : []),
  ],

  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user, account, trigger, session: updateData }: any) {
      if (trigger === "update" && updateData?.onboarding_complete !== undefined) {
        token.onboarding_complete = updateData.onboarding_complete;
        return token;
      }

      if (user) {
        // For credentials, userId is set by authorize(). For OAuth, it's set
        // below after the backend upsert. Never fall back to user.id here —
        // Google subject IDs are 21-digit numbers that overflow SQLite INTEGER.
        if (user.userId) token.userId = user.userId;
        token.onboarding_complete = user.onboarding_complete ?? false;
      }

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
        } catch { /* backend unavailable — session still works */ }
      }

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
        } catch { /* backend unavailable — session still works */ }
      }

      return token;
    },

    async session({ session, token }) {
      session.user.userId              = token.userId;
      session.user.onboarding_complete = token.onboarding_complete;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge:   30 * 24 * 60 * 60,
  },
};
