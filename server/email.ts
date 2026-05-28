// Magic-link email delivery via Resend (https://resend.com).
//
// Configuration (env vars, set in docker-compose / .env):
//   RESEND_API_KEY   - your Resend API key (required to actually send mail)
//   MAIL_FROM        - From address, e.g. "Parrothead Madness <noreply@erdella.com>"
//   APP_BASE_URL     - public base URL of the app, e.g. "https://buffett.erdella.com"
//                      Used to build the magic-link URL. No trailing slash.
//
// When RESEND_API_KEY is missing the server runs in "dev mode": instead of
// sending an email it logs the magic link to the console so you can test
// locally without real mail delivery.

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM = process.env.MAIL_FROM || "Parrothead Madness <noreply@erdella.com>";

export const mailConfigured = !!RESEND_API_KEY;

if (!mailConfigured) {
  console.warn(
    "\u26a0\ufe0f  RESEND_API_KEY is not set. Magic links will be logged to the " +
      "console instead of emailed. Set RESEND_API_KEY to enable real delivery.",
  );
}

interface SendResult {
  ok: boolean;
  devLink?: string; // populated in dev mode so the API can surface it
  error?: string;
}

function magicEmailHtml(link: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0d1b1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1b1e;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#13262a;border-radius:16px;overflow:hidden;border:1px solid #1f3a40;">
            <tr>
              <td style="padding:32px 32px 8px 32px;text-align:center;">
                <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#f4a43c;font-weight:700;">Parrothead Madness</div>
                <h1 style="margin:12px 0 0 0;font-size:24px;color:#f5f1e6;font-weight:800;">Your sign-in link</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;text-align:center;color:#bcd3cf;font-size:15px;line-height:1.6;">
                Tap the button below to sign in and cast your votes. This link works once and expires in 30 minutes.
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px 32px;text-align:center;">
                <a href="${link}" style="display:inline-block;background:#f4a43c;color:#0d1b1e;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;border-radius:999px;">Sign in &amp; vote</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px 32px;text-align:center;color:#7d9a96;font-size:12px;line-height:1.6;">
                If the button doesn't work, copy this link:<br/>
                <span style="color:#9fc0bb;word-break:break-all;">${link}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;text-align:center;background:#0f2024;color:#5f7c78;font-size:11px;">
                You're receiving this because someone entered this address at Parrothead Madness.<br/>If that wasn't you, just ignore it. Fins up. \ud83c\udf34
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Send a magic-link email. In dev mode (no API key) the link is returned in
 * `devLink` and logged, and no mail is sent.
 */
export async function sendMagicLink(email: string, link: string): Promise<SendResult> {
  if (!mailConfigured) {
    console.log(`\n\u2728 [DEV] Magic link for ${email}:\n${link}\n`);
    return { ok: true, devLink: link };
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [email],
        subject: "Your Parrothead Madness sign-in link",
        html: magicEmailHtml(link),
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(`Resend send failed (${resp.status}): ${text}`);
      return { ok: false, error: `Email provider returned ${resp.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("Resend send threw:", e);
    return { ok: false, error: e?.message ?? "Failed to send email" };
  }
}
