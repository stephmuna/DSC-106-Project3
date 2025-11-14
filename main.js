const mapSvg = d3.select("#mapSvg");
const lineSvg = d3.select("#lineSvg");

const mapWidth = +mapSvg.attr("width");
const mapHeight = +mapSvg.attr("height");
const lineWidth = +lineSvg.attr("width");
const lineHeight = +lineSvg.attr("height");

const margin = { top: 40, right: 20, bottom: 40, left: 55 };

let gridData = [];
let years = [];
let yearList = [];
let currentYear;
let currentVariable = "tas";
let stateFeatures;
let statesG;
const brushStatsDiv = d3.select("#brushStats");
const brushStatesDiv = d3.select("#brushStates");
let currentYearIndex = 0;

const projection = d3.geoAlbersUsa()
  .translate([mapWidth / 2, mapHeight / 2])
  .scale(900);

const path = d3.geoPath(projection);

const mapG = mapSvg.append("g");
const brushG = mapG.append("g").attr("class", "brush");

const lineG = lineSvg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const xLine = d3.scaleLinear();
const yLine = d3.scaleLinear();

const xAxisG = lineG.append("g")
  .attr("transform", `translate(0,${lineHeight - margin.top - margin.bottom})`);
const yAxisG = lineG.append("g");

const linePathHist = lineG.append("path")
  .attr("fill", "none")
  .attr("stroke-width", 2);

const linePathSSP = lineG.append("path")
  .attr("fill", "none")
  .attr("stroke-width", 2);

const tooltip = d3.select("body").append("div")
  .style("position", "absolute")
  .style("pointer-events", "none")
  .style("padding", "4px 8px")
  .style("font-size", "12px")
  .style("background", "white")
  .style("border", "1px solid #ccc")
  .style("border-radius", "4px")
  .style("display", "none");

// ---------- COLOR LEGEND FOR MAP ----------
function drawColorLegend(colorScale, minVal, maxVal) {
  const legendWidth = 260;
  const legendHeight = 10;

  // Create or select legend group
  let legendG = mapSvg.select("g.color-legend");
  if (legendG.empty()) {
    legendG = mapSvg.append("g")
      .attr("class", "color-legend")
      .attr(
        "transform",
        `translate(${(mapWidth - legendWidth) / 2}, ${mapHeight - 35})`
      );
  }

  // Clear previous contents
  legendG.selectAll("*").remove();

  // Create or reuse defs
  let defs = mapSvg.select("defs#legend-defs");
  if (defs.empty()) {
    defs = mapSvg.append("defs").attr("id", "legend-defs");
  }

  const gradientId = "legend-gradient";

  // Remove old gradient if it exists
  defs.select(`#${gradientId}`).remove();

  const gradient = defs.append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%");

  const stops = d3.range(0, 1.01, 0.1).map(t => ({
    offset: `${t * 100}%`,
    color: colorScale(minVal + t * (maxVal - minVal))
  }));

  gradient.selectAll("stop")
    .data(stops)
    .enter()
    .append("stop")
    .attr("offset", d => d.offset)
    .attr("stop-color", d => d.color);

  // Color bar rectangle
  legendG.append("rect")
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .style("fill", `url(#${gradientId})`)
    .style("stroke", "#333")
    .style("stroke-width", 0.5);

  // Axis for numeric values
  const legendScale = d3.scaleLinear()
    .domain([minVal, maxVal])
    .range([0, legendWidth]);

  const legendAxis = d3.axisBottom(legendScale)
    .ticks(5)
    .tickFormat(d => d.toFixed(1));

  legendG.append("g")
    .attr("transform", `translate(0, ${legendHeight})`)
    .call(legendAxis)
    .selectAll("text")
    .style("font-size", "10px");

  // Label text
  const labelText = currentVariable === "tas"
    ? "Temperature anomaly (°C)"
    : "Precipitation anomaly (mm / year)";

  legendG.append("text")
    .attr("x", legendWidth / 2)
    .attr("y", -6)
    .attr("font-size", 11)
    .attr("font-weight", "600")
    .attr("text-anchor", "middle")
    .text(labelText);
}

