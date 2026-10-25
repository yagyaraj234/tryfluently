export type Email = { to: string; subject: string; html: string; text?: string; headers?: Record<string, string> };
export type Mailer = { send(email: Email, idempotencyKey?: string): Promise<void> };

export const resendMailer = (apiKey: string, from: string): Mailer => ({
  async send(email, idempotencyKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
      },
      body: JSON.stringify({ from, ...email }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  },
});

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

// Every email shares the brand panel: a cobalt header, a white body and one cobalt button.
// Inline styles and layout tables keep it readable in email clients without app CSS or remote images.
// Callers escape untrusted text in `title` and `body`.
function layout(e: { title: string; preview: string; eyebrow: string; body: string; footer: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e.title}</title></head>
<body style="margin:0;background:#f5f5f4;color:#0e0e0f;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">
<div style="display:none;max-height:0;overflow:hidden">${e.preview}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e4e3df;border-radius:16px;border-collapse:separate;overflow:hidden">
<tr><td bgcolor="#2f3bd6" style="padding:24px;background:#2f3bd6;background-image:linear-gradient(160deg,#4466e0,#2f3bd6);color:#ffffff;border-radius:15px 15px 0 0">
<p style="margin:0;font-size:12px;font-weight:bold;letter-spacing:1px;color:#dfe5ff">${e.eyebrow}</p><h1 style="margin:10px 0 0;font-size:26px;line-height:1.25;color:#ffffff">${e.title}</h1></td></tr>
<tr><td style="padding:24px">${e.body}</td></tr></table>
<p style="max-width:600px;margin:16px auto 0;font-size:13px;color:#66655f">${e.footer}</p>
</td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escape(href)}" style="display:inline-block;background:#2f3bd6;color:#ffffff;border-radius:999px;padding:13px 24px;font-weight:bold;text-decoration:none">${label}</a></p>`;
const fallbackLink = (href: string) =>
  `<p style="font-size:14px;color:#66655f">If the button doesn't work, open <a href="${escape(href)}" style="color:#2f3bd6;word-break:break-all">${escape(href)}</a>.</p>`;

export function verificationEmail(to: string, url: string): Email {
  return {
    to,
    subject: "Verify your Fluently email",
    text: `Verify your email to start using Fluently: ${url}\n\nIf you didn't create an account, you can ignore this email.`,
    html: layout({
      title: "Confirm your email",
      preview: "Verify your email to start using Fluently.",
      eyebrow: "FLUENTLY",
      body: `<p style="margin:0">Tap the button to verify your email and start using Fluently.</p>${button(url, "Verify email")}${fallbackLink(url)}`,
      footer: "If you didn't create a Fluently account, you can ignore this email.",
    }),
  };
}

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
  const skills = Object.entries(report.skills).map(
    ([skill, value]) =>
      `${skill[0]!.toUpperCase()}${skill.slice(1)}: ${value ? `${value.score}/100 · ${value.level}` : "Not measured yet"}`,
  );
  const partial = report.partial ? "This is a partial Report, based on the answers you gave before leaving." : "";
  const text = [
    `Your English level: ${report.overallLevel}`,
    partial,
    ...skills,
    "What's already working",
    ...report.strengths.map((s) => `• ${s}`),
    "What to work on",
    ...report.weaknesses.map((w) => `${w.label}\nYou said: ${w.quote}\nBetter: ${w.betterVersion}`),
    `Your first Unit: ${report.firstUnit.title}`,
    report.firstUnit.objective,
    `Start your first Lesson: ${home}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const h2 = (t: string) => `<h2 style="margin:24px 0 8px;font-size:19px">${t}</h2>`;
  return {
    to,
    subject: "Your Fluently Assessment Report",
    text,
    html: layout({
      title: `Your English level: ${escape(report.overallLevel)}`,
      preview: `Your ${escape(report.overallLevel)} Assessment Report, strengths and next steps.`,
      eyebrow: "YOUR ASSESSMENT REPORT",
      body: `${partial ? `<p style="margin:0 0 16px">${escape(partial)}</p>` : ""}
${h2("Your skills").replace("margin:24px", "margin:0")}<ul style="margin:0;padding-left:20px">${skills.map((s) => `<li>${escape(s)}</li>`).join("")}</ul>
${h2("What's already working")}<ul style="margin:0;padding-left:20px">${report.strengths.map((s) => `<li>${escape(s)}</li>`).join("")}</ul>
${h2("What to work on")}
${report.weaknesses.map((w) => `<p style="margin:0 0 12px;padding:14px;background:#e3eaff;border-radius:12px"><strong>${escape(w.label)}</strong><br>You said: “${escape(w.quote)}”<br>Better: “${escape(w.betterVersion)}”</p>`).join("")}
${h2(`Your first Unit: ${escape(report.firstUnit.title)}`)}<p style="margin:0">${escape(report.firstUnit.objective)}</p>
${button(home, "Start your first Lesson")}
<p style="font-size:14px;color:#66655f">Confirm your Goals first if prompted. Your Roadmap follows from them.</p>
${fallbackLink(home)}`,
      footer: "You received this because you completed your first Fluently Assessment.",
    }),
  };
}

type Week = { day: string; practised: boolean; today: boolean }[];

export function streakReminderEmail(
  to: string,
  r: { streak: number; hoursLeft: number; week: Week },
  webOrigin: string,
  unsubscribeUrl: string,
): Email {
  const home = new URL("/", webOrigin).href;
  const days = `${r.streak}-day Streak`;
  const left = `About ${r.hoursLeft} ${r.hoursLeft === 1 ? "hour" : "hours"} left today. One Lesson keeps your Streak going.`;
  const dot = (d: Week[number]) => {
    const letter = "MTWTFSS"[(new Date(d.day).getUTCDay() + 6) % 7];
    const look = d.practised
      ? "background:#2f3bd6;color:#ffffff;border:2px solid #2f3bd6"
      : d.today
        ? "background:#ffffff;color:#2f3bd6;border:2px dashed #2f3bd6"
        : "background:#ffffff;color:#8f8e88;border:2px solid #dcdee3";
    return `<td align="center" style="padding:0 3px"><div style="width:32px;height:32px;line-height:28px;border-radius:16px;box-sizing:border-box;font-size:13px;font-weight:bold;${look}">${d.practised ? "✓" : letter}</div><div style="margin-top:4px;font-size:11px;color:#66655f">${d.today ? "Today" : letter}</div></td>`;
  };
  return {
    to,
    subject: `${r.hoursLeft} ${r.hoursLeft === 1 ? "hour" : "hours"} left to keep your ${days}`,
    text: `Your ${days} ends at midnight.\n\n${left}\n\nKeep my Streak: ${home}\n\nStop Streak reminders: ${unsubscribeUrl}`,
    // One-click unsubscribe (RFC 8058), so mail apps can show their own unsubscribe button.
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    html: layout({
      title: `Your ${days} ends at midnight`,
      preview: left,
      eyebrow: "YOUR STREAK",
      body: `<p style="margin:0 0 16px">${left}</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr>${r.week.map(dot).join("")}</tr></table>
${button(home, "Keep my Streak")}${fallbackLink(home)}`,
      footer: `You get this only on days your Streak is at risk. <a href="${escape(unsubscribeUrl)}" style="color:#66655f">Stop Streak reminders</a>`,
    }),
  };
}
