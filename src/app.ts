export function renderApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="site-header">
      <h1>OSRS Music Ranker</h1>
    </header>
    <section aria-label="Current matchup">
      <p>Loading music tracks...</p>
    </section>
  `;
}
