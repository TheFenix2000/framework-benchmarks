import chalk from "chalk";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { spawn } from "child_process";
import fs from "fs/promises";
import http from "http";
import path from "path";
import puppeteer from "puppeteer";

const root = path.resolve(".");
const outDir = path.join(root, "./out");
const plotsDir = path.join(outDir, "plots");

const projects = {
	react: { dir: path.join(root, "../react-bench"), port: 4173, build: "npm run build", start: ["npm", ["run", "preview"]] },
	vue: { dir: path.join(root, "../vue-bench"), port: 4173, build: "npm run build", start: ["npm", ["run", "preview"]] },
	angular: { dir: path.join(root, "../angular-bench"), port: 4200, build: "npm run build", start: ["npm", ["start", "--", "--configuration=production"]] },
};

// ------------------ utilities ------------------
function spawnShell(cmd, args, opts = {}) {
	// cmd can be array form like ["npm", ["run","preview"]] or single string
	if (Array.isArray(cmd)) {
		return spawn(cmd[0], cmd[1], { shell: true, ...opts });
	} else {
		return spawn(cmd, { shell: true, ...opts });
	}
}

async function exec(cmd, opts = {}) {
	return new Promise((res, rej) => {
		const p = spawn(cmd, { shell: true, ...opts });
		p.on("exit", (code) => (code === 0 ? res() : rej(new Error("cmd failed: " + cmd))));
	});
}

function waitForServer(port, timeout = 120000) {
	const start = Date.now();
	return new Promise((resolve, reject) => {
		const check = () => {
			const req = http.get({ host: "localhost", port, path: "/" }, (res) => {
				res.destroy();
				resolve();
			});
			req.on("error", () => {
				if (Date.now() - start > timeout) {
					reject(new Error(`Timeout waiting for server on port ${port}`));
				} else {
					setTimeout(check, 500);
				}
			});
		};
		check();
	});
}

