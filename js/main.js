const mapWidth = 600;
const mapHeight = 400;

const areaWidth = 600;
const areaHeight = 400;
const areaMargin = { top: 30, right: 20, bottom: 40, left: 60 };

const areaInnerWidth = areaWidth - areaMargin.left - areaMargin.right;
const areaInnerHeight = areaHeight - areaMargin.top - areaMargin.bottom;

const tooltipChartWidth = 200;
const tooltipChartHeight = 120;

const worldGeoJsonUrl =
    "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";

const svgMap = d3.select("#map")
    .append("svg")
    .attr("width", mapWidth)
    .attr("height", mapHeight);

const mapGroup = svgMap.append("g")
    .attr("class", "map-group");

const svgArea = d3.select("#stacked-area")
    .append("svg")
    .attr("width", areaWidth)
    .attr("height", areaHeight);

const areaPlot = svgArea.append("g")
    .attr("transform", `translate(${areaMargin.left},${areaMargin.top})`);

const xArea = d3.scaleLinear().range([0, areaInnerWidth]);
const yArea = d3.scaleLinear().range([areaInnerHeight, 0]);
const colorArea = d3.scaleOrdinal(d3.schemeTableau10);

const xAxisArea = areaPlot.append("g")
    .attr("transform", `translate(0,${areaInnerHeight})`)
    .attr("class", "axis x-axis");

const yAxisArea = areaPlot.append("g")
    .attr("class", "axis y-axis");

areaPlot.append("text")
    .attr("class", "x-label")
    .attr("text-anchor", "middle")
    .attr("x", areaInnerWidth / 2)
    .attr("y", areaInnerHeight + 30)
    .text("Year");

areaPlot.append("text")
    .attr("class", "y-label")
    .attr("text-anchor", "middle")
    .attr("transform", `translate(${-45},${areaInnerHeight / 2}) rotate(-90)`)
    .text("Capture fisheries production (metric tons)");

