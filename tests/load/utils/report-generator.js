// tests/load/utils/report-generator.js
// Генератор отчёта о производительности

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Собирает результаты из консольного вывода тестов
 */
export function parseTestOutput(output) {
  const results = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Парсим строки вида: "PR List baseline: Samples: 5, Avg: 135ms, Min: 130ms, Max: 145ms, P50: 133ms, P95: 145ms, P99: 145ms"
    const match = line.match(
      /(.+?):\s*Samples:\s*(\d+),\s*Avg:\s*(\d+)ms,\s*Min:\s*(\d+)ms,\s*Max:\s*(\d+)ms,\s*P50:\s*(\d+)ms,\s*P95:\s*(\d+)ms,\s*P99:\s*(\d+)ms/,
    );

    if (match) {
      results.push({
        name: match[1].trim(),
        samples: parseInt(match[2]),
        avg: parseInt(match[3]),
        min: parseInt(match[4]),
        max: parseInt(match[5]),
        p50: parseInt(match[6]),
        p95: parseInt(match[7]),
        p99: parseInt(match[8]),
      });
    }

    // Парсим limit comparison
    const limitMatch = line.match(
      /limit=(\d+):\s*avg=(\d+)ms(?:,\s*items=(\d+))?/,
    );
    if (limitMatch) {
      results.push({
        name: `limit=${limitMatch[1]}`,
        avg: parseInt(limitMatch[2]),
        items: limitMatch[3] ? parseInt(limitMatch[3]) : null,
      });
    }

    // Парсим offset comparison
    const offsetMatch = line.match(/offset=(\d+):\s*avg=(\d+)ms/);
    if (offsetMatch) {
      results.push({
        name: `offset=${offsetMatch[1]}`,
        avg: parseInt(offsetMatch[2]),
      });
    }

    // Парсим parallel results
    const parallelMatch = line.match(
      /(\d+)\s*parallel.*?:\s*total=(\d+)ms,\s*avg=(\d+)ms,\s*success=(\d+)\/(\d+)/,
    );
    if (parallelMatch) {
      results.push({
        name: `${parallelMatch[1]} parallel requests`,
        totalTime: parseInt(parallelMatch[2]),
        avg: parseInt(parallelMatch[3]),
        success: parseInt(parallelMatch[4]),
        total: parseInt(parallelMatch[5]),
      });
    }
  }

  return results;
}

/**
 * Генерирует HTML отчёт
 */
