# Frontend Framework Benchmark

This project benchmarks the rendering performance of **React**, **Vue**, and **Angular** using the same test scenarios.  
It measures how fast each framework can handle large amounts of DOM updates.

## 📂 Project structure
```markdown
framework-benchmarks/
│
├── react-bench/ # React implementation
├── vue-bench/ # Vue implementation
├── angular-bench/ # Angular implementation
└── tests/ # Benchmark runner (Puppeteer + reporting)
```


Each framework folder contains a minimal app with a dynamic table renderer and additional benchmarks.  
The `tests` folder contains the runner that executes each benchmark and generates comparable results.

## 🧪 Benchmarks

Currently implemented:

1. **Table Rendering Test**  
   - Renders tables with `10`, `100`, `1000`, and `50000` rows.  
   - Measures render time until stable paint.

2. **Bulk Update Test**  
   - Creates `10000` rows and updates them all at once.  
   - Measures update latency.

3. **Mount/Unmount Test**  
   - Mounts and unmounts a component `1000x`.  
   - Measures how quickly the framework can clean up and recreate components.

## ⚙️ Setup

1. Clone repo and install dependencies for each project:

   ```bash
   cd framework-benchmarks/react-bench && npm install
   cd ../vue-bench && npm install
   cd ../angular-bench && npm install
   cd ../tests && npm install
   ```

2. Make sure you are on **Node.js ≥ 18** (works on Linux, macOS, Windows).

## ▶️ Running benchmarks

From the `framework-benchmarks/tests` folder:

- Run React only:
   ```bash
    npm run bench:react
   ```
- Run Angular only:
   ```bash
    npm run bench:angular
   ```
- Run Vue only:
   ```bash
    npm run bench:vue
   ```
- Run all frameworks:
   ```bash
    npm run bench:all
   ```

## 📊 Results

Results are written to `framework-benchmarks/tests/out/`:

- `*-results.json` → raw results for each framework

- `results.csv` → aggregated data (for Excel/Sheets)

- `report.md` → Markdown table (ready to copy into docs)

Example:
# Benchmark Results

| Rows   | REACT | VUE  | ANGULAR |
|--------|-------|------|---------|
| 10     | 3.12  | 2.95 | 4.01    |
| 100    | 8.54  | 7.33 | 9.42    |
| 1000   | 34.77 | 29.80| 41.12   |
| 50000  | 2987  | 2511 | 3277    |

## 📝 Notes

- Puppeteer launches Chrome headless and measures timing via the app’s benchmark API.

- Angular may take longer to start. The runner waits until the server port responds before starting measurements.

- For reproducible results, close other apps before running the tests.