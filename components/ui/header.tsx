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
import { cn } from "@/lib/utils";

interface HeaderProps {
  links?: Array<{ label: string; href: string }>;
  translucent?: boolean;
}

export function Header({ links = [], translucent = false }: HeaderProps) {
  const { user, loading } = useAuth();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-colors",
        translucent
          ? "border-white/40 bg-white/30 backdrop-blur-xl supports-[backdrop-filter]:bg-white/20"
          : "border-border bg-background/80 backdrop-blur-lg",
      )}
    >
      <div className="container mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-4">
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
