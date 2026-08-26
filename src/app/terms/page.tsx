import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <p className="phat-accent text-xs font-bold uppercase tracking-[.2em]">PHATBOT Legal</p>
      <h1 className="mt-2 text-3xl font-bold">Terms of Use</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective August 26, 2026</p>

      <div className="mt-8 space-y-7 text-sm leading-7 text-zinc-300">
        <section><h2 className="text-lg font-semibold text-white">Using PHATBOT</h2><p className="mt-2">PHATBOT provides workout planning, training-history, performance-analysis, progressive-overload, personal-record, reporting, and coach/athlete communication tools. By creating or using a PHATBOT account, you agree to use the service lawfully and in accordance with these Terms.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Fitness information is not medical advice</h2><p className="mt-2">PHATBOT provides fitness and training information, not medical diagnosis or treatment. Training scores, trends, suggestions, reports, and coach communications are informational tools. You are responsible for deciding whether an exercise or training program is appropriate for you. Seek qualified medical guidance when needed, particularly before beginning or changing a training program if you have health concerns.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Your account and data</h2><p className="mt-2">You are responsible for maintaining the confidentiality of your account credentials and for the information entered or imported into your account. You should provide accurate information when accuracy matters to PHATBOT's analysis. You may permanently delete your account using the in-app account-deletion feature.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Coach relationships</h2><p className="mt-2">PHATBOT may allow athletes and coaches to connect and share training information. A coach's advice, programming, comments, or other content is provided by that coach, not guaranteed by PHATBOT. Athletes and coaches are responsible for their own professional and training relationships.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Acceptable use</h2><p className="mt-2">You may not attempt to gain unauthorized access to another user's information, interfere with PHATBOT's operation or security, use the service for unlawful activity, introduce malicious code, or misuse another person's account or identity.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Availability and changes</h2><p className="mt-2">PHATBOT may change, add, remove, suspend, or improve features over time. We work to keep the service reliable, but uninterrupted or error-free availability is not guaranteed. Features may change as PHATBOT is updated.</p></section>
        <section><h2 className="text-lg font-semibold text-white">No guarantee of results</h2><p className="mt-2">Training outcomes vary by person. PHATBOT does not guarantee strength gains, weight loss, injury prevention, athletic performance, or any other fitness result.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Limitation of liability</h2><p className="mt-2">To the maximum extent permitted by applicable law, PHATBOT is provided on an as-is and as-available basis. PHATBOT and its operators are not responsible for indirect, incidental, special, consequential, or exemplary damages arising from use of the service. Nothing in these Terms excludes rights or liabilities that cannot legally be excluded.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Termination</h2><p className="mt-2">We may restrict or terminate access when an account is used unlawfully, threatens the security or operation of PHATBOT, or materially violates these Terms. You may stop using PHATBOT at any time and may delete your account in the app.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Changes to these Terms</h2><p className="mt-2">We may update these Terms as PHATBOT evolves. The effective date above will be updated when revised Terms are published. Continued use after an update constitutes acceptance of the updated Terms to the extent permitted by law.</p></section>
        <section><h2 className="text-lg font-semibold text-white">Contact</h2><p className="mt-2">Questions about these Terms can be sent to <a className="phat-accent underline underline-offset-4" href="mailto:eric@nxtlm.com">eric@nxtlm.com</a>.</p></section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3"><Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Dashboard</Link><Link href="/privacy" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Privacy Policy</Link></div>
    </main>
  );
}
