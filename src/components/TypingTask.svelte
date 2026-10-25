<script lang="ts">
  import { onMount } from 'svelte';
  import RenderedText from './RenderedText.svelte';
  import { segments } from '../text.ts';
  import type { TaskResults, TextPart } from '../types.ts';
  let { onresult, onskip, suspended = false }: { onresult: (result: TaskResults['typing']) => void; onskip: () => void; suspended?: boolean } = $props();
  const sentence = 'I am being watched.';
  let finished = $state(false);
  let message = $state<TextPart[]>(segments('Type at the prompt. I’m timing it.'));
  let ready = $state(false);
  const minimum = 12;
  let lastEdit = 0;
  let field: HTMLInputElement;
  let began = 0;
  let suspendedAt = 0;
  let inactive = 0;
  const complete = (value: string) => value.trim().replace(/\.$/, "").toLowerCase() === "i am being watched";
  let previousKey = 0;
  let gaps: number[] = [];
  let deletions = 0;
  let assisted = false;
  let composing = false;
  let lastLength = 0;
  let exactPrefix = true;
  let watchedGap: number | undefined;

  function clear() {
    if (field) field.value = '';
    suspendedAt = inactive = lastEdit = 0; ready = false;
    gaps = []; began = previousKey = lastLength = deletions = 0;
    assisted = composing = false; exactPrefix = true; watchedGap = undefined;
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !composing && !event.isComposing) { event.preventDefault(); finish(); return; }
    if (suspended || finished || composing || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || event.repeat) return;
    const now = performance.now();
    if (exactPrefix && !assisted && event.key === 'w' && field.value === 'I am being ' && field.selectionStart === field.value.length && field.selectionEnd === field.value.length && previousKey) watchedGap = now - previousKey;
    if (previousKey && began && gaps.length < 160) gaps.push(now - previousKey);
    previousKey = now;
  }
  function beforeinput(event: InputEvent) {
    if (suspended || finished) return;
    if (event.inputType.startsWith('delete')) { deletions++; exactPrefix = false; }
    if (event.inputType !== 'insertText' && !event.inputType.startsWith('delete')) assisted = true;
  }
  function input(event: Event) {
    if (suspended || finished) return;
    if (!began) began = performance.now();
    const entry = event as InputEvent;
    const current = field.value;
    if (!sentence.startsWith(current)) exactPrefix = false;
    if (!entry.inputType || (entry.inputType !== 'insertText' && !entry.inputType.startsWith('delete')) || (entry.inputType === 'insertText' && (!entry.data || entry.data.length > 1)) || Math.abs(current.length - lastLength) > 1) assisted = true;
    lastLength = current.length;
    lastEdit = performance.now() - inactive;
    ready = current.trim().length >= minimum && !composing;
    message = segments(complete(current) ? 'Done? Press Enter.' : ready ? 'Enough to measure. Enter when you’re done.' : 'Keep typing. I’m not done yet.');
  }
  function finish() {
    if (suspended || finished || composing || !ready) return;
    const value = field.value;
    if (!began || value.trim().length < minimum) return;
    const elapsed = lastEdit - began;
    const completed = complete(value);
    const result: NonNullable<TaskResults['typing']> = { input: assisted ? 'assisted' : 'ordinary', completed, deletions };
    if (!assisted && elapsed >= 1000) {
      result.wpm = Math.round(value.length / 5 / (elapsed / 60000));
      if (gaps.length) {
        const sorted = [...gaps].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        result.medianGapMs = Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
      }
    }
    if (!assisted && exactPrefix && completed && watchedGap !== undefined && watchedGap >= 0 && watchedGap < 120000) result.watchedGapMs = Math.round(watchedGap);
    clear(); finished = true;
    onresult(result);
  }
  $effect(() => {
    if (suspended) {
      if (began && !suspendedAt) suspendedAt = performance.now();
      previousKey = 0;
    } else if (suspendedAt) {
      inactive += performance.now() - suspendedAt; suspendedAt = 0;
    }
  });
  onMount(() => {
    field.focus({ preventScroll: true });
    return clear;
  });
</script>

<section class="typing-task" aria-labelledby="typing-heading">
  <p id="typing-heading">Type this sentence:</p>
  <p id="typing-target" class="typing-target">{sentence}</p>
  <label class="terminal-entry" class:suspended for="typing-input">
    <span class="terminal-prompt" aria-hidden="true">%</span>
    <span class="sr-only">Type the sentence at the terminal prompt</span>
    <input bind:this={field} id="typing-input" type="text" maxlength="160" readonly={finished} disabled={suspended} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-describedby="typing-target typing-note" onkeydown={keydown} onbeforeinput={beforeinput} oninput={input} onpaste={() => { assisted = true; }} ondrop={() => { assisted = true; }} oncompositionstart={() => { assisted = composing = true; }} oncompositionend={() => { composing = false; ready = field.value.trim().length >= minimum; message = segments(ready ? 'Ready. Press Enter when you’re done.' : 'Keep typing. I’m not done yet.'); }} />
  </label>
  <p id="typing-note" class="typing-note" role="status"><RenderedText parts={message} /></p>
  <div class="commands typing-actions">
    <button disabled={suspended || finished || !ready} onclick={finish}>Read my typing <span aria-hidden="true">↵</span></button>
    <button disabled={suspended || finished} onclick={onskip}>Skip this</button>
  </div>
</section>

<style>
  .typing-task { padding-block: .5rem; }
  .typing-task p { margin: 0; }
  .typing-task .typing-target { margin-top: .5rem; }
  .terminal-entry { display: flex; align-items: center; gap: 1ch; min-height: 48px; margin-block: 1.5rem .5rem; cursor: text; }
  .terminal-prompt { flex: none; width: 1ch; line-height: 1.5; text-align: center; }
  .terminal-entry:focus-within .terminal-prompt { color: var(--bg); background: var(--fg); }
  .terminal-entry input { flex: 1; width: 0; min-width: 0; padding: .75rem 0; outline: none; caret-color: var(--fg); }
  .terminal-entry input::selection { color: var(--bg); background: var(--fg); }
  .terminal-entry.suspended { opacity: .65; }
  .typing-note { min-height: 3em; padding-left: 2ch; }
  .typing-actions { padding-left: 2ch; margin-top: .5rem; }
  @media (forced-colors: active) {
    .terminal-entry:focus-within .terminal-prompt { color: HighlightText; background: Highlight; forced-color-adjust: none; }
    .terminal-entry input:focus-visible { outline: 1px solid Highlight; outline-offset: 2px; }
  }
</style>