// ---------- DATA LOAD ----------
Promise.all([
  d3.csv("data/cmip_us_grid_tas_pr_anom2.csv", d3.autoType),
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json")
]).then(([grid, us]) => {
  grid.forEach(d => {
    d.lon180 = d.lon > 180 ? d.lon - 360 : d.lon;
  });

  gridData = grid;

  yearList = Array.from(new Set(gridData.map(d => d.year))).sort(d3.ascending);
  years = d3.extent(yearList);
  currentYearIndex = 0;
  currentYear = yearList[0];

  setupControls();
  drawBasemap(us);
  drawMap();
  drawTimeSeries();
});

function scenarioForYear(year) {
  return year <= 2014 ? "historical" : "ssp585";
}

function setupControls() {
  const slider = d3.select("#yearSlider");
  const yearLabel = d3.select("#yearLabel");

  function updateSliderDomain() {
    slider
      .attr("min", 0)
      .attr("max", yearList.length - 1)
      .attr("step", 1);

    if (currentYearIndex < 0 || currentYearIndex >= yearList.length) {
      currentYearIndex = 0;
    }

    slider.property("value", currentYearIndex);
    currentYear = yearList[currentYearIndex];
    yearLabel.text(currentYear);
  }

  slider.on("input", event => {
    currentYearIndex = +event.target.value;
    currentYear = yearList[currentYearIndex];
    yearLabel.text(currentYear);
    drawMap();
  });

  d3.select("#variableSelect").on("change", event => {
    currentVariable = event.target.value;
    updateSliderDomain();
    drawMap();
    drawTimeSeries();
  });

  updateSliderDomain();
}

function drawBasemap(us) {
  const states = topojson.feature(us, us.objects.states);
  stateFeatures = states.features;

  statesG = mapG.append("g").attr("class", "states");

  statesG.selectAll("path")
    .data(stateFeatures)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#777")
    .attr("stroke-width", 0.8)
    .attr("fill", "#f7f7f7");

  const brush = d3.brush()
    .extent([[0, 0], [mapWidth, mapHeight]])
    .on("end", brushed);

  brushG.call(brush);
  brushG.raise();

  setupOverlayHover();
}

function drawMap() {
  if (!stateFeatures) return;

  const scenario = scenarioForYear(currentYear);

  const cells = gridData.filter(d =>
    d.year === currentYear &&
    d.scenario === scenario &&
    d.variable === currentVariable
  );

  const vals = cells.map(d => d.anom);
  let maxAbs = d3.max(vals, v => Math.abs(v)) || 1;
  maxAbs = maxAbs * 0.6;

  const color = d3.scaleDiverging()
    .domain([maxAbs, 0, -maxAbs])
    .interpolator(d3.interpolateRdBu);

  // draw/update legend (styling only)
  drawColorLegend(color, -maxAbs, maxAbs);

  const valsByState = new Map();
  stateFeatures.forEach(f => valsByState.set(f.id, []));

  cells.forEach(d => {
    const point = [d.lon180, d.lat];
    stateFeatures.forEach(f => {
      if (d3.geoContains(f, point)) {
        valsByState.get(f.id).push(d.anom);
      }
    });
  });

  const meanByState = new Map();
  valsByState.forEach((arr, id) => {
    if (arr.length) meanByState.set(id, d3.mean(arr));
  });

  statesG.selectAll("path")
    .data(stateFeatures)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#777")
    .attr("stroke-width", 0.8)
    .attr("fill", d => {
      const v = meanByState.get(d.id);
      return v == null ? "#f0f0f0" : color(v);
    })
    .on("mousemove", (event, d) => {
      const v = meanByState.get(d.id);
      const scen = scenarioForYear(currentYear);
      tooltip
        .style("display", "block")
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + 10 + "px")
        .html(`
          <strong>${d.properties.name}</strong><br/>
          ${scen}, ${currentYear}<br/>
          ${currentVariable === "tas" ? "Temp anomaly:" : "Precip anomaly:"}
          ${v != null ? v.toFixed(2) : "N/A"} ${currentVariable === "tas" ? "°C" : "mm/yr"}
        `);

      d3.select(event.currentTarget)
        .attr("stroke-width", 2);
    })
    .on("mouseleave", event => {
      tooltip.style("display", "none");
      d3.select(event.currentTarget)
        .attr("stroke-width", 0.8);
    })
    .on("click", (event, d) => {
      const stateCells = gridData.filter(row =>
        row.variable === currentVariable &&
        d3.geoContains(d, [row.lon180, row.lat])
      );
      drawTimeSeries(stateCells);
    });
}

