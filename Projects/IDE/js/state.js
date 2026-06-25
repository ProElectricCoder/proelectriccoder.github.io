/**
 * state.js — Shared mutable state for DeepBlue IDE
 * All modules import from here. State is mutated via property assignment.
 */

// ─── Default File System ──────────────────────────────────────────────────────
export function getDefaultFileSystem() {
  return {
    'DeepBlue/player.png': {
      type: 'asset', subtype: 'image',
      src: 'https://placehold.co/100/001122/cyan/png?text=DeepBlue', content: null
    },
    'DeepBlue/logo.svg': {
      type: 'asset', subtype: 'svg',
      content: `<svg fill="none" stroke="#00e5ff" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"></path></svg>`
    },
    'DeepBlue/main.py': {
      type: 'text',
      content: '# Python made by DeepBlue\nprint("Welcome to DeepBlue!")\nname = input("Enter your name: ")\nprint("Hello,", name)'
    },
    'DeepBlue/manifest.json': {
      type: 'text',
      content: '{\n  "name": "DeepBlue IDE",\n  "short_name": "DeepBlue",\n  "start_url": "./"\n}'
    },
    'DeepBlue/Component.jsx': {
      type: 'js',
      content: `const { useState } = React;\n\nfunction App() {\n\tconst [count, setCount] = useState(0);\n\treturn (\n\t\t<div style={{ padding: '2rem', textAlign: 'center', color: '#fff', fontFamily: 'system-ui' }}>\n\t\t\t<h1 style={{ color: '#00e5ff' }}>DeepBlue JSX</h1>\n\t\t\t<button onClick={() => setCount(c => c + 1)}\n\t\t\t\tstyle={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#00e5ff', color: '#0a0e14', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}\n\t\t\t>Count: {count}</button>\n\t\t</div>\n\t);\n}\n\nconst root = ReactDOM.createRoot(document.getElementById('react-root'));\nroot.render(<App />);`
    },
    'DeepBlue/README.md': {
      type: 'text',
      content: `# DeepBlue IDE\n\nA powerful browser-based development environment.\n\n## Features\n- Multi-file editing\n- Live preview\n- GitHub integration\n- AI assistant\n- Encryption\n\n*Built by ProElectricCoder*`
    },
    'DeepBlue/script.js': {
      type: 'js',
      content: `console.log("Welcome to Deep Blue!");\nconsole.info("This is a demo project.");\nconsole.warn("Try editing the files!");\nconsole.info("Run index.html to see the preview.");`
    },
    'DeepBlue/style.css': {
      type: 'css',
      content: `body {\n\tbackground-color: #0a0e14;\n\tdisplay: flex;\n\tjustify-content: center;\n\talign-items: center;\n\theight: 100vh;\n\tmargin: 0;\n\toverflow: hidden;\n\tfont-family: system-ui, sans-serif;\n}\n.card {\n\twidth: 100%;\n\tmax-width: 24rem;\n\taspect-ratio: 16/9;\n\tbackground-color: #111720;\n\tborder-radius: 1rem;\n\tborder: 1px solid rgba(0, 229, 255, 0.3);\n\tdisplay: flex;\n\tflex-direction: column;\n\talign-items: center;\n\tjustify-content: center;\n\tbox-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);\n\ttransition: all 300ms;\n}\n.card:hover {\n\ttransform: translateY(-0.25rem);\n\tbox-shadow: 0 0 40px -10px rgba(0, 229, 255, 0.3);\n}\n.card-title {\n\tfont-size: 1.5rem;\n\tfont-weight: 700;\n\tcolor: white;\n\tmargin: 0;\n}\n.card-subtitle {\n\tcolor: rgba(0, 229, 255, 0.5);\n\tmargin-top: 0.25rem;\n\tfont-weight: 300;\n\tmargin-bottom: 0;\n}`
    },
    'DeepBlue/index.html': {
      type: 'html',
      content: `<!DOCTYPE html>\n<html>\n\t<head>\n\t\t<title>DeepBlue</title>\n\t\t<link rel="stylesheet" href="style.css" />\n\t</head>\n\t<body>\n\t\t<div class="card">\n\t\t\t<h2 class="card-title">Deep Blue</h2>\n\t\t\t<p class="card-subtitle">Code comfortably</p>\n\t\t</div>\n\t\t<script src="script.js"><\/script>\n\t</body>\n</html>`
    },
	'DeepBlue/ElectronCSS.html': {
		type: 'html',
		content: '<!DOCTYPE html>\n<html>\n\t<head>\n\t\t<title>ElectronCSS Showcase</title>\n\t\t<link rel="stylesheet" href="style.css" />\n\t\t<style>body { gap: 2rem; flex-wrap: wrap; }</style>\n\t</head>\n\t<body>\n\t\t<div class="card" id="firestorm-card">\n\t\t\t<h2 class="card-title">FireStorm</h2>\n\t\t\t<p class="card-subtitle">Dynamic symmetrical noise backdrop</p>\n\t\t</div>\n\t\t<div class="card" id="gradient-card">\n\t\t\t<h2 class="card-title">CubicGradient</h2>\n\t\t\t<p class="card-subtitle">Smoothed, mathematical easing stops</p>\n\t\t</div>\n\t\t<script type="module">\n\t\t\timport { cubicGradient } from \'https://proelectriccoder.github.io/ElectronCSS/CubicGradient.js\';\n\t\t\timport { fireStorm } from \'https://proelectriccoder.github.io/ElectronCSS/FireStorm.js\';\n\t\t\tfireStorm({\n\t\t\t\tdirection: \'to bottom right\',\n\t\t\t\tfrom: \'#00e5ff\',\n\t\t\t\tto: \'#000044\',\n\t\t\t\tsteps: 16,\n\t\t\t\tchaos: 0.7,\n\t\t\t\tsmoothing: 8\n\t\t\t});\n\t\t\tdocument.getElementById(\'gradient-card\').style.background = cubicGradient({\n\t\t\t\tdirection: \'135deg\',\n\t\t\t\tstart: \'#ffffff1a\',\n\t\t\t\tend: \'#ffffff00\',\n\t\t\t\tsteps: 24,\n\t\t\t\tpower: 2\n\t\t\t}).css;\n\t\t\tdocument.getElementById(\'firestorm-card\').style.background = cubicGradient({\n\t\t\t\tdirection: \'45deg\',\n\t\t\t\tstart: \'#ff00551a\',\n\t\t\t\tend: \'#00000044\',\n\t\t\t\tsteps: 24,\n\t\t\t\tpower: 3\n\t\t\t}).css;\n\t\t<\/script>\n\t</body>\n</html>'
	}
  };
}

