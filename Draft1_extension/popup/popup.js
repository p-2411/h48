const DEFAULTS = { enabled: true, level: 2, guess: true, dock: 'side', collapsed: false, tab: 'script' };
const NOTES = ['', 'A few words', '40% Spanish', '60% Spanish', '80% Spanish', 'All Spanish'];
const $ = id => document.getElementById(id);
chrome.storage.local.get(['settings', 'words'], d => {
  const s = { ...DEFAULTS, ...(d.settings || {}) };
  const words = Object.values(d.words || {});
  $('enabled').checked = s.enabled; $('guess').checked = s.guess;
  $('level').value = s.level; $('levelNote').textContent = NOTES[s.level];
  $('dock').value = s.dock;
  $('saved').textContent = words.length;
  $('known').textContent = words.filter(w => w.box >= 2).length;
  const save = () => chrome.storage.local.set({ settings: s });
  $('enabled').onchange = e => { s.enabled = e.target.checked; save(); };
  $('guess').onchange = e => { s.guess = e.target.checked; save(); };
  $('level').oninput = e => { s.level = +e.target.value; $('levelNote').textContent = NOTES[s.level]; save(); };
  $('dock').onchange = e => { s.dock = e.target.value; save(); };
});
$('demo').onclick = () => chrome.tabs.create({ url: 'https://www.youtube.com/watch?v=eRsGyueVLvQ&t=100s' });