export function generateHTMLReport(data, outputPath) {
  const { baseline, volume, stress, summary } = data;

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Load Test Report - ${new Date().toLocaleDateString("ru")}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    h1 { text-align: center; margin-bottom: 30px; color: #1a1a1a; }
    h2 { margin: 30px 0 15px; padding-bottom: 10px; border-bottom: 2px solid #ddd; }
    h3 { margin: 20px 0 10px; color: #555; }

    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
    .summary-card .value { font-size: 2em; font-weight: bold; color: #2196F3; }
    .summary-card .label { color: #666; margin-top: 5px; }
    .summary-card.good .value { color: #4CAF50; }
    .summary-card.warning .value { color: #FF9800; }
    .summary-card.bad .value { color: #f44336; }

    .chart-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .chart-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }

    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; }
    tr:hover { background: #f5f5f5; }

    .status { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 0.85em; }
    .status.good { background: #e8f5e9; color: #2e7d32; }
    .status.warning { background: #fff3e0; color: #ef6c00; }
    .status.bad { background: #ffebee; color: #c62828; }

    .thresholds { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .thresholds h4 { margin-bottom: 10px; }
    .threshold-item { display: inline-block; margin-right: 20px; }

    footer { text-align: center; padding: 20px; color: #666; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Load Test Performance Report</h1>
    <p style="text-align: center; color: #666; margin-bottom: 30px;">
      Дата: ${new Date().toLocaleString("ru")} | Целевой клиент: 10,000 сотрудников
    </p>

    <div class="summary">
      <div class="summary-card ${summary.avgResponseTime < 200 ? "good" : summary.avgResponseTime < 500 ? "warning" : "bad"}">
        <div class="value">${summary.avgResponseTime}ms</div>
        <div class="label">Среднее время ответа</div>
      </div>
      <div class="summary-card ${summary.p95ResponseTime < 500 ? "good" : summary.p95ResponseTime < 1000 ? "warning" : "bad"}">
        <div class="value">${summary.p95ResponseTime}ms</div>
        <div class="label">P95 время ответа</div>
      </div>
      <div class="summary-card ${summary.successRate > 95 ? "good" : summary.successRate > 90 ? "warning" : "bad"}">
        <div class="value">${summary.successRate}%</div>
        <div class="label">Успешных запросов</div>
      </div>
      <div class="summary-card">
        <div class="value">${summary.totalTests}</div>
        <div class="label">Тестов выполнено</div>
      </div>
    </div>

    <div class="thresholds">
      <h4>Пороговые значения (SLA)</h4>
      <span class="threshold-item">🟢 FAST: &lt;1000ms</span>
      <span class="threshold-item">🟡 NORMAL: &lt;2000ms</span>
      <span class="threshold-item">🟠 SLOW: &lt;3000ms</span>
      <span class="threshold-item">🔴 COMPLEX: &lt;5000ms</span>
    </div>

    <h2>📈 Baseline Performance</h2>
    <div class="chart-row">
      <div class="chart-container">
        <canvas id="baselineChart"></canvas>
      </div>
      <div class="chart-container">
        <canvas id="p95Chart"></canvas>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Avg (ms)</th>
          <th>P50 (ms)</th>
          <th>P95 (ms)</th>
          <th>Min (ms)</th>
          <th>Max (ms)</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        ${baseline
          .map(
            (r) => `
        <tr>
          <td>${r.name}</td>
          <td>${r.avg}</td>
          <td>${r.p50 || "-"}</td>
          <td>${r.p95 || "-"}</td>
          <td>${r.min || "-"}</td>
          <td>${r.max || "-"}</td>
          <td><span class="status ${r.avg < 200 ? "good" : r.avg < 500 ? "warning" : "bad"}">${r.avg < 200 ? "OK" : r.avg < 500 ? "SLOW" : "CRITICAL"}</span></td>
        </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>

    ${
      volume.length > 0
        ? `
    <h2>📊 Volume Tests</h2>
    <div class="chart-container">
      <canvas id="volumeChart"></canvas>
    </div>
    <table>
      <thead>
        <tr>
          <th>Тест</th>
          <th>Avg (ms)</th>
          <th>Items</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        ${volume
          .map(
            (r) => `
        <tr>
          <td>${r.name}</td>
          <td>${r.avg}</td>
          <td>${r.items || "-"}</td>
          <td><span class="status ${r.avg < 500 ? "good" : r.avg < 1000 ? "warning" : "bad"}">${r.avg < 500 ? "OK" : r.avg < 1000 ? "SLOW" : "CRITICAL"}</span></td>
        </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
    `
        : ""
    }

    ${
      stress.length > 0
        ? `
    <h2>⚡ Stress Tests</h2>
    <div class="chart-container">
      <canvas id="stressChart"></canvas>
    </div>
    <table>
      <thead>
        <tr>
          <th>Тест</th>
          <th>Total (ms)</th>
          <th>Avg (ms)</th>
          <th>Success</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        ${stress
          .map(
            (r) => `
        <tr>
          <td>${r.name}</td>
          <td>${r.totalTime || "-"}</td>
          <td>${r.avg}</td>
          <td>${r.success}/${r.total}</td>
          <td><span class="status ${r.success === r.total ? "good" : r.success > r.total * 0.9 ? "warning" : "bad"}">${r.success === r.total ? "OK" : "ERRORS"}</span></td>
        </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
    `
        : ""
    }

    <footer>
      Generated by Load Test Framework | ${new Date().toISOString()}
    </footer>
  </div>

  <script>
    const baselineData = ${JSON.stringify(baseline)};
    const volumeData = ${JSON.stringify(volume)};
    const stressData = ${JSON.stringify(stress)};

    // Baseline Chart
    new Chart(document.getElementById('baselineChart'), {
      type: 'bar',
      data: {
        labels: baselineData.map(d => d.name.substring(0, 30)),
        datasets: [{
          label: 'Avg Response Time (ms)',
          data: baselineData.map(d => d.avg),
          backgroundColor: baselineData.map(d => d.avg < 200 ? '#4CAF50' : d.avg < 500 ? '#FF9800' : '#f44336'),
        }]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Average Response Time by Endpoint' } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'ms' } } }
      }
    });

    // P95 Chart
    new Chart(document.getElementById('p95Chart'), {
      type: 'bar',
      data: {
        labels: baselineData.filter(d => d.p95).map(d => d.name.substring(0, 30)),
        datasets: [{
          label: 'P95 Response Time (ms)',
          data: baselineData.filter(d => d.p95).map(d => d.p95),
          backgroundColor: '#2196F3',
        }]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'P95 Response Time by Endpoint' } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'ms' } } }
      }
    });

    // Volume Chart
    if (volumeData.length > 0 && document.getElementById('volumeChart')) {
      new Chart(document.getElementById('volumeChart'), {
        type: 'line',
        data: {
          labels: volumeData.map(d => d.name),
          datasets: [{
            label: 'Response Time (ms)',
            data: volumeData.map(d => d.avg),
            borderColor: '#2196F3',
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          plugins: { title: { display: true, text: 'Response Time vs Data Volume' } }
        }
      });
    }

    // Stress Chart
    if (stressData.length > 0 && document.getElementById('stressChart')) {
      new Chart(document.getElementById('stressChart'), {
        type: 'bar',
        data: {
          labels: stressData.map(d => d.name),
          datasets: [
            {
              label: 'Success Rate (%)',
              data: stressData.map(d => (d.success / d.total * 100).toFixed(1)),
              backgroundColor: '#4CAF50',
            },
            {
              label: 'Avg Time (ms)',
              data: stressData.map(d => d.avg),
              backgroundColor: '#2196F3',
            }
          ]
        },
        options: {
          responsive: true,
          plugins: { title: { display: true, text: 'Stress Test Results' } }
        }
      });
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  console.log(`Report generated: ${outputPath}`);
  return outputPath;
}

/**
 * Создаёт тестовые данные для демонстрации
 */
export function createSampleData() {
  return {
    baseline: [
      {
        name: "OrgStructure Tree Items",
        samples: 5,
        avg: 130,
        min: 114,
        max: 169,
        p50: 119,
        p95: 169,
        p99: 169,
      },
      {
        name: "OrgStructure Flat Tree",
        samples: 5,
        avg: 134,
        min: 121,
        max: 146,
        p50: 136,
        p95: 146,
        p99: 146,
      },
      {
        name: "OrgStructure Users",
        samples: 5,
        avg: 147,
        min: 122,
        max: 214,
        p50: 132,
        p95: 214,
        p99: 214,
      },
      {
        name: "OrgStructure Departments",
        samples: 5,
        avg: 121,
        min: 111,
        max: 125,
        p50: 125,
        p95: 125,
        p99: 125,
      },
      {
        name: "PR List",
        samples: 5,
        avg: 135,
        min: 130,
        max: 145,
        p50: 133,
        p95: 145,
        p99: 145,
      },
      {
        name: "PR Details",
        samples: 5,
        avg: 119,
        min: 109,
        max: 129,
        p50: 118,
        p95: 129,
        p99: 129,
      },
      {
        name: "PR Target Users",
        samples: 5,
        avg: 122,
        min: 119,
        max: 126,
        p50: 122,
        p95: 126,
        p99: 126,
      },
      {
        name: "PR Dashboard",
        samples: 5,
        avg: 167,
        min: 150,
        max: 180,
        p50: 172,
        p95: 180,
        p99: 180,
      },
      {
        name: "Survey List",
        samples: 5,
        avg: 128,
        min: 123,
        max: 131,
        p50: 131,
        p95: 131,
        p99: 131,
      },
      {
        name: "Survey Details",
        samples: 5,
        avg: 126,
        min: 112,
        max: 150,
        p50: 120,
        p95: 150,
        p99: 150,
      },
      {
        name: "Survey Statistics Summary",
        samples: 5,
        avg: 338,
        min: 272,
        max: 558,
        p50: 290,
        p95: 558,
        p99: 558,
      },
      {
        name: "Survey Statistics Users",
        samples: 5,
        avg: 107,
        min: 105,
        max: 109,
        p50: 107,
        p95: 109,
        p99: 109,
      },
    ],
    volume: [
      { name: "limit=10", avg: 134, items: 10 },
      { name: "limit=50", avg: 142, items: 50 },
      { name: "limit=100", avg: 146, items: 100 },
      { name: "limit=500", avg: 149, items: 500 },
      { name: "offset=0", avg: 137 },
      { name: "offset=100", avg: 151 },
      { name: "offset=500", avg: 149 },
    ],
    stress: [
      {
        name: "10 parallel requests",
        totalTime: 850,
        avg: 135,
        success: 10,
        total: 10,
      },
      {
        name: "25 parallel requests",
        totalTime: 1200,
        avg: 148,
        success: 25,
        total: 25,
      },
      {
        name: "50 parallel requests",
        totalTime: 2100,
        avg: 162,
        success: 48,
        total: 50,
      },
    ],
    summary: {
      avgResponseTime: 152,
      p95ResponseTime: 214,
      successRate: 98.5,
      totalTests: 45,
    },
  };
}

// CLI
if (process.argv[1] && process.argv[1].includes("report-generator")) {
  const data = createSampleData();
  const outputPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "load-test-report.html",
  );
  generateHTMLReport(data, outputPath);
  console.log(`\nOpen in browser: file://${outputPath}`);
}
