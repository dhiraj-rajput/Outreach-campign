import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { validateEmail } from "@/lib/password";
import { getAccessContextForUser, syncEnvSuperAdmin } from "@/lib/access";

type UserRow = { id: string; email: string; password_hash: string; name: string | null };

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const emailCheck = validateEmail(credentials.email);
        if (!emailCheck.ok) return null;
        const email = credentials.email.trim().toLowerCase();

        if (isRateLimited(req, "login", 10, 15 * 60 * 1000)) {
          throw new Error("Too many attempts. Try again later.");
        }

        const db = getDb();
        let user: UserRow | undefined;
        try {
          user = db.prepare("SELECT id, email, password_hash, name FROM users WHERE email = ?")
            .get(email) as UserRow | undefined;
        } catch {
          user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
            .get(email) as UserRow | undefined;
        }
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email.split("@")[0],
        };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      // Re-resolve plan/role from the DB on every request (not just at sign-in) so an
      // admin flipping someone's plan, or promoting a super admin, takes effect on their
      // very next API call/page load instead of requiring a fresh login.
      if (token.id) {
        syncEnvSuperAdmin(token.id as string, (token.email as string) ?? "");
        const access = getAccessContextForUser(token.id as string);
        if (access) {
          token.role = access.role;
          token.isPaid = access.isPaid;
          token.orgId = access.orgId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.id = token.id as string;
        session.user.role = (token.role as "user" | "super_admin") ?? "user";
        session.user.isPaid = Boolean(token.isPaid);
        session.user.orgId = (token.orgId as string | null) ?? null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
