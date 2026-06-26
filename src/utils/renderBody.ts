// Simple HTML escape
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Simple URL regex linkifier
const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

export function renderBody(text: string): string {
  const escaped = escapeHtml(text);
  // Replace newlines with <br>
  const withLineBreaks = escaped.replace(/\n/g, '<br>');
  // Linkify URLs
  return withLineBreaks.replace(URL_REGEX, (url) => {
    const safeUrl = url.replace(/"/g, '&quot;');
    return `<a href="${safeUrl}" rel="noopener noreferrer" target="_blank">${url}</a>`;
  });
}
