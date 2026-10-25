<script lang="ts">
  import { onMount } from 'svelte';
  import RenderedText from './RenderedText.svelte';
  import { datum, plainText, segments, sliceSegments } from '../text.ts';
  import { characters } from '../typewriter.ts';

  let { count, reduced, paused, oncomplete }: { count: number; reduced: boolean; paused: boolean; oncomplete: () => void } = $props();
  const lines = $derived([
    ...(count > 1 ? [segments('Again?')] : []),
    segments('This page was out of view ', datum(count), count === 1 ? ' time.' : ' times.'),
    segments('Checking me?'),
    segments('I noticed.'),
  ]);
  let sentence = $state(0);
  let shown = $state(0);
  let reading = $state(false);
  let mounted = $state(false);
  let announced = $state('');
  let frame = 0;
  let previous = 0;
  let work = 0;
  let remaining = 2000;
  let done = false;
  const length = $derived(characters(plainText(lines[sentence])).length);

  function reveal() { shown = length; reading = true; remaining = 2000; announced = plainText(lines[sentence]); }
  export function advance() {
    if (done) return;
    if (!reading) { reveal(); return; }
    if (sentence + 1 < lines.length) { sentence++; shown = 0; work = 0; reading = false; }
    else { done = true; cancelAnimationFrame(frame); oncomplete(); }
  }
  function animate(now: number) {
    frame = 0;
    if (paused || done) return;
    const elapsed = previous ? Math.min(100, now - previous) : 0;
    previous = now;
    if (reading) { remaining -= elapsed; if (remaining <= 0) advance(); }
    else {
      work += elapsed / 100;
      const count = Math.floor(work);
      shown = Math.min(length, shown + count); work -= count;
      if (shown === length) reveal();
    }
    if (!done && !frame) frame = requestAnimationFrame(animate);
  }
  $effect(() => {
    if (!mounted || paused) { cancelAnimationFrame(frame); frame = 0; previous = 0; return; }
    if (reduced && !reading) reveal();
    if (!done && !frame) frame = requestAnimationFrame(animate);
  });
  onMount(() => { mounted = true; return () => { done = true; cancelAnimationFrame(frame); }; });
</script>

<div class="text-area scrollable" role="region" aria-label="Return to page">
  <p class="terminal-output" aria-hidden="true"><RenderedText parts={sliceSegments(lines[sentence], 0, shown)} />{#if !reading}<span class="cursor"></span>{/if}</p>
  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announced}</p>
</div>
