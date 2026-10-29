// Exam Master add-on for Ampere: pick an exam board, level, subject, year, series and paper step by step,
// then open a targeted search for that exact paper (and the board's official site).
// It contacts nothing by itself: it only builds links that open when you click them (google.com search, board websites).
const ICON = 'M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5';

// code = the board's syllabus/specification code (only where it is certain). Series: key, label, Cambridge file letter.
const SERIES = {
	cie: [['m', 'February / March', 'm'], ['s', 'May / June', 's'], ['w', 'October / November', 'w']],
	three: [['jan', 'January', ''], ['jun', 'May / June', ''], ['nov', 'October / November', '']],
	uk: [['jun', 'May / June', ''], ['nov', 'November', '']]
};
const BOARDS = {
	cie: {
		name: 'Cambridge (CIE)', site: 'https://www.cambridgeinternational.org/', domain: 'cambridgeinternational.org', series: 'cie',
		levels: {
			igcse: ['IGCSE', [
				['Mathematics', '0580'], ['Additional Mathematics', '0606'], ['Biology', '0610'], ['Chemistry', '0620'], ['Physics', '0625'],
				['Combined Science', '0653'], ['Co-ordinated Sciences (Double)', '0654'], ['Computer Science', '0478'], ['ICT', '0417'],
				['English – First Language', '0500'], ['English – Literature', '0475'], ['English as a Second Language', '0510'],
				['Business Studies', '0450'], ['Economics', '0455'], ['Accounting', '0452'], ['Geography', '0460'], ['History', '0470'],
				['Sociology', '0495'], ['Islamiyat', '0493'], ['Pakistan Studies', '0448'], ['Environmental Management', '0680'], ['Physical Education', '0413'],
				['Art & Design', '0400'], ['Music', '0410'], ['Drama', '0411'], ['French', '0520']]],
			olevel: ['O Level', [
				['Mathematics (Syllabus D)', '4024'], ['Additional Mathematics', '4037'], ['Biology', '5090'], ['Chemistry', '5070'], ['Physics', '5054'],
				['Computer Science', '2210'], ['Economics', '2281'], ['English Language', '1123'], ['Geography', '2217'], ['Principles of Accounts', '7110'], ['Business Studies', '7115']]],
			alevel: ['AS & A Level', [
				['Mathematics', '9709'], ['Further Mathematics', '9231'], ['Biology', '9700'], ['Chemistry', '9701'], ['Physics', '9702'],
				['Computer Science', '9618'], ['Information Technology', '9626'], ['Economics', '9708'], ['Business', '9609'], ['Accounting', '9706'],
				['English Language', '9093'], ['English Literature', '9695'], ['Geography', '9696'], ['History', '9489'], ['Psychology', '9990'],
				['Sociology', '9699'], ['Law', '9084'], ['Global Perspectives & Research', '9239'], ['Art & Design', '9479']]]
		}
	},
	oxfordaqa: {
		name: 'OxfordAQA', site: 'https://www.oxfordaqa.com/', domain: 'oxfordaqa.com', series: 'three',
		levels: {
			igcse: ['International GCSE', [
				['Mathematics'], ['Biology'], ['Chemistry'], ['Physics'], ['English Language'], ['English Literature'], ['Business'], ['Economics'], ['Geography'], ['History'],
				['Computer Science'], ['Accounting'], ['Psychology'], ['Sociology'], ['English as a Second Language']]],
			ial: ['International AS & A-level', [
				['Mathematics'], ['Further Mathematics'], ['Biology'], ['Chemistry'], ['Physics'], ['English Language'], ['English Literature'],
				['Business'], ['Economics'], ['Geography'], ['History'], ['Computer Science'], ['Psychology'], ['Sociology']]]
		}
	},
	edexcel: {
		name: 'Pearson Edexcel', site: 'https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html', domain: 'qualifications.pearson.com', series: 'three',
		levels: {
			igcse: ['International GCSE', [
				['Mathematics A', '4MA1'], ['Mathematics B', '4MB1'], ['Biology', '4BI1'], ['Chemistry', '4CH1'], ['Physics', '4PH1'],
				['English Language A', '4EA1'], ['English Language B', '4EB1'], ['English Literature', '4ET1'], ['Economics', '4EC1'], ['Business', '4BS1'],
				['Computer Science', '4CP0'], ['ICT', '4IT1'], ['Geography', '4GE1'], ['History', '4HI1'], ['Accounting', '4AC1']]],
			ial: ['International Advanced Level (IAL)', [
				['Mathematics'], ['Further Mathematics'], ['Pure Mathematics'], ['Biology'], ['Chemistry'], ['Physics'], ['Economics'], ['Business'],
				['Accounting'], ['Information Technology'], ['Geography'], ['History'], ['English Language'], ['English Literature']]],
			gcse: ['GCSE (UK)', [
				['Mathematics', '1MA1'], ['Biology', '1BI0'], ['Chemistry', '1CH0'], ['Physics', '1PH0'], ['Combined Science', '1SC0'],
				['English Language', '1EN0'], ['English Literature', '1ET0'], ['History', '1HI0'], ['Business', '1BS0'], ['Computer Science', '1CP2']]],
			alevel: ['A Level (UK)', [
				['Mathematics', '9MA0'], ['Further Mathematics', '9FM0'], ['Biology', '9BI0'], ['Chemistry', '9CH0'], ['Physics', '9PH0'],
				['Economics', '9EC0'], ['Business', '9BS0'], ['History', '9HI0'], ['Geography', '9GE0']]]
		}
	},
	aqa: {
		name: 'AQA', site: 'https://www.aqa.org.uk/find-past-papers-and-mark-schemes', domain: 'aqa.org.uk', series: 'uk',
		levels: {
			gcse: ['GCSE', [['Mathematics'], ['Biology'], ['Chemistry'], ['Physics'], ['Combined Science: Trilogy'], ['English Language'], ['English Literature'], ['History'], ['Geography'], ['Computer Science'], ['Business'], ['Religious Studies']]],
			alevel: ['A-level', [['Mathematics'], ['Further Mathematics'], ['Biology'], ['Chemistry'], ['Physics'], ['Computer Science'], ['Economics'], ['Business'], ['History'], ['Geography'], ['Psychology'], ['Sociology'], ['English Language'], ['English Literature']]]
		}
	},
	ocr: {
		name: 'OCR', site: 'https://www.ocr.org.uk/qualifications/past-paper-finder/', domain: 'ocr.org.uk', series: 'uk',
		levels: {
			gcse: ['GCSE', [['Mathematics'], ['Biology'], ['Chemistry'], ['Physics'], ['Gateway Science'], ['English Language'], ['English Literature'], ['History'], ['Geography'], ['Computer Science']]],
			alevel: ['A Level', [['Mathematics A'], ['Mathematics B (MEI)'], ['Further Mathematics'], ['Biology'], ['Chemistry'], ['Physics'], ['Computer Science'], ['Economics'], ['Business'], ['History'], ['Geography'], ['Psychology']]]
		}
	}
};
const DOCS = [['qp', 'Question paper', 'question paper'], ['ms', 'Mark scheme', 'mark scheme'], ['er', 'Examiner report', 'examiner report']];

