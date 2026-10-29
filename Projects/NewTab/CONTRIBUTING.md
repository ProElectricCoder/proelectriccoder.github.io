# Contributing to Ampere

Thank you for helping! You can contribute **news** and **add-ons**. Everything is submitted as a pull request and **reviewed by hand by the owner** before it goes live. That review is the real safety net; the rules below make it quick and fair.

> **Using AI is welcome.** You may use ChatGPT, Claude, Copilot or any other tool to write an add-on or a news post. You stay responsible for it: read every line, test it, and tell us it was AI-assisted in the pull request. A ready-made prompt is at the [end of this file](#prompt-for-ai-tools).

## How to submit

1. [Fork](https://github.com/ProElectricCoder/proelectriccoder.github.io/fork) the repository and create a branch.
2. Make your change in `Projects/NewTab/` (see below).
3. Run the checker: `node .github/scripts/check-ampere.js` (needs Node 18+; no installs).
4. Open a pull request. The template asks you to **tick the safety, privacy and security boxes** and to say **how to reach you**. A GitHub Action runs the same checker and fails if a box is not ticked.
5. The owner reviews it and replies in the pull request (or by the contact you gave) with *accepted*, *changes needed* or *rejected*, and why.

**How to be reachable:** GitHub notifications already work for replies on your pull request. You can also put an email or another contact under "Contact" in the template. Remember that the pull request is public: if you don't want your email visible, write "email sent" and email proelectriccoder@gmail.com with the link to your pull request.

By submitting, you confirm you wrote the work (or have the right to share it) and agree that it may be distributed as part of Ampere.

---

## Contributing news

News lives in [`News.json`](News.json) and appears in the News panel. Add an object to `posts`:

```json
{
  "id": "my-addon-launch",
  "date": "2026-10-28",
  "project": "MyAddon",
  "title": "Short, factual title",
  "summary": "One or two plain sentences about what's new.",
  "url": "https://example.com/more-info",
  "author": "your-github-username"
}
```

- `id` is unique; `date` is `YYYY-MM-DD`; `title` ≤ 120 characters; `summary` ≤ 300; `project` ≤ 40.
- `url` and `image` (optional) must be **https**. Images should be around 1200×630.
- `author` is your **GitHub username**. Your name and profile picture appear as a small tag on your post.
- Plain text only: no HTML, no markdown, no emoji spam.
- News must be honest and useful to Ampere users: no advertising, affiliate links, clickbait, or anything misleading. Posts are about Ampere, its add-ons, or developer projects it makes sense to mention.
- Suggestion cards (`cards`) are reserved for the owner.

---

## Contributing an add-on

An add-on is **one JavaScript file** in [`addons/`](addons/) plus an entry in [`addons/addons.json`](addons/addons.json). People install it from Settings → Add-ons; it is downloaded only then.

### 1. The file `addons/YourAddon.js`

```js
// Hello add-on for Ampere: shows a greeting card. (Start with a comment saying what it does.)
export default {
  id: 'hello',                         // lowercase letters, digits, dashes. Must match addons.json
  init(api) {
    const { el, storage } = api;
    const panel = api.createPanel('hello');                 // a card, opened from the button
    const btn = api.addButton({ title: 'Hello', icon: 'M5 12h14', onClick: () => panel.toggle() });
    panel.onOpen = () => {
      panel.card.replaceChildren(el('p', null, 'Hello ' + storage.get('name', 'friend')));
    };
    return { dispose() { panel.close(); btn.remove(); panel.card.remove(); } };   // clean up everything you added
  }
};
```

### 2. The entry in `addons/addons.json`

```json
{ "id": "hello", "name": "Hello", "version": "1.0.0",
  "description": "Says hello. One sentence, 300 characters at most.", "file": "YourAddon.js" }
```

Bump `version` whenever you change the file, so installed copies show an **Update** button.

### The `api` object

| Member | What it does |
| --- | --- |
| `api.el(tag, className, text)` | Creates an element. Text is always inserted as plain text. |
| `api.storage.get(key, fallback)` / `.set(key, value)` | Saves JSON data in the browser. It is included in Settings → Backup. Use this instead of `localStorage`. |
| `api.settings` | An empty element shown inside your add-on's block in Settings → Add-ons. Put your options there. |
| `api.createPanel(id, { width })` | Creates a card (like the Weather card). Returns `{ card, open(), close(), toggle(), onOpen }`. Only one card is open at a time. |
| `api.addButton({ title, icon, onClick })` | Adds a button next to News. `icon` is the `d` of one 24×24 stroke SVG path. Returns the element. |
| `api.addStyle(css)` | Adds CSS. Prefix your class names (for example `.hello-…`) and also style `html[data-theme="light"]`. |
| `api.setBackgroundImage(url)` / `api.clearBackgroundImage()` / `api.backgroundImageUrl()` | Uses an https picture as the page background, goes back to the gradient, or tells you the current picture address. |
| `api.applyAppearance({ theme, top, bottom, direction, power, steps })` | Sets the theme and gradient. `null` restores defaults. |
| `api.weatherCity()` | The city chosen for Weather (`{ name, label, lat, lon }`) or `null`. |

Useful classes already on the page: `setting-row`, `setting-label`, `setting-hint`, `setting-select`, `modal-input`, `btn-link`, `toggle` / `toggle-track` / `toggle-thumb`, `wc-title`, `wc-sub`.

### Rules (checked automatically, and by a person)

**Must**
- Be a **single, readable, un-minified file** under 60 KB.
- Work offline unless it truly needs the internet. Use **https** only, and only the websites you list in the pull request. Prefer services that need **no account and no API key**.
- Collect **only what the feature needs**, keep it in the browser (`api.storage`), and say in the add-on's description if anything leaves the device (for example "sends your city's coordinates to Aladhan").
- Build the page with `api.el` / `textContent`. Treat anything fetched from a website as untrusted text.
- Work in **light and dark** themes, be keyboard-usable, and give buttons an accessible `title` or `aria-label`.
- Remove everything it added in `dispose()`.

**Must not**
- Run code from strings or the internet: `eval`, `new Function`, remote `import`, `<script>`.
- Use `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`.
- Include analytics, tracking, advertising, cookies, fingerprinting, or hidden requests.
- Use `chrome.*` APIs, `localStorage`/`IndexedDB` directly, location, camera, microphone, clipboard or credentials.
- Read or change anything that is not yours: other add-ons' data, the page's shortcuts, or settings (other than through `api`).
- Contain obfuscated code, secrets or API keys.

Add-ons run with the extension's full permissions, which is why these rules and the manual review exist. **Anything suspicious is rejected**, and an accepted add-on can be removed later if it is found to break the rules.

### Test it

1. Serve a copy of the repository's `Projects/NewTab` folder, or load it unpacked in Chrome.
2. In the page's console run `localStorage.addonsInstalled = JSON.stringify({ hello: { name: 'Hello', version: '1.0.0', file: 'YourAddon.js' } })` and reload.
3. Check light and dark themes, Settings → Backup (does your data export?), and **Remove**.
4. Run `node .github/scripts/check-ampere.js`.

---

## What the owner checks

- The code is read line by line, including everything it contacts and everything it stores.
- It does what the description says, and no more.
- It is small, understandable and doesn't break other parts of Ampere.
- The pull request has every safety box ticked and a way to reach you.

Changes may be requested; that is normal and not a rejection. If an add-on is accepted, its entry is merged into `addons.json` and it appears in Settings → Add-ons after the next deploy.

---

## Prompt for AI tools

Copy this into your AI tool, then describe the add-on you want. Paste the result back into your file and **read it before submitting**.

```text
You are writing an add-on for "Ampere", a Chrome new tab extension. Write ONE self-contained
JavaScript ES module file. Follow these rules exactly.

SHAPE
- Start with a // comment saying what the add-on does.
- export default { id: 'my-id', init(api) { ... return { dispose() { ... } }; } };
- id is lowercase letters, digits and dashes.

THE api OBJECT (the only thing you may use from the host page)
- api.el(tag, className, text) creates an element; text is plain text.
- api.storage.get(key, fallback) / api.storage.set(key, value): saved JSON data.
- api.settings: an empty element for this add-on's options in the settings sidebar.
- api.createPanel(id, { width }) -> { card, open(), close(), toggle(), onOpen }.
- api.addButton({ title, icon, onClick }) -> element. icon is the "d" of one 24x24 stroke SVG path.
- api.addStyle(css): add CSS. Prefix class names. Also style html[data-theme="light"].
- api.applyAppearance({ theme, top, bottom, direction, power, steps }), api.weatherCity().
- Existing CSS classes: setting-row, setting-label, setting-hint, setting-select, modal-input,
  btn-link, toggle, toggle-track, toggle-thumb, wc-title, wc-sub.

RULES
- No eval, new Function, remote import, <script>, innerHTML, outerHTML, insertAdjacentHTML,
  document.write, document.cookie, localStorage, IndexedDB, chrome.* APIs, XMLHttpRequest,
  WebSocket, analytics or tracking, clipboard, camera, microphone, location.
- Build UI with api.el and textContent only. Treat fetched data as untrusted text.
- Network: only fetch() over https, only to free public APIs that need no key and allow CORS.
  List every website you contact in a comment at the top.
- Collect only the data the feature needs; keep it in api.storage.
- Works in light and dark themes, keyboard accessible, aria-label or title on buttons.
- dispose() must remove every element, style, timer and listener you added.
- Readable, un-minified, under 60 KB, no secrets.

Also give me the matching entry for addons.json:
{ "id": "...", "name": "...", "version": "1.0.0", "description": "...", "file": "Name.js" }

THE ADD-ON I WANT:
<describe it here>
```
