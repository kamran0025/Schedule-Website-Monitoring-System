import { sendTemplateEmail } from "./digestEmail.js";
import { escapeHtml } from "./escapeHtml.js";

export interface ListingDigestItem {
  title: string;
  url: string;
  summary: string;
}

export interface ListingDigestInput {
  toEmail: string;
  indexUrl: string;
  items: ListingDigestItem[];
  totalNewCount: number;
  runDate: Date;
}

// Reuses the same dashboard-managed template as sendDigestEmail (title/
// summary/source_url/run_date) but builds `summary` as an HTML bullet
// list instead of a paragraph, so the dashboard template's `{{summary}}`
// placeholder should sit inside a block element (a <div>, not a <p> -
// nesting a <ul> inside a <p> is invalid HTML) to contain it properly.
function buildSummaryHtml(items: ListingDigestItem[], totalNewCount: number): string {
  const rows = items
    .map(
      (item) =>
        `<li style="margin-bottom:12px;">` +
        `<a href="${escapeHtml(item.url)}" style="color:#2563eb;font-weight:600;text-decoration:none;">${escapeHtml(item.title)}</a>` +
        `<br/><span style="color:#333;">${escapeHtml(item.summary)}</span>` +
        `</li>`,
    )
    .join("");

  const omitted = totalNewCount - items.length;
  const omittedNote =
    omitted > 0
      ? `<p style="margin-top:8px;color:#666;font-size:13px;">+ ${omitted} more new post${omitted === 1 ? "" : "s"} not shown here.</p>`
      : "";

  return `<ul style="padding-left:20px;margin:0;">${rows}</ul>${omittedNote}`;
}

export async function sendListingDigestEmail(input: ListingDigestInput): Promise<void> {
  const count = input.totalNewCount;
  const title = `${count} new post${count === 1 ? "" : "s"} on ${input.indexUrl}`;

  await sendTemplateEmail({
    to_email: input.toEmail,
    subject: `Update: ${title}`,
    title,
    summary: buildSummaryHtml(input.items, input.totalNewCount),
    source_url: input.indexUrl,
    run_date: input.runDate.toISOString(),
  });
}
