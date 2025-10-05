"use client";

import Link from "next/link";
import { Menu, Telescope } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth/provider";

interface HeaderProps {
  links?: Array<{ label: string; href: string }>;
}

export function Header({ links = [] }: HeaderProps) {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2">
          <Telescope className="h-5 w-5" />
          <span className="text-xl font-semibold tracking-tight">
            Collective
          </span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </Link>
          ))}

          {!loading && (
            <>
              {user ? (
                <Button size="sm" asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button size="sm" asChild variant="outline">
                    <Link href="/auth/sign-in">Sign in</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/auth/sign-up">Sign up</Link>
                  </Button>
                </>
              )}
            </>
          )}
        </nav>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="bg-background">
            <SheetHeader>
              <span className="text-lg font-semibold">Collective</span>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-3">
              {links.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {label}
                </Link>
              ))}
              {!loading && (
                <>
                  {user ? (
                    <Button size="sm" variant="default" asChild>
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/auth/sign-in">Sign in</Link>
                      </Button>
                      <Button size="sm" variant="default" asChild>
                        <Link href="/auth/sign-up">Sign up</Link>
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
