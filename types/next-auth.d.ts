import type { UserRole, PlanTier } from "@/lib/access";

// Module augmentation for next-auth — adds the custom fields we put on the JWT/session
// in pages/api/auth/[...nextauth].ts (id, role, isPaid, orgId). Without this every read
// of session.user.id etc. needs a `// @ts-expect-error` cast.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: UserRole;
      isPaid: boolean;
      orgId: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name?: string | null;
    role: UserRole;
    isPaid: boolean;
    orgId: string | null;
    plan?: PlanTier;
  }
}
