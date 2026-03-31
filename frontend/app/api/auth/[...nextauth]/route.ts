import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const validEmail    = process.env.NEXTAUTH_USER;
        const validPassword = process.env.NEXTAUTH_PASSWORD;

        if (
          credentials?.email    === validEmail &&
          credentials?.password === validPassword
        ) {
          return { id: "1", email: validEmail, name: "JobNest User" };
        }
        return null;  // returning null triggers a sign-in error
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge:   30 * 24 * 60 * 60,  // 30 days
  },
});

export { handler as GET, handler as POST };