function median(arr) {
	const s = [...arr].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(arr) {
	return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function statsFromArray(arr) {
	if (!arr || arr.length === 0) return null;
	const s = [...arr].sort((a, b) => a - b);
	return {
		runs: arr,
		min: s[0],
		max: s[s.length - 1],
		median: median(arr),
		mean: mean(arr),
	};
}

// Chart generator (Chart.js via chartjs-node-canvas)
const chartWidth = 1000;
const chartHeight = 500;
const chartCanvas = new ChartJSNodeCanvas({ width: chartWidth, height: chartHeight });

// helper: format number nicely
function fmtNum(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/A";
  // show integer if near-integer, otherwise one decimal
  if (Math.abs(v - Math.round(v)) < 0.001) return String(Math.round(v));
  return (Math.round(v * 10) / 10).toFixed(1);
}

// plugin rysujący etykiety na słupkach
const barValueLabelsPlugin = {
  id: "barValueLabels",
  afterDatasetsDraw(chart, args, pluginOptions) {
    const ctx = chart.ctx;
    const opts = (chart.options.plugins && chart.options.plugins.barValueLabels) || pluginOptions || {};
    const rotate = !!opts.rotate;
    const font = (opts.font || "12px Arial");
    const color = opts.color || "#000";
    const padding = typeof opts.padding === "number" ? opts.padding : 6;

    chart.data.datasets.forEach((dataset, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      meta.data.forEach((element, index) => {
        const value = dataset.data[index];
        if (value == null) return;
        // position on bar
        const px = element.x;
        const py = element.y;
        ctx.save();
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        if (rotate) {
          // draw vertical label rotated -90deg; shift slightly left of bar top
          ctx.translate(px, py - padding);
          ctx.rotate(-Math.PI / 2);
          ctx.textBaseline = "middle";
          ctx.fillText(String(fmtNum(value)), 0, 0);
        } else {
          // horizontal label above bar
          ctx.textBaseline = "bottom";
          ctx.fillText(String(fmtNum(value)), px, py - padding);
        }
        ctx.restore();
      });
    });
  }
};

async function generateComparisonPlotRender(allFrameworksData, sizes, outFile, opts = {}) {
	// allFrameworksData: { frameworkName: { size: {median:..} } }
	const labels = sizes.map(String);
	const frameworks = Object.keys(allFrameworksData);
	const datasets = frameworks.map((fw, idx) => {
		const data = sizes.map((size) => {
			const stat = allFrameworksData[fw][size];
			return stat ? Number(stat.median) : null;
		});
		return {
			label: fw,
			data,
			// optional: you can tune bar thickness / order
			// barThickness: 30 - leave Chart.js to auto layout
		};
	});

	const config = {
		type: "bar",
		data: { labels, datasets },
		options: {
			responsive: false,
			plugins: {
				title: { display: true, text: "Render time (median ms) — sizes" },
				legend: { position: "top" },
				// plugin options for our label plugin
				barValueLabels: {
					rotate: false, // <--- set true to draw vertical labels
					font: "11px Arial",
					color: "#111",
					padding: 6,
				},
			},
			scales: {
				x: { stacked: false, title: { display: true, text: "rows" } },
				y: { title: { display: true, text: "ms" }, beginAtZero: true },
			},
		},
		plugins: [barValueLabelsPlugin],
	};

	const buffer = await chartCanvas.renderToBuffer(config);
	await fs.writeFile(outFile, buffer);
}

async function generateComparisonPlotSimple(metricName, frameworkStatsMap, outFile, opts = {}) {
	const labels = Object.keys(frameworkStatsMap);
	const data = labels.map((l) => {
		const s = frameworkStatsMap[l];
		return s ? Number(s.median) : null;
	});

	const config = {
		type: "bar",
		data: {
			labels,
			datasets: [{ label: `${metricName} (median ms)`, data }],
		},
		options: {
			responsive: false,
			plugins: {
				title: { display: true, text: `${metricName} (median ms)` },
				barValueLabels: {
					rotate: false, // set true for vertical labels
					font: "12px Arial",
					color: "#111",
					padding: 6,
				},
			},
			scales: {
				y: { beginAtZero: true, title: { display: true, text: "ms" } },
			},
		},
		plugins: [barValueLabelsPlugin],
	};

	const buffer = await chartCanvas.renderToBuffer(config);
	await fs.writeFile(outFile, buffer);
}

// ------------------ main per-framework runner ------------------
async function runAllTestsForFramework(name, iterations = 5) {
	const proj = projects[name];
	if (!proj) throw new Error("Unknown: " + name);
	console.log(chalk.cyan(`\n[${name}] building...`));
	await exec(proj.build, { cwd: proj.dir });

	console.log(chalk.cyan(`[${name}] starting server...`));
	// start server (use provided array form)
	const server = spawn(proj.start[0], proj.start[1], {
		cwd: proj.dir,
		stdio: "inherit",
		shell: true,
	});

	try {
		await waitForServer(proj.port, 180000);
	} catch (err) {
		server.kill();
		throw err;
	}
	console.log(chalk.green(`[${name}] server ready on port ${proj.port}`));

	console.log(chalk.cyan(`[${name}] launching puppeteer...`));
	const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
	const page = await browser.newPage();
	await page.setCacheEnabled(false);

	const url = `http://localhost:${proj.port}`;
	await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

	// wait until page exposes benchmark API (all three functions)
	await page.waitForFunction(() => !!(window.runRenderBenchmark && window.runBulkUpdates && window.runMountUnmount), { timeout: 60000 });

	// containers for raw iteration results
	const rawRenderRuns = []; // each item: object { "10":ms, "100":ms, ... }
	const rawBulkRuns = []; // each item: object or numeric (we'll normalize)
	const rawChurnRuns = [];

	console.log(chalk.magenta(`[${name}] running ${iterations} iterations for each test...`));
	const maxRetries = 3;
	for (let i = 0; i < iterations; i++) {
		console.log(chalk.magenta(`[${name}] iteration ${i + 1}/${iterations} starting...`));

		// reload page to ensure clean state
		await page.reload({ waitUntil: "networkidle2", timeout: 120000 });
		// wait until API available
		await page.waitForFunction(() => !!(window.runRenderBenchmark && window.runBulkUpdates && window.runMountUnmount), { timeout: 60000 });

		// --- RENDER TEST with validation + retry ---
		let renderRes = null;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			console.log(chalk.magenta(`[${name}] iteration ${i + 1}, render attempt ${attempt}`));
			renderRes = await page.evaluate(async () => {
				return await window.runRenderBenchmark();
			});

			// validation: pick the largest size present in the returned object and verify DOM row count
			try {
				const sizes = Object.keys(renderRes || {})
					.map((s) => Number(s))
					.filter((n) => !isNaN(n))
					.sort((a, b) => a - b);
				if (sizes.length > 0) {
					const largest = sizes[sizes.length - 1];
					// get actual DOM row count for table (make selector match your table)
					const actual = await page.evaluate((selector) => {
						const tbody = document.querySelector(selector);
						if (!tbody) return 0;
						return tbody.querySelectorAll("tr").length;
					}, "table tbody"); // <- dopasuj selector jeśli masz inny markup

					if (actual === largest) {
						console.log(chalk.green(`[${name}] render validated: ${actual} rows (expected ${largest})`));
						break; // success
					} else {
						console.warn(chalk.yellow(`[${name}] render validation mismatch: actual=${actual} expected=${largest}`));
						// retry unless last attempt
					}
				} else {
					console.warn(chalk.yellow(`[${name}] render returned no sizes, accepting as-is.`));
					break;
				}
			} catch (e) {
				console.warn(chalk.yellow(`[${name}] validation error: ${e.message}`));
			}

			if (attempt === maxRetries) {
				console.error(chalk.red(`[${name}] render failed validation after ${maxRetries} attempts — recording raw result anyway.`));
			} else {
				// short cooldown before retry
				await new Promise((r) => setTimeout(r, 500));
			}
		}
		rawRenderRuns.push(renderRes || {});

		// --- BULK test with retry (optional validation) ---
		let bulkRes = null;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			console.log(chalk.magenta(`[${name}] iteration ${i + 1}, bulk attempt ${attempt}`));
			bulkRes = await page.evaluate(async () => {
				return await window.runBulkUpdates?.({ rowsCount: 10000, updatesCount: 1000 });
			});

			// optional validation: check bulkRes.total_ms exists and is > 0, or check DOM changed
			if (bulkRes && typeof bulkRes.total_ms === "number" && bulkRes.total_ms >= 0) {
				break;
			} else if (attempt === maxRetries) {
				console.warn(chalk.yellow(`[${name}] bulk didn't return valid total_ms after ${maxRetries} attempts.`));
				break;
			} else {
				await new Promise((r) => setTimeout(r, 500));
			}
		}
		rawBulkRuns.push(bulkRes);

		// --- CHURN test with retry ---
		let churnRes = null;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			console.log(chalk.magenta(`[${name}] iteration ${i + 1}, churn attempt ${attempt}`));
			churnRes = await page.evaluate(async () => {
				return await window.runMountUnmount?.({ components: 1000, cycles: 100 });
			});

			if (churnRes && typeof churnRes.total_ms === "number" && churnRes.total_ms >= 0) {
				break;
			} else if (attempt === maxRetries) {
				console.warn(chalk.yellow(`[${name}] churn didn't return valid total_ms after ${maxRetries} attempts.`));
				break;
			} else {
				await new Promise((r) => setTimeout(r, 500));
			}
		}
		rawChurnRuns.push(churnRes);

		// short cooldown between iterations
		await new Promise((r) => setTimeout(r, 300));
	}

	await browser.close();
	server.kill();

	// --- compute per-size arrays for render ---
	const sizesSet = new Set();
	rawRenderRuns.forEach((r) => {
		if (r) Object.keys(r).forEach((k) => sizesSet.add(k));
	});
	const sizes = Array.from(sizesSet).sort((a, b) => Number(a) - Number(b));

	const renderPerSize = {};
	for (const s of sizes) {
		const vals = rawRenderRuns.map((r) => (r && r[s] != null ? Number(r[s]) : null)).filter((x) => x != null);
		renderPerSize[s] = statsFromArray(vals);
	}

	// --- bulk totals extraction ---
	// Accept either object with total_ms, or numeric return
	const bulkTotals = rawBulkRuns
		.map((r) => {
			if (r == null) return null;
			if (typeof r === "number") return r;
			if (typeof r.total_ms === "number") return r.total_ms;
			// fallback: if object contains numeric fields, try to prefer total_ms or avg or sum
			if (typeof r.total === "number") return r.total;
			return null;
		})
		.filter((x) => x != null);
	const bulkStats = statsFromArray(bulkTotals);

	// --- churn totals extraction ---
	const churnTotals = rawChurnRuns
		.map((r) => {
			if (r == null) return null;
			if (typeof r === "number") return r;
			if (typeof r.total_ms === "number") return r.total_ms;
			if (typeof r.total === "number") return r.total;
			return null;
		})
		.filter((x) => x != null);
	const churnStats = statsFromArray(churnTotals);

	// write per-framework raw + stats
	const out = {
		framework: name,
		iterations,
		timestamp: new Date().toISOString(),
		raw: { render: rawRenderRuns, bulk: rawBulkRuns, churn: rawChurnRuns },
		stats: { render: renderPerSize, bulk: bulkStats, churn: churnStats },
	};

	await fs.mkdir(outDir, { recursive: true });
	await fs.mkdir(plotsDir, { recursive: true });
	await fs.writeFile(path.join(outDir, `${name}-all-runs.json`), JSON.stringify(out, null, 2));

	console.log(chalk.green(`[${name}] results saved: ${name}-all-runs.json`));
	return out;
}