const legendGroup = svgArea.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${areaMargin.left},10)`);

const tooltip = d3.select("#tooltip");
const tooltipTitle = tooltip.select(".tooltip-title");
const tooltipChart = d3.select("#tooltip-chart");

const areaTooltip = d3.select("#area-tooltip");
const areaTooltipTitle = areaTooltip.select(".tooltip-title");
const areaTooltipBody = areaTooltip.select(".tooltip-body");

const yearSlider = document.getElementById("year-slider");
const yearLabel = document.getElementById("year-label");
const resetButton = document.getElementById("reset-selection");

function getFeatureCode(f) {
    const cand =
        f.id ||
        (f.properties && (
            f.properties.iso_a3 ||
            f.properties.ISO_A3 ||
            f.properties.adm0_a3 ||
            f.properties.ADM0_A3
        ));
    return (cand ? String(cand) : "").trim().toUpperCase();
}


Promise.all([
    d3.csv("data/proj.csv", d => {
        const cleanCode = (d.Code || "").trim().toUpperCase();
        return {
            Entity: d.Entity,
            Code: cleanCode,
            Year: +d.Year,
            production: +d["Capture fisheries production (metric tons)"] || 0
        };
    }),
    d3.json(worldGeoJsonUrl)
]).then(([rawData, world]) => {

    const data = rawData.filter(d => d.Code && d.Code.length === 3);

    const years = Array.from(new Set(data.map(d => d.Year))).sort(d3.ascending);
    const minYear = d3.min(years);
    const maxYear = d3.max(years);

    const dataByCode = d3.group(data, d => d.Code);
    const dataByYear = d3.group(data, d => d.Year);

    const codeToName = new Map();
    data.forEach(d => {
        if (!codeToName.has(d.Code)) codeToName.set(d.Code, d.Entity);
    });

    const wideData = years.map(year => {
        const row = { year: year };
        const rowEntries = dataByYear.get(year) || [];
        rowEntries.forEach(d => {
            row[d.Code] = d.production;
        });
        return row;
    });

    let currentAreaKeys = [];


    const projection = d3.geoNaturalEarth1()
        .fitSize([mapWidth, mapHeight], world);

    const path = d3.geoPath().projection(projection);

    const selectedCodes = new Set();

    mapGroup.selectAll("path.country")
        .data(world.features)
        .join("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("fill", "#f0f0f0")
        .on("mousemove", (event, d) => {
            const code = getFeatureCode(d);
            const name =
                (d.properties && d.properties.name) ||
                codeToName.get(code) ||
                "Unknown";
            showTooltip(event, code, name, dataByCode);
        })
        .on("mouseout", hideTooltip)
        .on("click", (event, d) => {
            const code = getFeatureCode(d);
            if (!codeToName.has(code)) return;

            if (selectedCodes.has(code)) {
                selectedCodes.delete(code);
            } else {
                selectedCodes.add(code);
            }

            mapGroup.selectAll("path.country")
                .classed("selected", f => selectedCodes.has(getFeatureCode(f)));

            updateStackedArea(selectedCodes, wideData, years, codeToName);
        });

    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on("zoom", (event) => {
            mapGroup.attr("transform", event.transform);
        });

    svgMap.call(zoom);

    yearSlider.min = minYear;
    yearSlider.max = maxYear;
    yearSlider.step = 1;
    yearSlider.value = maxYear;
    yearLabel.textContent = maxYear;

    yearSlider.addEventListener("input", () => {
        const year = +yearSlider.value;
        yearLabel.textContent = year;
        updateMapColors(year);
    });

    function updateMapColors(year) {
        const yearData = dataByYear.get(year) || [];
        const byCode = new Map(yearData.map(d => [d.Code, d.production]));
        const maxProd = d3.max(yearData, d => d.production) || 1;

        const maxLog = Math.log10(maxProd + 1);
        const colorMap = d3.scaleSequential(d3.interpolateGnBu)
            .domain([0, maxLog]);

        mapGroup.selectAll("path.country")
            .transition()
            .duration(400)
            .attr("fill", d => {
                const code = getFeatureCode(d);
                const val = byCode.get(code) || 0;
                if (val <= 0) return "#f0f0f0";
                return colorMap(Math.log10(val + 1));
            });
    }

    updateMapColors(maxYear);

    function showTooltip(event, code, name, dataByCode) {
        const series = dataByCode.get(code);

        const container = document.getElementById("map-container");
        const [x, y] = d3.pointer(event, container);

        tooltip.style("display", "block");

        const tooltipNode = tooltip.node();
        const tooltipWidth = tooltipNode.offsetWidth || 230;
        const tooltipHeight = tooltipNode.offsetHeight || 140;

        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;

        let left = x + 15;
        let top = y + 15;

        if (left + tooltipWidth > containerWidth - 10) {
            left = x - tooltipWidth - 15;
        }

        if (top + tooltipHeight > containerHeight - 10) {
            top = y - tooltipHeight - 15;
        }

        tooltip
            .style("left", left + "px")
            .style("top", top + "px");

        tooltipTitle.text(name + " (" + code + ")");

        tooltipChart.selectAll("*").remove();

        if (!series) {
            tooltipChart.append("text")
                .attr("x", 10)
                .attr("y", 20)
                .text("No data available");
            return;
        }

        const seriesSorted = series.slice().sort((a, b) =>
            d3.ascending(a.Year, b.Year)
        );

        const xScale = d3.scaleLinear()
            .domain(d3.extent(seriesSorted, d => d.Year))
            .range([35, tooltipChartWidth - 10]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(seriesSorted, d => d.production) || 1])
            .nice()
            .range([tooltipChartHeight - 20, 10]);

        const xAxis = d3.axisBottom(xScale)
            .ticks(4)
            .tickFormat(d3.format("d"));

        const yAxis = d3.axisLeft(yScale).ticks(3);

        tooltipChart.append("g")
            .attr("transform", `translate(0,${tooltipChartHeight - 20})`)
            .attr("class", "axis")
            .call(xAxis);

        tooltipChart.append("g")
            .attr("transform", `translate(35,0)`)
            .attr("class", "axis")
            .call(yAxis);

        const line = d3.line()
            .x(d => xScale(d.Year))
            .y(d => yScale(d.production));

        tooltipChart.append("path")
            .datum(seriesSorted)
            .attr("fill", "none")
            .attr("stroke", "#1f77b4")
            .attr("stroke-width", 1.5)
            .attr("d", line);
    }

    function hideTooltip() {
        tooltip.style("display", "none");
    }


    function updateStackedArea(selectedCodesSet, wideData, years, codeToName) {
        const keys = Array.from(selectedCodesSet).sort();

        currentAreaKeys = keys;

        if (keys.length === 0) {
            areaPlot.selectAll(".layer").remove();
            xArea.domain(d3.extent(years));
            yArea.domain([0, 1]);
            xAxisArea.call(d3.axisBottom(xArea).tickFormat(d3.format("d")));
            yAxisArea.call(d3.axisLeft(yArea));
            updateLegend([], codeToName);
            return;
        }

        xArea.domain(d3.extent(years));

        const stack = d3.stack()
            .keys(keys)
            .value((d, key) => d[key] || 0);

        const stackedSeries = stack(wideData);

        const maxY = d3.max(stackedSeries, serie =>
            d3.max(serie, d => d[1])
        ) || 1;

        yArea.domain([0, maxY]).nice();

        const areaGen = d3.area()
            .x(d => xArea(d.data.year))
            .y0(d => yArea(d[0]))
            .y1(d => yArea(d[1]));

        const layers = areaPlot.selectAll("path.layer")
            .data(stackedSeries, d => d.key);

        layers.enter()
            .append("path")
            .attr("class", "layer")
            .attr("fill", d => colorArea(d.key))
            .attr("opacity", 0.9)
            .attr("d", d => areaGen(d));

        layers
            .attr("fill", d => colorArea(d.key))
            .attr("d", d => areaGen(d));

        layers.exit().remove();

        xAxisArea.call(d3.axisBottom(xArea)
            .ticks(6)
            .tickFormat(d3.format("d")));

        yAxisArea.call(d3.axisLeft(yArea).ticks(6));

        updateLegend(keys, codeToName);
    }

    const areaOverlay = areaPlot.append("rect")
        .attr("class", "area-overlay")
        .attr("width", areaInnerWidth)
        .attr("height", areaInnerHeight)
        .attr("fill", "none")
        .style("pointer-events", "all")
        .on("mousemove", areaMousemove)
        .on("mouseout", areaMouseout);

    function areaMousemove(event) {
        if (currentAreaKeys.length === 0) {
            areaTooltip.style("display", "none");
            return;
        }

        const container = document.getElementById("area-container");
        const [mx, my] = d3.pointer(event, container);

        areaTooltip.style("display", "block");

        const node = areaTooltip.node();
        const tooltipWidth = node.offsetWidth || 220;
        const tooltipHeight = node.offsetHeight || 120;

        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;

        let left = mx + 15;
        let top = my + 15;

        if (left + tooltipWidth > containerWidth - 10) {
            left = mx - tooltipWidth - 15;
        }
        if (top + tooltipHeight > containerHeight - 10) {
            top = my - tooltipHeight - 15;
        }

        areaTooltip
            .style("left", left + "px")
            .style("top", top + "px");

        const [px] = d3.pointer(event, areaPlot.node());
        let year = Math.round(xArea.invert(px));
        if (year < minYear) year = minYear;
        if (year > maxYear) year = maxYear;

        const idx = years.indexOf(year);
        if (idx === -1) {
            areaTooltip.style("display", "none");
            return;
        }

        areaTooltipTitle.text(`Year ${year}`);

        const values = currentAreaKeys.map(code => ({
            code,
            name: codeToName.get(code) || code,
            value: wideData[idx][code] || 0
        })).filter(d => d.value > 0);

        values.sort((a, b) => d3.descending(a.value, b.value));

        areaTooltipBody.selectAll("*").remove();

        if (values.length === 0) {
            areaTooltipBody.append("div").text("No data for this year.");
            return;
        }

        const rows = areaTooltipBody.selectAll("div.area-tooltip-row")
            .data(values)
            .enter()
            .append("div")
            .attr("class", "area-tooltip-row")
            .style("display", "flex")
            .style("justify-content", "space-between")
            .style("gap", "6px");

        rows.append("span")
            .text(d => d.name);

        rows.append("span")
            .style("font-weight", "600")
            .text(d => d3.format(",")(Math.round(d.value)));
    }

    function areaMouseout() {
        areaTooltip.style("display", "none");
    }


    function updateLegend(keys, codeToName) {
        legendGroup.selectAll("*").remove();
        if (!keys || keys.length === 0) return;

        const item = legendGroup.selectAll("g.legend-item")
            .data(keys)
            .join("g")
            .attr("class", "legend-item")
            .attr("transform", (d, i) => `translate(${i * 110},0)`)
            .on("click", (event, code) => {
                if (selectedCodes.has(code)) {
                    selectedCodes.delete(code);
                } else {
                    selectedCodes.add(code);
                }

                mapGroup.selectAll("path.country")
                    .classed("selected", f => selectedCodes.has(getFeatureCode(f)));

                updateStackedArea(selectedCodes, wideData, years, codeToName);
            });

        item.append("rect")
            .attr("width", 12)
            .attr("height", 12)
            .attr("fill", d => colorArea(d));

        item.append("text")
            .attr("x", 16)
            .attr("y", 10)
            .text(d => codeToName.get(d) || d);
    }

    resetButton.addEventListener("click", () => {
        selectedCodes.clear();

        mapGroup.selectAll("path.country")
            .classed("selected", false);

        updateStackedArea(selectedCodes, wideData, years, codeToName);
        areaTooltip.style("display", "none");
    });

    updateStackedArea(selectedCodes, wideData, years, codeToName);

}).catch(err => {
    console.error("Error loading files:", err);
});
