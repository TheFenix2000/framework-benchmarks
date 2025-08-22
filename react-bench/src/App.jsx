import { useRef, useState } from "react";

function makeRow(i) {
	const a = i;
	const b = i * 2;
	const c = `${i}-${(i * 31) % 97}`;
	const heavy = ((i * 9301 + 49297) % 233280) / 233280;
	return { a, b, c, heavy };
}

function Table({ rows }) {
	return (
		<table style={{ width: "100%", borderCollapse: "collapse" }}>
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
				{rows.map((r, idx) => (
					<tr key={idx}>
						<td>{idx}</td>
						<td>{r.a}</td>
						<td>{r.b}</td>
						<td>{r.c}</td>
						<td>{r.heavy.toFixed(4)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

export default function App() {
	const [rows, setRows] = useState([]);
	const [results, setResults] = useState({});
	const runningRef = useRef(false);

	const sizes = [10, 100, 1000, 50000];

	async function runRenderBenchmark() {
		if (runningRef.current) return;
		runningRef.current = true;
		const r = {};
		for (const N of sizes) {
			const data = new Array(N).fill(0).map((_, i) => makeRow(i));
			const t0 = performance.now();
			setRows(data);
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			const t1 = performance.now();
			r[N] = +(t1 - t0).toFixed(2);
			await new Promise((res) => setTimeout(res, 50));
		}
		setResults((prev) => ({ ...prev, render: r }));
		runningRef.current = false;
		return r;
	}

	// Bulk updates
	async function runBulkUpdates({ rowsCount = 10000, updatesCount = 1000 } = {}) {
		if (runningRef.current) return;
		runningRef.current = true;

		let data = new Array(rowsCount).fill(0).map((_, i) => makeRow(i));
		setRows(data);
		await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

		const t0 = performance.now();
		for (let u = 0; u < updatesCount; u++) {
			const idx = Math.floor(Math.random() * rowsCount);
			data = data.slice();

			const newRow = makeRow(idx + (u % 10));
			data[idx] = newRow;
			setRows(data);

			if ((u + 1) % 50 === 0) {
				await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
			}
		}

		await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
		const t1 = performance.now();

		const total = +(t1 - t0).toFixed(2);
		const avg = +(total / updatesCount).toFixed(4);
		const resObj = { rows: rowsCount, updates: updatesCount, total_ms: total, avg_ms: avg };
		setResults((prev) => ({ ...prev, bulk: resObj }));
		runningRef.current = false;
		return resObj;
	}

	// Mount/unmount churn
	async function runMountUnmount({ components = 1000, cycles = 100 } = {}) {
		if (runningRef.current) return;
		runningRef.current = true;

		const t0 = performance.now();
		for (let c = 0; c < cycles; c++) {
			const data = new Array(components).fill(0).map((_, i) => ({ a: i }));
			setRows(data);
			await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
			setRows([]);
			await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
		}
		const t1 = performance.now();
		const total = +(t1 - t0).toFixed(2);
		const avg_cycle = +(total / cycles).toFixed(4);
		const resObj = { components, cycles, total_ms: total, avg_cycle_ms: avg_cycle };
		setResults((prev) => ({ ...prev, churn: resObj }));
		runningRef.current = false;
		return resObj;
	}

	// expose to window for puppeteer runner
	// eslint-disable-next-line no-undef
	if (typeof window !== "undefined") {
		window.runRenderBenchmark = runRenderBenchmark;
		window.runBulkUpdates = runBulkUpdates;
		window.runMountUnmount = runMountUnmount;
		window.getBenchResults = () => results;
	}

	return (
		<div style={{ padding: 20 }}>
			<h2>React benchmark (JS)</h2>
			<div style={{ marginBottom: 12 }}>
				<button onClick={() => runRenderBenchmark()}>Uruchom render test</button> <button onClick={() => runBulkUpdates()}>Uruchom bulk updates</button>{" "}
				<button onClick={() => runMountUnmount()}>Uruchom mount/unmount</button>
			</div>

			<div>
				<strong>Wyniki (obj):</strong>
				<pre>{JSON.stringify(results, null, 2)}</pre>
			</div>

			<div style={{ height: 400, overflow: "auto", border: "1px solid #ddd", marginTop: 10 }}>
				<Table rows={rows} />
			</div>
		</div>
	);
}
