import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-background via-background to-secondary/40 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Welcome to costops</h1>
      <p className="max-w-2xl text-muted-foreground">
        Jumpstart your cost operations with a modern Next.js 14 stack powered by Tailwind CSS, shadcn/ui, Prisma, and NextAuth.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Button asChild>
          <Link href="/api/auth/signin">Sign in</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="https://nextjs.org/docs">Learn more</Link>
        </Button>
      </div>
    </main>
  );
}
