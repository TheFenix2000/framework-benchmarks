<!-- App.vue -->
<template>
	<div style="padding: 20px">
		<h2>Vue 3 benchmark (JS)</h2>
		<div style="margin-bottom: 12px">
			<button @click="runRenderBenchmark">Uruchom render test</button>
			<button @click="() => runBulkUpdates()">Uruchom bulk updates</button>
			<button @click="() => runMountUnmount()">Uruchom mount/unmount</button>
		</div>

		<div>
			<strong>Wyniki (obj):</strong>
			<pre>{{ JSON.stringify(results, null, 2) }}</pre>
		</div>

		<div style="height: 400px; overflow: auto; border: 1px solid #ddd; margin-top: 10px">
			<table style="width: 100%; border-collapse: collapse">
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
					<tr v-for="(r, i) in rows" :key="i">
						<td>{{ i }}</td>
						<td>{{ r.a }}</td>
						<td>{{ r.b }}</td>
						<td>{{ r.c }}</td>
						<td>{{ r.heavy?.toFixed(4) }}</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script>
import { nextTick, ref } from "vue";

function makeRow(i) {
	const a = i;
	const b = i * 2;
	const c = `${i}-${(i * 31) % 97}`;
	const heavy = ((i * 9301 + 49297) % 233280) / 233280;
	return { a, b, c, heavy };
}

export default {
	setup() {
		const rows = ref([]);
		const results = ref({});
		const sizes = [10, 100, 1000, 50000];
		let running = false;

		async function runRenderBenchmark() {
			if (running) return;
			running = true;
			const r = {};
			for (const N of sizes) {
				const data = new Array(N).fill(0).map((_, i) => makeRow(i));
				const t0 = performance.now();
				rows.value = data;
				await nextTick();
				await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
				const t1 = performance.now();
				r[N] = +(t1 - t0).toFixed(2);
				await new Promise((res) => setTimeout(res, 50));
			}
			results.value.render = r;
			running = false;
			return r;
		}

		async function runBulkUpdates({ rowsCount = 10000, updatesCount = 1000 } = {}) {
			if (running) return;
			running = true;
			let data = new Array(rowsCount).fill(0).map((_, i) => makeRow(i));
			rows.value = data;
			await nextTick();
			await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

			const t0 = performance.now();
			for (let u = 0; u < updatesCount; u++) {
				const idx = Math.floor(Math.random() * rowsCount);
				data = data.slice();
				data[idx] = makeRow(idx + (u % 10));
				rows.value = data;
				if ((u + 1) % 50 === 0) {
					await nextTick();
					await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
				}
			}
			await nextTick();
			await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
			const t1 = performance.now();
			const total = +(t1 - t0).toFixed(2);
			const avg = +(total / updatesCount).toFixed(4);
			const out = { rows: rowsCount, updates: updatesCount, total_ms: total, avg_ms: avg };
			results.value.bulk = out;
			running = false;
			return out;
		}

		async function runMountUnmount({ components = 1000, cycles = 100 } = {}) {
			if (running) return;
			running = true;
			const t0 = performance.now();
			for (let c = 0; c < cycles; c++) {
				rows.value = new Array(components).fill(0).map((_, i) => ({ a: i }));
				await nextTick();
				await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
				rows.value = [];
				await nextTick();
				await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
			}
			const t1 = performance.now();
			const total = +(t1 - t0).toFixed(2);
			const avg_cycle = +(total / cycles).toFixed(4);
			const out = { components, cycles, total_ms: total, avg_cycle_ms: avg_cycle };
			results.value.churn = out;
			running = false;
			return out;
		}

		// expose for puppeteer
		if (typeof window !== "undefined") {
			window.runRenderBenchmark = runRenderBenchmark;
			window.runBulkUpdates = runBulkUpdates;
			window.runMountUnmount = runMountUnmount;
			window.getBenchResults = () => results.value;
		}

		return { rows, results, runRenderBenchmark, runBulkUpdates, runMountUnmount };
	},
};
</script>