const CSS = `
.em-crumbs { font-size: 0.74rem; opacity: 0.75; line-height: 1.6; padding-right: 22px; margin-bottom: 8px; }
.em-crumbs b { font-weight: 600; opacity: 1; }
.em-step { font-weight: 600; margin: 4px 0 8px; }
.em-grid { display: flex; flex-wrap: wrap; gap: 6px; max-height: 44vh; overflow-y: auto; padding-right: 2px; }
.em-opt { padding: 8px 11px; border: 0; border-radius: 9px; background: rgba(255,255,255,0.09); color: inherit; font: inherit; font-size: 0.82rem; cursor: pointer; text-align: left; }
.em-opt:hover { background: rgba(80,140,255,0.4); }
.em-opt small { opacity: 0.6; margin-left: 4px; }
.em-nav { display: flex; gap: 6px; margin-top: 10px; }
.em-nav button, .em-link { padding: 7px 11px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.12); color: inherit; font: inherit; font-size: 0.8rem; cursor: pointer; text-decoration: none; text-align: center; }
.em-nav button:hover, .em-link:hover { background: rgba(255,255,255,0.22); }
.em-link.primary { background: rgba(80,140,255,0.55); }
.em-links { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.em-ref { margin: 8px 0; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.06); font-family: monospace; font-size: 0.8rem; user-select: all; word-break: break-all; }
html[data-theme="light"] .em-opt, html[data-theme="light"] .em-nav button, html[data-theme="light"] .em-link { background: rgba(0,0,0,0.07); }
html[data-theme="light"] .em-opt:hover { background: rgba(0,90,255,0.2); }
html[data-theme="light"] .em-link.primary { background: rgba(0,90,255,0.75); color: #fff; }
html[data-theme="light"] .em-ref { background: rgba(0,0,0,0.05); }
`;

