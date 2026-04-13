# Deep Blue Editor

A powerful, fully-featured, browser-based IDE packed into a single HTML file.

Deep Blue is designed for developers who want a frictionless coding experience. It runs entirely in your browser with zero build steps, node modules, or servers required. Write HTML, CSS, vanilla JS, or even React JSX, and preview it instantly.

## Features

### Standalone JSX & React Support

Write .jsx files without setting up Webpack or Vite. Deep Blue uses an on-the-fly Babel transpiler to automatically compile and mount your React components into a virtual HTML shell. Just click "Run" and watch your UI come to life.

### Deep GitHub Integration

* Lazy-Load Repositories: Import entire GitHub repositories instantly. Deep Blue maps the file structure and only downloads file contents when you actively open them, saving massive amounts of RAM and local storage.

* Direct Commits: Connect your GitHub account (via Firebase Auth) to push your changes directly back to your repository.

### Advanced Code Editor

* Powered by Ace Editor, featuring:

* Syntax highlighting for HTML, CSS, JS, JSX, JSON, and Markdown.

* Auto-completion and snippets.

* Built-in code formatting via Prettier.

* Global Find & Replace (Ctrl+F).

### Live Preview & Device Testing

* Real-time preview pane that renders your code dynamically.

* Toggle between Desktop, Tablet, and Mobile viewport sizes.

* Interactive zooming and a full-screen mode.

* Built-in Web Console to view logs, warnings, errors, and execute JavaScript directly against your running app.

### Gemini AI Assistant

Stuck on a bug? Need boilerplate? Open the AI sidebar, enter your Gemini API key, and chat directly with Google's Gemini model. The AI can read your active file and generate code blocks that you can inject with a single click.

### Robust File Management

* Drag & Drop: Drop files or whole folders directly into the browser to import them.

* Virtual File System: Create files, nested folders, rename, and delete assets seamlessly.

* Rich Asset Support: Natively handles .png, .jpg, .svg, .mp3, .mp4, .pdf, and more.

* Markdown Rendering: .md files are automatically parsed into beautiful, styled HTML when executed.

### Export & Sharing

* Save Locally: Uses the modern File System Access API to save files directly to a folder on your machine.

* ZIP Export: Download your entire project as a .zip file.

* Share via Data URL: Compress your entire project into a self-extracting HTML Data URL. Copy it to your clipboard and send it to anyone—they can open your whole app in their browser from a single link!

### Tech Stack

Deep Blue is a feat of client-side engineering, utilizing:

* Ace Editor: Core code editing.

* Babel Standalone: In-browser JSX transpilation.

* React & ReactDOM: Injected dynamically for JSX execution.

* Prettier: Code formatting.

* Marked.js: Markdown parsing.

* JSZip & FileSaver: Archiving and downloading.

* Firebase: Authentication for GitHub API access.

* Lucide: Beautiful, crisp SVG icons.

### Getting Started

This IDE is not meant to be downloaded or configured locally right now. It is hosted online and ready to use!

You can access and start coding directly from your browser on [my IDE webpage](https://proelectriccoder.github.io/Projects/IDE)

*Just a humble masterpiece, casually built by **ProElectricCoder***

> *Note: My IDE will have many things that are fun to find!*
