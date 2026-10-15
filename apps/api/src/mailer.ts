export type Email = { to: string; subject: string; html: string };
export type Mailer = { send(email: Email): Promise<void> };

export const resendMailer = (apiKey: string, from: string): Mailer => ({
  async send(email) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, ...email }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  },
});

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

type Report = {
  overallLevel: string;
  strengths: string[];
  weaknesses: { label: string; quote: string; betterVersion: string }[];
  firstUnit: { title: string; objective: string };
};

export const reportEmail = (to: string, report: Report, webOrigin: string): Email => ({
  to,
  subject: "Your Impromptu Assessment Report",
  html: `<h1>Your English level: ${escape(report.overallLevel)}</h1>
<h2>What's already working</h2>
<ul>${report.strengths.map((s) => `<li>${escape(s)}</li>`).join("")}</ul>
<h2>What to work on</h2>
<ul>${report.weaknesses
    .map((w) => `<li><b>${escape(w.label)}</b><br>You said: "${escape(w.quote)}"<br>Better: "${escape(w.betterVersion)}"</li>`)
    .join("")}</ul>
<h2>Your first Unit: ${escape(report.firstUnit.title)}</h2>
<p>${escape(report.firstUnit.objective)}</p>
<p><a href="${webOrigin}/learn">Start your first Lesson</a></p>`,
});
