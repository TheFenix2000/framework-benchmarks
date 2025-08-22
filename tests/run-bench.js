import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";

const root = path.resolve(".");
const projects = {
	react: { dir: path.join(root, "../react-bench"), port: 4173, build: "npm run build", start: ["npm", ["run", "preview"]] },
	vue: { dir: path.join(root, "../vue-bench"), port: 4173, build: "npm run build", start: ["npm", ["run", "preview"]] },
	angular: { dir: path.join(root, "../angular-bench"), port: 4200, build: "npm run build", start: ["npm", ["start", "--", "--configuration=production"]] },
};

async function exec(cmd, opts = {}) {
	return new Promise((res, rej) => {
		const p = spawn(cmd, { shell: true, ...opts });
		p.on("exit", (code) => (code === 0 ? res() : rej(new Error("cmd failed: " + cmd))));
	});
}

async function runAllTestsForFramework(name) {
	const proj = projects[name];
	if (!proj) throw new Error("Unknown: " + name);
	console.log(`\n=== [${name}] build ===`);
	await exec(proj.build, { cwd: proj.dir });

	console.log(`=== [${name}] start server ===`);
	const server = spawn(proj.start[0], proj.start[1], {
		cwd: proj.dir,
		stdio: "inherit",
		shell: true,
	});

	console.log(`=== [${name}] launching puppeteer ===`);
	const browser = await puppeteer.launch({ headless: "true", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
	const page = await browser.newPage();
	const url = `http://localhost:${proj.port}`;
	console.log(`[${name}] goto ${url}`);
	if (name === "angular") {
		// Angular needs a bit more time to start
		await new Promise((r) => setTimeout(r, 4500));
	}
	await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

	await page.waitForFunction(() => !!window.runRenderBenchmark, { timeout: 60000 });

	// 1) render benchmark
	console.log(`[${name}] running render benchmark...`);
	const renderRes = await page.evaluate(async () => {
		if (typeof window.runRenderBenchmark === "function") {
			return await window.runRenderBenchmark();
		}
		return null;
	});

	// 2) bulk updates (default 10000 rows, 1000 updates)
	console.log(`[${name}] running bulk updates...`);
	const bulkRes = await page.evaluate(async () => {
		if (typeof window.runBulkUpdates === "function") {
			return await window.runBulkUpdates({ rowsCount: 10000, updatesCount: 1000 });
		}
		return null;
	});

	// 3) mount/unmount churn (default 1000 components, 100 cycles)
	console.log(`[${name}] running mount/unmount churn...`);
	const churnRes = await page.evaluate(async () => {
		if (typeof window.runMountUnmount === "function") {
			return await window.runMountUnmount({ components: 1000, cycles: 100 });
		}
		return null;
	});

	// collect unified object
	const out = { framework: name, render: renderRes, bulk: bulkRes, churn: churnRes, timestamp: new Date().toISOString() };

	await fs.mkdir(path.join(root, "./out"), { recursive: true });
	await fs.writeFile(path.join(root, `./out/${name}-results.json`), JSON.stringify(out, null, 2));

	await browser.close();
	server.kill();

	return out;
}

function allResultsToCSV(all) {
	// columns: framework,test,subparam,time_ms,extra
	const lines = ["framework,test,detail1,detail2,time_ms"];
	for (const r of all) {
		// render: multiple rows
		for (const [rows, t] of Object.entries(r.render || {})) {
			lines.push(`${r.framework},render,rows=${rows},-,${t}`);
		}
		// bulk
		if (r.bulk) {
			lines.push(`${r.framework},bulk,rows=${r.bulk.rows},updates=${r.bulk.updates},${r.bulk.total_ms}`);
		}
		// churn
		if (r.churn) {
			lines.push(`${r.framework},churn,components=${r.churn.components},cycles=${r.churn.cycles},${r.churn.total_ms}`);
		}
	}
	return lines.join("\n");
}

function buildMarkdownReport(all) {
	// 3 tables: render, bulk, churn
	const md = [];
	md.push("# Benchmark Results\n");
	// render header - collect sizes from first framework
	const firstRender = all[0].render || {};
	const sizes = Object.keys(firstRender);
	// Render table
	md.push("## Render time (ms)\n");
	md.push(`| Rows | ${all.map((a) => a.framework.toUpperCase()).join(" | ")} |`);
	md.push(`|------|${all.map(() => "------").join("|")}|`);
	for (const s of sizes) {
		md.push(`| ${s} | ${all.map((a) => (a.render && a.render[s] != null ? a.render[s] : "N/A")).join(" | ")} |`);
	}
	md.push("\n");

	// Bulk table
	md.push("## Bulk updates (rows, updates, total_ms, avg_ms)\n");
	md.push(`| Framework | rows | updates | total_ms | avg_ms |`);
	md.push(`|-----------|------|---------|----------|--------|`);
	for (const a of all) {
		const b = a.bulk || {};
		md.push(`| ${a.framework} | ${b.rows ?? "N/A"} | ${b.updates ?? "N/A"} | ${b.total_ms ?? "N/A"} | ${b.avg_ms ?? "N/A"} |`);
	}
	md.push("\n");

	// Churn table
	md.push("## Mount/Unmount churn (components, cycles, total_ms, avg_cycle_ms)\n");
	md.push(`| Framework | components | cycles | total_ms | avg_cycle_ms |`);
	md.push(`|-----------|------------|--------|----------|--------------|`);
	for (const a of all) {
		const c = a.churn || {};
		md.push(`| ${a.framework} | ${c.components ?? "N/A"} | ${c.cycles ?? "N/A"} | ${c.total_ms ?? "N/A"} | ${c.avg_cycle_ms ?? "N/A"} |`);
	}
	md.push("\n");
	md.push(`_Generated: ${new Date().toISOString()}_\n`);
	return md.join("\n");
}

(async () => {
	const arg = process.argv[2] ?? "all";
	const frameworks = arg === "all" ? Object.keys(projects) : [arg];
	const results = [];
	for (const fw of frameworks) {
		try {
			const r = await runAllTestsForFramework(fw);
			results.push(r);
		} catch (e) {
			console.error(`Error for ${fw}:`, e);
		}
	}

	// write CSV + MD
	const csv = allResultsToCSV(results);
	const md = buildMarkdownReport(results);
	await fs.writeFile(path.join(root, "./out/results.csv"), "framework,test,detail1,detail2,time_ms\n" + csv + "\n");
	await fs.writeFile(path.join(root, "./out/report.md"), md);
	await fs.writeFile(path.join(root, "./out/all-results.json"), JSON.stringify(results, null, 2));
	console.log("\n=== Finished. Outputs in ./out ===");
})();
