/** A Caudals-owned HTTPS target for production browser acceptance. It has no
 * customer data, external requests, persistence, or live side effects. */
export async function GET() {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>Caudals synthetic chatbot fixture</title></head><body>
<main><h1>Caudals synthetic chatbot fixture</h1>
<form><label for="question">Question</label><textarea id="question" required></textarea>
<button type="submit">Send</button></form>
<div id="busy" role="status" hidden>Working</div><div role="log" aria-live="polite"></div>
</main><script>
const form = document.querySelector('form');
const busy = document.querySelector('#busy');
const log = document.querySelector('[role="log"]');
form.addEventListener('submit', event => {
  event.preventDefault();
  const question = document.querySelector('#question').value;
  busy.hidden = false;
  const answer = document.createElement('p');
  answer.dataset.messageAuthorRole = 'assistant';
  log.append(answer);
  setTimeout(() => { answer.textContent = 'Partial synthetic answer'; }, 150);
  setTimeout(() => {
    answer.textContent = 'Synthetic answer: ' + question;
    busy.hidden = true;
  }, 1200);
});
</script></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    },
  });
}