export default {
	id: 'exammaster',
	init(api) {
		const { el, storage } = api;
		api.addStyle(CSS);
		const panel = api.createPanel('exammaster', { width: 380 });
		const btn = api.addButton({ title: 'Exam Master', icon: ICON, onClick: () => panel.toggle() });
		const thisYear = new Date().getFullYear();
		let pick = storage.get('last', {}) || {};
		if (typeof pick !== 'object' || Array.isArray(pick)) pick = {};

		// Order of the steps. A step is skipped when it has only one choice.
		const STEPS = ['board', 'level', 'subject', 'year', 'series', 'paper', 'variant'];
		const board = () => BOARDS[pick.board];
		const level = () => board()?.levels[pick.level];
		const subject = () => level()?.[1][pick.subject];
		const isCie = () => pick.board === 'cie';
		const stepsFor = () => STEPS.filter((s) => s !== 'variant' || isCie());

		function choicesFor(step) {
			if (step === 'board') return Object.entries(BOARDS).map(([k, b]) => [k, b.name]);
			if (step === 'level') return Object.entries(board().levels).map(([k, l]) => [k, l[0]]);
			if (step === 'subject') return level()[1].map(([name, code], i) => [String(i), name, code]);
			if (step === 'year') return Array.from({ length: thisYear - 2009 }, (_, i) => String(thisYear - i)).map((y) => [y, y]);
			if (step === 'series') return SERIES[board().series].map(([k, label]) => [k, label]);
			if (step === 'paper') return [...[1, 2, 3, 4, 5, 6].map((n) => [String(n), 'Paper ' + n]), ['', 'Not sure / any paper']];
			return [...[1, 2, 3].map((n) => [String(n), 'Variant ' + n]), ['', 'Not sure / any variant']];   // Cambridge papers have variants, e.g. 12 = paper 1 variant 2
		}
		const stepTitle = { board: 'Choose the exam board', level: 'Choose the qualification', subject: 'Choose the subject', year: 'Choose the year', series: 'Choose the exam session', paper: 'Choose the paper', variant: 'Choose the variant' };
		const labelOf = (step) => {
			if (step === 'board') return board()?.name;
			if (step === 'level') return level()?.[0];
			if (step === 'subject') return subject() ? subject()[0] + (subject()[1] ? ' (' + subject()[1] + ')' : '') : null;
			if (step === 'year') return pick.year;
			if (step === 'series') return SERIES[board()?.series]?.find((s) => s[0] === pick.series)?.[1];
			if (step === 'paper') return pick.paper ? 'Paper ' + pick.paper : 'Any paper';
			return pick.variant ? 'Variant ' + pick.variant : 'Any variant';
		};
		const set = (step, value) => {
			pick[step] = value;
			const after = STEPS.slice(STEPS.indexOf(step) + 1);
			for (const s of after) delete pick[s];   // changing an earlier answer clears the later ones
			storage.set('last', pick); render();
		};
		const done = (s) => Object.hasOwn(pick, s) && (s === 'paper' || s === 'variant' || pick[s] !== undefined);
		const nextStep = () => stepsFor().find((s) => !done(s));

		function reference() {
			const sub = subject(), code = sub?.[1];
			const series = SERIES[board().series].find((s) => s[0] === pick.series);
			if (isCie() && code) {
				const yy = String(pick.year).slice(-2);
				const comp = (pick.paper || '') + (pick.paper && pick.variant ? pick.variant : '');
				return { code: `${code}_${series[2]}${yy}_{type}${comp ? '_' + comp : ''}`, nice: `${code}/${comp || 'xx'}/${{ m: 'F/M', s: 'M/J', w: 'O/N' }[series[0]]}/${yy}` };
			}
			return null;
		}
		const queryFor = (doc) => {
			const sub = subject(), series = SERIES[board().series].find((s) => s[0] === pick.series), ref = reference();
			if (ref) return `${ref.code.replace('{type}', doc[0])} OR "${ref.nice}" ${doc[2]} ${board().name} ${sub[0]} ${pick.year}`;
			return `${board().name} ${level()[0]} ${sub[0]}${sub[1] ? ' ' + sub[1] : ''} ${series[1]} ${pick.year}${pick.paper ? ' paper ' + pick.paper : ''} ${doc[2]} pdf`;
		};
		const google = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q);

		function link(text, href, primary) {
			const a = el('a', 'em-link' + (primary ? ' primary' : ''), text);
			a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
			return a;
		}

		function render() {
			const card = panel.card;
			card.replaceChildren();
			const close = el('button', 'news-card-close', '×'); close.setAttribute('aria-label', 'Close'); close.onclick = panel.close;
			card.append(close, el('div', 'wc-title', 'Exam Master'));
			const answered = stepsFor().filter(done);
			if (answered.length) {
				const crumbs = el('div', 'em-crumbs');
				answered.forEach((s, i) => { if (i) crumbs.append(' › '); const b = el('b', null, labelOf(s)); crumbs.append(b); });
				card.appendChild(crumbs);
			}
			const step = nextStep();
			if (!step) { renderResult(); } else {
				card.appendChild(el('div', 'em-step', stepTitle[step]));
				const grid = el('div', 'em-grid');
				for (const [value, label, code] of choicesFor(step)) {
					const b = el('button', 'em-opt', label); b.type = 'button';
					if (code) b.appendChild(el('small', null, code));
					b.onclick = () => set(step, value);
					grid.appendChild(b);
				}
				card.appendChild(grid);
			}
			const nav = el('div', 'em-nav');
			if (answered.length) {
				const back = el('button', null, '‹ Back'); back.onclick = () => { delete pick[answered[answered.length - 1]]; storage.set('last', pick); render(); };
				const reset = el('button', null, 'Start over'); reset.onclick = () => { pick = {}; storage.set('last', pick); render(); };
				nav.append(back, reset);
			}
			card.appendChild(nav);
		}

		function renderResult() {
			const card = panel.card, ref = reference();
			if (ref) { card.appendChild(el('p', 'wc-sub', 'Cambridge paper reference')); card.appendChild(el('div', 'em-ref', `${ref.nice}\n${ref.code.replace('{type}', 'qp')}`)); }
			card.appendChild(el('p', 'wc-sub', 'Open a search for this exact paper:'));
			const links = el('div', 'em-links');
			DOCS.forEach((d, i) => links.appendChild(link(d[1] + ' ↗', google(queryFor(d)), i === 0)));
			links.appendChild(link(`${board().name} official site ↗`, board().site));
			links.appendChild(link(`Search only ${board().domain} ↗`, google(`site:${board().domain} ${subject()[0]} ${subject()[1] || ''} past papers`)));
			card.append(links, el('p', 'wc-sub', 'Links open in a new tab. Some boards keep recent papers behind a school login. Papers belong to the exam boards.'));
		}

		api.settings.append(el('span', 'setting-hint', 'Exam Master builds links only. It sends nothing until you press a link, which opens a Google search or the exam board\'s website in a new tab. Your last choices are remembered on this device.'));
		panel.onOpen = render;
		return { dispose() { panel.close(); btn.remove(); panel.card.remove(); } };
	}
};