// ------------------ aggregator + report/plots ------------------
function writeCSVForAll(allResults) {
	const lines = ["framework,test,detail1,detail2,stat, value"];
	for (const r of allResults) {
		// render per size
		const renderStats = r.stats.render || {};
		for (const [size, s] of Object.entries(renderStats)) {
			if (s) {
				lines.push(`${r.framework},render,rows=${size},-,median,${s.median}`);
				lines.push(`${r.framework},render,rows=${size},-,mean,${s.mean}`);
				lines.push(`${r.framework},render,rows=${size},-,min,${s.min}`);
				lines.push(`${r.framework},render,rows=${size},-,max,${s.max}`);
			} else {
				lines.push(`${r.framework},render,rows=${size},-,median,N/A`);
			}
		}
		// bulk
		if (r.stats.bulk) {
			const s = r.stats.bulk;
			lines.push(`${r.framework},bulk,rows=${"10000"},updates=${"1000"},median,${s.median}`);
			lines.push(`${r.framework},bulk,rows=${"10000"},updates=${"1000"},mean,${s.mean}`);
		} else {
			lines.push(`${r.framework},bulk,rows=10000,updates=1000,median,N/A`);
		}
		// churn
		if (r.stats.churn) {
			const s = r.stats.churn;
			lines.push(`${r.framework},churn,components=${"1000"},cycles=${"100"},median,${s.median}`);
			lines.push(`${r.framework},churn,components=${"1000"},cycles=${"100"},mean,${s.mean}`);
		} else {
			lines.push(`${r.framework},churn,components=1000,cycles=100,median,N/A`);
		}
	}
	return lines.join("\n");
}

