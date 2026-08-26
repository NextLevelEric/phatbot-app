import Link from "next/link";

export default function AppFooter() {
  return (
    <footer className="mx-auto w-full max-w-2xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-8 text-center text-xs text-zinc-600 sm:px-6">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Link href="/account" className="hover:text-zinc-300">Account</Link>
        <Link href="/account/delete" className="hover:text-zinc-300">Delete Account</Link>
      </div>
      <p className="mt-3">PHATBOT strength performance tracking</p>
    </footer>
  );
}
