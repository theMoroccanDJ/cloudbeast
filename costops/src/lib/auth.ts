import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions, Session } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import GitHubProvider from "next-auth/providers/github";

import { prisma } from "@/lib/db";

type SessionWithOrg = Session & {
  user: NonNullable<Session["user"]> & { orgId: string };
};

const emailServer =
  process.env.EMAIL_SERVER_HOST && process.env.EMAIL_SERVER_USER
    ? {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      }
    : undefined;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
    EmailProvider({
      from: process.env.EMAIL_FROM,
      server: emailServer,
      sendVerificationRequest: async ({ identifier, url }) => {
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.info(`Login link for ${identifier}: ${url}`);
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }

      if (token.sub && typeof token.orgId === "undefined") {
        const membership = await prisma.membership.findFirst({
          where: { userId: token.sub },
          select: { organizationId: true },
        });

        token.orgId = membership?.organizationId ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) {
          session.user.id = token.sub;
        }

        if (typeof token.orgId === "string") {
          session.user.orgId = token.orgId;
        } else {
          delete session.user.orgId;
        }
      }

      return session;
    },
  },
  debug: process.env.NODE_ENV === "development",
};

export function requireOrg(
  session: Session | null | undefined,
): asserts session is SessionWithOrg {
  if (!session?.user?.orgId) {
    throw new Error("User must belong to an organization to access this resource.");
  }
}
