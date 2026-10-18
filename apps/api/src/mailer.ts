export type Email = { to: string; subject: string; html: string; text?: string };
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
  partial?: boolean;
  skills: Record<"fluency" | "grammar" | "vocabulary", { score: number; level: string } | null>;
  strengths: string[];
  weaknesses: { label: string; quote: string; betterVersion: string }[];
  firstUnit: { title: string; objective: string };
};

export function reportEmail(to: string, report: Report, webOrigin: string): Email {
  // Home first confirms proposed Goals, then offers the Learner's first Lesson.
  const home = new URL("/", webOrigin).href;
  const skills = Object.entries(report.skills).map(([skill, value]) =>
    `${skill[0]!.toUpperCase()}${skill.slice(1)}: ${value ? `${value.score}/100 · ${value.level}` : "Not measured yet"}`,
  );
  const partial = report.partial ? "This is a partial Report, based on the answers you gave before leaving." : "";
  const text = [
    `Your English level: ${report.overallLevel}`, partial, ...skills,
    "What's already working", ...report.strengths.map((s) => `• ${s}`),
    "What to work on", ...report.weaknesses.map((w) => `${w.label}\nYou said: ${w.quote}\nBetter: ${w.betterVersion}`),
    `Your first Unit: ${report.firstUnit.title}`, report.firstUnit.objective, `Start your first Lesson: ${home}`,
  ].filter(Boolean).join("\n\n");
  // Inline styles and layout tables keep the Report readable in email clients without app CSS or remote images.
  return {
    to,
    subject: "Your Impromptu Assessment Report",
    text,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your Impromptu Assessment Report</title></head>
<body style="margin:0;background:#f2f5ea;color:#111111;font-family:Arial,sans-serif;font-size:17px;line-height:1.6">
<div style="display:none;max-height:0;overflow:hidden">Your ${escape(report.overallLevel)} Assessment Report, strengths and next steps.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:2px solid #111111;border-radius:12px"><tr><td style="padding:24px;background:#c6f432;border-bottom:2px solid #111111">
<p style="margin:0;font-weight:bold">IMPROMPTU · YOUR ASSESSMENT REPORT</p><h1 style="margin:12px 0 0;font-size:28px">Your English level: ${escape(report.overallLevel)}</h1></td></tr>
<tr><td style="padding:24px">
${partial ? `<p>${escape(partial)}</p>` : ""}
<h2 style="font-size:21px">Your skills</h2><ul>${skills.map((s) => `<li>${escape(s)}</li>`).join("")}</ul>
<h2 style="font-size:21px">What's already working</h2><ul>${report.strengths.map((s) => `<li>${escape(s)}</li>`).join("")}</ul>
<h2 style="font-size:21px">What to work on</h2>
${report.weaknesses.map((w) => `<p><strong>${escape(w.label)}</strong><br>You said: “${escape(w.quote)}”<br>Better: “${escape(w.betterVersion)}”</p>`).join("")}
<h2 style="font-size:21px">Your first Unit: ${escape(report.firstUnit.title)}</h2><p>${escape(report.firstUnit.objective)}</p>
<p><a href="${escape(home)}" style="display:inline-block;background:#6a3df0;color:#ffffff;border:2px solid #111111;border-radius:12px;padding:12px 20px;font-weight:bold">Start your first Lesson</a></p>
<p style="font-size:15px">Confirm your Goals first if prompted. Your Roadmap follows from them.</p>
<p style="font-size:15px">If the button doesn't work, open <a href="${escape(home)}">${escape(home)}</a>.</p>
</td></tr></table><p style="font-size:15px">You received this because you completed your first Impromptu Assessment.</p>
</td></tr></table></body></html>`,
  };
}
