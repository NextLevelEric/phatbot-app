import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <p className="phat-accent text-xs font-bold uppercase tracking-[.2em]">PHATBOT Legal</p>
      <h1 className="mt-2 text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective August 26, 2026</p>

      <div className="mt-8 space-y-7 text-sm leading-7 text-zinc-300">
        <section><h2 className="text-lg font-semibold text-white">What PHATBOT collects</h2><p className="mt-2">PHATBOT may collect account information such as your email address and display name; workout and fitness information you enter or import, including exercises, sets, repetitions, weight, duration, workout history, progressive-overload scores, personal records, and training preferences; coach and athlete connection information and coach feedback; and limited technical information used for reliability and error diagnosis, such as page path, device/browser information, timestamps, and application error details.</p></section>
        <section><h2 className="text-lg font-semibold text-white">How we use information</h2><p className="mt-2">We use this information to create and secure your account, save and analyze training history, calculate progress and performance metrics, provide coach/athlete features, send account or invitation emails, troubleshoot errors, maintain the service, and improve PHATBOT.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Coaches and shared information</h2><p className="mt-2">If you connect with a coach, that coach may be able to view training information and reports associated with your athlete profile and provide feedback through PHATBOT. Access is limited to active coach/athlete relationships supported by the app.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Service providers</h2><p className="mt-2">PHATBOT relies on service providers to operate the app. These currently include Supabase for authentication and database services, Vercel for application hosting, and Resend for transactional email. Those providers may process information as needed to provide their services and are subject to their own privacy and security practices.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Advertising and sale of data</h2><p className="mt-2">PHATBOT does not use your workout information for third-party advertising and does not sell your personal information.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Data retention and deletion</h2><p className="mt-2">We retain account and training information while your account is active or as needed to operate PHATBOT. You can permanently delete your PHATBOT account from the in-app Account area. Account deletion removes your PHATBOT authentication account and associated app data. Limited operational logs or provider backups may remain temporarily according to infrastructure-provider retention and backup processes or when legally required.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Security</h2><p className="mt-2">We use reasonable technical and organizational safeguards, including authenticated access controls and database row-level security. No method of storage or transmission can be guaranteed to be completely secure.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Fitness and health information</h2><p className="mt-2">PHATBOT processes fitness and workout information to provide training and progress features. PHATBOT is not a medical service and is not intended to diagnose, treat, cure, or prevent any medical condition.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Changes to this policy</h2><p className="mt-2">We may update this Privacy Policy as PHATBOT changes. The effective date above will be updated when material revisions are published.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Contact</h2><p className="mt-2">Privacy or account questions can be sent to <a className="phat-accent underline underline-offset-4" href="mailto:eric@nxtlm.com">eric@nxtlm.com</a>.</p></section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3"><Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Dashboard</Link><Link href="/support" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Support</Link></div>
    </main>
  );
}
