"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth/provider";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

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
          <Image
            src="/caudals_logo_black.svg"
            alt="Caudals logo"
            width={24}
            height={24}
            className="h-6 w-6"
            priority
          />
          <span className="text-xl font-semibold tracking-tight">
            Caudals
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
          <SheetContent
            side="right"
            className="bg-background px-0 pb-0 pt-0 text-foreground"
          >
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border/60 px-6 pb-5 pt-6">
                <Link href="/" className="flex items-center gap-2">
                  <Image
                    src="/caudals_logo_black.svg"
                    alt="Caudals logo"
                    width={24}
                    height={24}
                    className="h-6 w-6"
                    priority
                  />
                  <span className="text-lg font-semibold">Caudals</span>
                </Link>
              </SheetHeader>

              <ScrollArea className="flex-1 px-6">
                <div className="flex flex-col gap-4 py-6">
                  {links.map(({ href, label }) => (
                    <SheetClose asChild key={href}>
                      <Link
                        href={href}
                        className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {label}
                      </Link>
                    </SheetClose>
                  ))}
                </div>
              </ScrollArea>

              {!loading && (
                <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-6">
                  {user ? (
                    <SheetClose asChild>
                      <Button size="sm" asChild className="w-full">
                        <Link href="/dashboard">Dashboard</Link>
                      </Button>
                    </SheetClose>
                  ) : (
                    <>
                      <SheetClose asChild>
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/auth/sign-in">Sign in</Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button size="sm" asChild>
                          <Link href="/auth/sign-up">Sign up</Link>
                        </Button>
                      </SheetClose>
                    </>
                  )}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
