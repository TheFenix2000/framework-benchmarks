import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';

function makeRow(i: number) {
  const a = i;
  const b = i * 2;
  const c = `${i}-${(i * 31) % 97}`;
  const heavy = ((i * 9301 + 49297) % 233280) / 233280;
  return { a, b, c, heavy };
}
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:20px">
      <h2>Angular benchmark (TS)</h2>
      <div style="margin-bottom:12px">
        <button (click)="runRenderBenchmark()">Uruchom render test</button>
        <button (click)="runBulkUpdates()">Uruchom bulk updates</button>
        <button (click)="runMountUnmount()">Uruchom mount/unmount</button>
      </div>
      <div>
        <strong>Wyniki (obj):</strong>
        <pre>{{ results | json }}</pre>
      </div>
      <div
        style="height:400px; overflow:auto; border:1px solid #ddd; margin-top:10px"
      >
        <table style="width:100%; border-collapse:collapse">
          <thead>
            <tr>
              <th>#</th>
              <th>A</th>
              <th>B</th>
              <th>C</th>
              <th>H</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows; let i = index">
              <td>{{ i }}</td>
              <td>{{ r.a }}</td>
              <td>{{ r.b }}</td>
              <td>{{ r.c }}</td>
              <td>{{ r.heavy | number: '1.4-4' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class BenchComponent {
  rows: any[] = [];
  results: any = {};
  sizes = [10, 100, 1000, 50000];
  running = false;

  constructor(private cd: ChangeDetectorRef) {}

  async runRenderBenchmark(): Promise<any> {
    if (this.running) return;
    this.running = true;
    const r: any = {};
    for (const N of this.sizes) {
      const data = new Array(N).fill(0).map((_, i) => makeRow(i));
      const t0 = performance.now();
      this.rows = data;
      this.cd.detectChanges();
      await new Promise((res) =>
        requestAnimationFrame(() => requestAnimationFrame(res)),
      );
      const t1 = performance.now();
      r[N] = +(t1 - t0).toFixed(2);
      await new Promise((res) => setTimeout(res, 50));
    }
    this.results.render = r;
    this.running = false;
    return r;
  }

  async runBulkUpdates(
    params: { rowsCount?: number; updatesCount?: number } = {},
  ): Promise<any> {
    if (this.running) return;
    this.running = true;
    const rowsCount = params.rowsCount ?? 10000;
    const updatesCount = params.updatesCount ?? 1000;
    let data = new Array(rowsCount).fill(0).map((_, i) => makeRow(i));
    this.rows = data;
    this.cd.detectChanges();
    await new Promise((res) =>
      requestAnimationFrame(() => requestAnimationFrame(res)),
    );

    const t0 = performance.now();
    for (let u = 0; u < updatesCount; u++) {
      const idx = Math.floor(Math.random() * rowsCount);
      data = data.slice();
      data[idx] = makeRow(idx + (u % 10));
      this.rows = data;
      if ((u + 1) % 50 === 0) {
        this.cd.detectChanges();
        await new Promise((res) =>
          requestAnimationFrame(() => requestAnimationFrame(res)),
        );
      }
    }
    this.cd.detectChanges();
    await new Promise((res) =>
      requestAnimationFrame(() => requestAnimationFrame(res)),
    );
    const t1 = performance.now();
    const total = +(t1 - t0).toFixed(2);
    const avg = +(total / updatesCount).toFixed(4);
    const out = {
      rows: rowsCount,
      updates: updatesCount,
      total_ms: total,
      avg_ms: avg,
    };
    this.results.bulk = out;
    this.running = false;
    return out;
  }

  async runMountUnmount(
    params: { components?: number; cycles?: number } = {},
  ): Promise<any> {
    if (this.running) return;
    this.running = true;
    const components = params.components ?? 1000;
    const cycles = params.cycles ?? 100;
    const t0 = performance.now();
    for (let c = 0; c < cycles; c++) {
      this.rows = new Array(components).fill(0).map((_, i) => ({ a: i }));
      this.cd.detectChanges();
      await new Promise((res) =>
        requestAnimationFrame(() => requestAnimationFrame(res)),
      );
      this.rows = [];
      this.cd.detectChanges();
      await new Promise((res) =>
        requestAnimationFrame(() => requestAnimationFrame(res)),
      );
    }
    const t1 = performance.now();
    const total = +(t1 - t0).toFixed(2);
    const avg_cycle = +(total / cycles).toFixed(4);
    const out = {
      components,
      cycles,
      total_ms: total,
      avg_cycle_ms: avg_cycle,
    };
    this.results.churn = out;
    this.running = false;
    return out;
  }

  // expose to window for puppeteer
  ngOnInit() {
    if (typeof window !== 'undefined') {
      // @ts-ignore
      window.runRenderBenchmark = this.runRenderBenchmark.bind(this);
      // @ts-ignore
      window.runBulkUpdates = this.runBulkUpdates.bind(this);
      // @ts-ignore
      window.runMountUnmount = this.runMountUnmount.bind(this);
      // @ts-ignore
      window.getBenchResults = () => this.results;
    }
  }
}
