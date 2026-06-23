/** Thin-line loader (visible pre-JS via inline HTML/CSS); byte-accurate fill. */

export class LoaderUI {
  private bar = document.getElementById('loader-bar')!;
  private text = document.getElementById('loader-text')!;
  private root = document.getElementById('loader')!;

  set(frac: number, label?: string): void {
    this.bar.style.transform = `scaleX(${Math.min(Math.max(frac, 0), 1)})`;
    if (label) this.text.textContent = label;
  }

  done(): void {
    this.root.classList.add('done');
    document.body.classList.remove('loading');
    window.setTimeout(() => this.root.remove(), 700);
  }
}
