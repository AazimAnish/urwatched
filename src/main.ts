import { mount, unmount } from 'svelte';
import App from './App.svelte';
import './style.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing application root');
let app = mount(App, { target });
let restoring = false;
window.addEventListener('pageshow', async event => {
  if (!event.persisted || restoring) return;
  restoring = true;
  try {
    await unmount(app);
    app = mount(App, { target, props: { historyRestored: true } });
  } finally { restoring = false; }
});