function buildMarkdownReport(all) {
	const md = [];
	md.push("# Benchmark Results\n");
	md.push(`_Generated: ${new Date().toISOString()}_\n\n`);

	// Render table (sizes from union of first result's render sizes)
	const sizes = (() => {
		const s = new Set();
		all.forEach((r) => {
			if (r && r.stats && r.stats.render) Object.keys(r.stats.render).forEach((k) => s.add(k));
		});
		return Array.from(s).sort((a, b) => Number(a) - Number(b));
	})();

	md.push("## Render time (ms)\n");
	md.push(`| Rows | ${all.map((a) => a.framework.toUpperCase()).join(" | ")} |`);
	md.push(`|------|${all.map(() => "------").join("|")}|`);
	for (const size of sizes) {
		md.push(
			`| ${size} | ${all
				.map((a) => {
					const s = a.stats.render[size];
					return s ? s.median.toFixed(2) : "N/A";
				})
				.join(" | ")} |`,
		);
	}
	md.push("\n");
	md.push("![Render Comparison](plots/render_comparison.png)\n\n");

	// Bulk
	md.push("## Bulk updates (median/mean ms)\n");
	md.push(`| Framework | median | mean | runs |\n|---|---:|---:|---|`);
	for (const a of all) {
		const b = a.stats.bulk;
		if (b) md.push(`| ${a.framework} | ${b.median.toFixed(2)} | ${b.mean.toFixed(2)} | [${b.runs.join(", ")}] |`);
		else md.push(`| ${a.framework} | N/A | N/A | - |\n`);
	}
	md.push("\n");
	md.push("![Bulk Comparison](plots/bulk_comparison.png)\n\n");

	// Churn
	md.push("## Mount/Unmount churn (median/mean ms)\n");
	md.push(`| Framework | median | mean | runs |\n|---|---:|---:|---|`);
	for (const a of all) {
		const c = a.stats.churn;
		if (c) md.push(`| ${a.framework} | ${c.median.toFixed(2)} | ${c.mean.toFixed(2)} | [${c.runs.join(", ")}] |`);
		else md.push(`| ${a.framework} | N/A | N/A | - |\n`);
	}
	md.push("\n");
	md.push("![Churn Comparison](plots/churn_comparison.png)\n\n");

	return md.join("\n");
}

