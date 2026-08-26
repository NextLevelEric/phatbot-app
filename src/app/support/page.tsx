import Link from "next/link";

export default function SupportPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <p className="phat-accent text-xs font-bold uppercase tracking-[.2em]">PHATBOT Support</p>
      <h1 className="mt-2 text-3xl font-bold">Need help?</h1>
      <p className="mt-3 leading-7 text-zinc-300">For account access, workout data, coach connections, imports, reports, or other PHATBOT support questions, email us and include the email address associated with your PHATBOT account plus a short description of what happened.</p>

      <a href="mailto:eric@nxtlm.com?subject=PHATBOT%20Support" className="phat-accent-bg mt-7 inline-block rounded-lg px-5 py-3 font-semibold">Email PHATBOT Support</a>
      <p className="mt-3 text-sm text-zinc-500">eric@nxtlm.com</p>

      <section className="mt-8 rounded-2xl border border-zinc-800 p-5">
        <h2 className="text-lg font-semibold">Account deletion</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">You do not need to contact support to delete your account. Signed-in users can permanently delete their PHATBOT account and associated app data from the in-app account controls.</p>
        <Link href="/account/delete" className="mt-4 inline-block text-sm font-semibold underline decoration-zinc-600 underline-offset-4">Delete Account</Link>
      </section>

      <div className="mt-10 flex flex-wrap gap-3"><Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Dashboard</Link><Link href="/privacy" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Privacy Policy</Link><Link href="/terms" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Terms of Use</Link></div>
    </main>
  );
}
