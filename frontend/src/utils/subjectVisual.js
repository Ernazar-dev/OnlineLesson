import {
  AtomOutlined, BarbellOutlined, BookOutlined, CalculatorOutlined, ChartLineOutlined,
  CodeOutlined, FlaskOutlined, GlobalOutlined, LeafOutlined, MusicNoteOutlined,
  PaletteOutlined, ScalesOutlined, ScrollOutlined, TranslateOutlined,
} from '../icons';

// Subjects have no uploaded picture of their own (unlike books, which carry a
// cover). Rather than leave the card blank, each one gets a picture built
// from its name instead: an icon that actually fits the subject, on a
// gradient so every card still reads as a distinct, colourful thumbnail —
// the same "image on top, name below" shape as the Literature cards.
//
// Matched by keyword against the subject name, case-insensitively, in
// whichever of Uzbek/Russian/English the school entered it in. A name that
// matches nothing (a custom elective, a typo, another language) still gets a
// picture: the gradient is picked deterministically from the name itself, so
// the same subject always looks the same without needing a keyword for it.
const ENTRIES = [
  { icon: CalculatorOutlined, gradient: ['#4f7cff', '#2451e0'], keywords: ['matemat', 'algebra', 'geometr', 'математик', 'алгебр', 'геометр', 'math'] },
  { icon: AtomOutlined, gradient: ['#7c5cfc', '#4d2fd1'], keywords: ['fizika', 'физик', 'physic'] },
  { icon: FlaskOutlined, gradient: ['#22c1a0', '#0d8f78'], keywords: ['kimyo', 'хими', 'chemistry'] },
  { icon: LeafOutlined, gradient: ['#57c26a', '#2f9440'], keywords: ['biolog', 'биолог'] },
  { icon: ScrollOutlined, gradient: ['#d98a3d', '#a8621f'], keywords: ['tarix', 'истор', 'history'] },
  { icon: GlobalOutlined, gradient: ['#2f9de0', '#1567ad'], keywords: ['geografiya', 'geograph', 'географ'] },
  { icon: TranslateOutlined, gradient: ['#e0578a', '#b02f63'], keywords: ['ingliz', 'english', 'rus tili', 'русск', 'немис', 'german', 'fransuz', 'french', 'til', 'язык', 'language'] },
  { icon: BookOutlined, gradient: ['#8a5cf6', '#5a2fd1'], keywords: ['adabiyot', 'литератур', 'literature', 'ona tili'] },
  { icon: CodeOutlined, gradient: ['#3d4b8c', '#232d5c'], keywords: ['informatika', 'dasturlash', 'программ', 'информат', 'comput', 'it '] },
  { icon: PaletteOutlined, gradient: ['#f2607a', '#c93656'], keywords: ['chizmachilik', 'san\'at', 'rasm', 'изобраз', 'искусств', 'art'] },
  { icon: MusicNoteOutlined, gradient: ['#c96ae0', '#8f34ad'], keywords: ['musiqa', 'музык', 'music'] },
  { icon: BarbellOutlined, gradient: ['#e0913d', '#b3611b'], keywords: ['jismoniy', 'физкультур', 'physical', 'sport'] },
  { icon: ScalesOutlined, gradient: ['#5c6b8a', '#333f5c'], keywords: ['huquq', 'право', 'law'] },
  { icon: ChartLineOutlined, gradient: ['#2fb08c', '#177059'], keywords: ['iqtisod', 'эконом', 'econom'] },
];

// A handful of gradients for names that match no keyword above, so unknown
// subjects still look distinct from one another instead of all sharing one
// grey fallback.
const FALLBACK_GRADIENTS = [
  ['#4f7cff', '#2451e0'], ['#e0578a', '#b02f63'], ['#22c1a0', '#0d8f78'],
  ['#d98a3d', '#a8621f'], ['#8a5cf6', '#5a2fd1'], ['#2f9de0', '#1567ad'],
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Returns `{ Icon, gradient: 'css linear-gradient(...)' }` for a subject name. */
export function getSubjectVisual(name) {
  const n = (name || '').toLowerCase();
  const hit = ENTRIES.find((e) => e.keywords.some((k) => n.includes(k)));
  const [from, to] = hit ? hit.gradient : FALLBACK_GRADIENTS[hashString(n) % FALLBACK_GRADIENTS.length];
  return {
    Icon: hit ? hit.icon : BookOutlined,
    gradient: `linear-gradient(135deg, ${from}, ${to})`,
  };
}