// ------------------ orchestrator ------------------
(async () => {
	try {
		// CLI args: node run-bench.js [framework|all] [iterations]
		const arg = process.argv[2] ?? "all";
		const iterations = Number(process.argv[3] ?? 5);
		const targets = arg === "all" ? Object.keys(projects) : [arg];
		console.log(chalk.blueBright(`Running frameworks: ${targets.join(", ")} (iterations=${iterations})`));

		// ensure out directories exist
		await fs.mkdir(outDir, { recursive: true });
		await fs.mkdir(plotsDir, { recursive: true });

		const allResults = [];
		for (const fw of targets) {
			try {
				const r = await runAllTestsForFramework(fw, iterations);
				allResults.push(r);
			} catch (err) {
				console.error(chalk.red(`Error running ${fw}:`), err);
			}
		}

		// write aggregated CSV
		const csv = writeCSVForAll(allResults);
		await fs.writeFile(path.join(outDir, "results.csv"), csv);

		// generate plots
		// render: sizes + data per framework
		const sizesSet = new Set();
		allResults.forEach((r) => {
			if (r.stats && r.stats.render) Object.keys(r.stats.render).forEach((k) => sizesSet.add(k));
		});
		const sizes = Array.from(sizesSet).sort((a, b) => Number(a) - Number(b));

		const renderFrameworkMap = {};
		allResults.forEach((r) => {
			renderFrameworkMap[r.framework] = r.stats.render || {};
		});
		if (sizes.length > 0) await generateComparisonPlotRender(renderFrameworkMap, sizes, path.join(plotsDir, "render_comparison.png"));

		// bulk & churn plots (simple)
		const bulkMap = {};
		const churnMap = {};
		allResults.forEach((r) => {
			bulkMap[r.framework] = r.stats.bulk || null;
			churnMap[r.framework] = r.stats.churn || null;
		});
		await generateComparisonPlotSimple("Bulk updates", bulkMap, path.join(plotsDir, "bulk_comparison.png"));
		await generateComparisonPlotSimple("Mount/Unmount churn", churnMap, path.join(plotsDir, "churn_comparison.png"));

		// markdown report
		const md = buildMarkdownReport(allResults);
		await fs.writeFile(path.join(outDir, "report.md"), md);

		// write all-results
		await fs.writeFile(path.join(outDir, "all-results.json"), JSON.stringify(allResults, null, 2));

		console.log(chalk.green("=== ✅ All results written to ./out ==="));
	} catch (err) {
		console.error(chalk.red("Fatal error:"), err);
		process.exit(1);
	}
})();