function brushed(event) {
  const s = event.selection;

  if (!s) {
    updateBrushSummary(null);
    drawTimeSeries();
    return;
  }

  const [[x0, y0], [x1, y1]] = s;

  const selectedCells = gridData.filter(d => {
    if (d.variable !== currentVariable) return false;
    const proj = projection([d.lon180, d.lat]);
    if (!proj) return false;
    const [x, y] = proj;
    return x0 <= x && x <= x1 && y0 <= y && y <= y1;
  });

  updateBrushSummary(selectedCells);
  drawTimeSeries(selectedCells);
}

function updateBrushSummary(selectedCells) {
  // Grab metric elements
  const yearEl = document.getElementById("metricYear");
  const scenEl = document.getElementById("metricScenario");
  const meanEl = document.getElementById("metricMean");
  const minEl  = document.getElementById("metricMin");
  const maxEl  = document.getElementById("metricMax");
  const statesEl = document.getElementById("metricStates");

  // Helper to reset when nothing is selected
  function resetMetrics(message) {
    yearEl.textContent  = "—";
    scenEl.textContent  = "—";
    meanEl.textContent  = "—";
    minEl.textContent   = "—";
    maxEl.textContent   = "—";
    statesEl.textContent = message || "No region selected. Showing US average.";
  }

  const varLabel = currentVariable === "tas" ? "temperature" : "precipitation";

  // No selection at all
  if (!selectedCells || !selectedCells.length) {
    resetMetrics();
    return;
  }

  const scen = scenarioForYear(currentYear);

  const currentCells = selectedCells.filter(d =>
    d.year === currentYear &&
    d.scenario === scen
  );

  // Selection exists, but no data for this year/scenario
  if (!currentCells.length) {
    yearEl.textContent = currentYear;
    scenEl.textContent = scen;
    meanEl.textContent = "—";
    minEl.textContent  = "—";
    maxEl.textContent  = "—";
    statesEl.textContent = `No data in selection for ${scen}, ${currentYear}.`;
    return;
  }

  // Compute stats
  const mean = d3.mean(currentCells, d => d.anom);
  const min  = d3.min(currentCells, d => d.anom);
  const max  = d3.max(currentCells, d => d.anom);
  const unit = currentVariable === "tas" ? "°C" : "mm/yr";

  // Fill metric strip
  yearEl.textContent = currentYear;
  scenEl.textContent = scen;
  meanEl.textContent = `${mean.toFixed(2)} ${unit}`;
  minEl.textContent  = min.toFixed(2);
  maxEl.textContent  = max.toFixed(2);

  // States in region (same logic you had before)
  const statesSet = new Set();
  selectedCells.forEach(cell => {
    const pt = [cell.lon180, cell.lat];
    stateFeatures.forEach(st => {
      if (d3.geoContains(st, pt)) {
        statesSet.add(st.properties.name);
      }
    });
  });

  const names = Array.from(statesSet).sort();
  statesEl.textContent = names.length
    ? names.join(", ")
    : "(none)";
}