// ─── Global State Object ──────────────────────────────────────────────────────
export const S = {
  // ─ File system
  fileSystem:          getDefaultFileSystem(),
  explicitFolders:     ['DeepBlue'],
  folderStates:        {},          // path → boolean (open/closed)
  importedRepoFolders: [],
  deletedFiles:        [],

  // ─ Editor
  cmEditor:        null,            // CodeMirror instance (set in editor.js)
  activeFile:      null,
  openEditorTabs:  [],
  editorDocs:      {},              // filename → CodeMirror.Doc
  unlockedKeys:    {},              // filename → { password, keyPath }
  isSwitchingFile: false,
  unsavedChanges:  false,

  // ─ Project persistence
  projectHandle: null,              // FileSystemDirectoryHandle

  // ─ UI flags
  targetFolderForAdd: '',
  ctxTarget: null,
  ctxType:   null,
  activeTabId: null,                // current preview tab id
  openTabs:    [],                  // preview tabs
  viewMode:    'responsive',

  // ─ Console (split panel under preview)
  activeConsoleTab: 'system',       // 'system' or a preview tab id (file path)

  // ─ Search
  lastSearchQuery: null,
  searchCursor:    null,

  // ─ Auto-run (Settings toggle) — silently refreshes an already-open HTML/MD
  //   preview tab on edit, in place, with no iframe-swap flash. See preview.js.
  autoRun: localStorage.getItem('deepBlue_autorun') === '1',

  // ─ GitHub
  githubToken: localStorage.getItem('deepBlue_gh_token') || '',
  githubRepos: (() => {
    try { return JSON.parse(localStorage.getItem('deepBlue_gh_repos') || '{}'); } catch { return {}; }
  })(),

  // ─ Firebase
  firebaseApp:  null,
  firebaseAuth: null,

  // ─ Python
  pythonPollTimer: null,
};

// ─── Firebase Config ───────────────────────────────────────────────────────────
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC_v49m7e5xt-FCWs0DSq7aGU7gD1aiTh4",
  authDomain: "proelectriccoder.firebaseapp.com",
  projectId: "proelectriccoder",
  storageBucket: "proelectriccoder.firebasestorage.app",
  messagingSenderId: "629115974151",
  appId: "1:629115974151:web:636737d123e4e8685c70a2",
  measurementId: "G-WEXXNE0J6Q"
};