function drawTimeSeries(selectedCells) {
  const usData = gridData.filter(d => d.variable === currentVariable);

  const usRolled = d3.rollups(
    usData,
    v => d3.mean(v, d => d.anom),
    d => d.year
  );

  const usSeries = usRolled
    .map(([year, val]) => ({ year: +year, value: +val }))
    .sort((a, b) => d3.ascending(a.year, b.year));

  let regionSeries = [];
  if (selectedCells && selectedCells.length) {
    const regionRolled = d3.rollups(
      selectedCells,
      v => d3.mean(v, d => d.anom),
      d => d.year
    );
    regionSeries = regionRolled
      .map(([year, val]) => ({ year: +year, value: +val }))
      .sort((a, b) => d3.ascending(a.year, b.year));
  }

  const allSeries = regionSeries.length ? [usSeries, regionSeries] : [usSeries];
  const allYears = d3.extent(allSeries.flatMap(s => s.map(v => v.year)));
  const allVals = d3.extent(allSeries.flatMap(s => s.map(v => v.value)));
  const pad = (allVals[1] - allVals[0]) * 0.1 || 1;

  const innerWidth = lineWidth - margin.left - margin.right;
  const innerHeight = lineHeight - margin.top - margin.bottom;

  xLine.domain(allYears).range([0, innerWidth]);
  yLine.domain([allVals[0] - pad, allVals[1] + pad]).range([innerHeight, 0]);

  xAxisG.call(d3.axisBottom(xLine).ticks(6));
  yAxisG.call(d3.axisLeft(yLine));

  const lineGen = d3.line()
    .x(d => xLine(d.year))
    .y(d => yLine(d.value));

  linePathHist
    .datum(usSeries)
    .attr("stroke", "#aaa")
    .attr("stroke-dasharray", "4,2")
    .attr("d", lineGen);

  linePathSSP
    .datum(regionSeries)
    .attr("stroke", "#d62728")
    .attr("stroke-dasharray", null)
    .attr("d", regionSeries.length ? lineGen : null);

  // ---------- LEGEND FOR LINE CHART ----------
  const legend = lineSvg.selectAll("g.line-legend").data([null]);

  const legendEnter = legend.enter()
    .append("g")
    .attr("class", "line-legend")
    .attr("transform", `translate(${margin.left}, ${lineHeight - 10})`);

  const legendG = legendEnter.merge(legend);
  legendG.selectAll("*").remove();

  // US baseline (grey dashed)
  legendG.append("line")
    .attr("x1", 0)
    .attr("x2", 30)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", "#aaa")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "4,2");

  legendG.append("text")
    .attr("x", 40)
    .attr("y", 4)
    .attr("font-size", 12)
    .text("US baseline");

  // Selected region (red line)
  legendG.append("line")
    .attr("x1", 140)
    .attr("x2", 170)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", "#d62728")
    .attr("stroke-width", 2);

  legendG.append("text")
    .attr("x", 180)
    .attr("y", 4)
    .attr("font-size", 12)
    .text("Selected region");

  const titleText = currentVariable === "tas"
    ? "Average temperature anomaly (°C, 1950–2100)"
    : "Average precipitation anomaly (mm / year, 1950–2100)";

  const title = lineSvg.selectAll("text.title").data([titleText]);
  title.join(
    enter => enter.append("text")
      .attr("class", "title")
      .attr("x", margin.left)
      .attr("y", 20)
      .attr("font-size", 14)
      .attr("font-weight", "600")
      .text(d => d),
    update => update.text(d => d)
  );
}

function setupOverlayHover() {
  const overlay = brushG.select(".overlay")
    .style("cursor", "crosshair");

  overlay
    .on("mousemove.hover", event => {
      const [mx, my] = d3.pointer(event, mapSvg.node());
      const geo = projection.invert([mx, my]);
      if (!geo) {
        tooltip.style("display", "none");
        return;
      }
      const [lon, lat] = geo;

      const st = stateFeatures.find(f => d3.geoContains(f, [lon, lat]));
      if (!st) {
        tooltip.style("display", "none");
        return;
      }

      const scen = scenarioForYear(currentYear);
      const cells = gridData.filter(row =>
        row.year === currentYear &&
        row.scenario === scen &&
        row.variable === currentVariable &&
        d3.geoContains(st, [row.lon180, row.lat])
      );

      const val = cells.length ? d3.mean(cells, d => d.anom) : null;

      tooltip
        .style("display", "block")
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + 10 + "px")
        .html(`
          <strong>${st.properties.name}</strong><br/>
          ${scen}, ${currentYear}<br/>
          ${currentVariable === "tas" ? "Temp anomaly:" : "Precip anomaly:"}
          ${val != null ? val.toFixed(2) : "N/A"} ${currentVariable === "tas" ? "°C" : "mm/yr"}
        `);
    })
    .on("mouseleave.hover", () => {
      tooltip.style("display", "none");
    })
    .on("click.hover", event => {
      const [mx, my] = d3.pointer(event, mapSvg.node());
      const geo = projection.invert([mx, my]);
      if (!geo) return;
      const [lon, lat] = geo;

      const st = stateFeatures.find(f => d3.geoContains(f, [lon, lat]));
      if (!st) return;

      const stateCells = gridData.filter(row =>
        row.variable === currentVariable &&
        d3.geoContains(st, [row.lon180, row.lat])
      );

      drawTimeSeries(stateCells);
    });
}
