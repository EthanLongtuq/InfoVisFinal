const width = 960;
const height = 600;
const tooltip = d3.select("#tooltip");
const svg = d3.select("#map")
  .attr("width", width)
  .attr("height", height);
const chartGroup = svg.append("g").attr("id", "chart-group");
const projection = d3.geoMercator().scale(1).translate([0, 0]);
const path = d3.geoPath().projection(projection);
const wordCloudGroup = svg.append("g").attr("id", "word-cloud-group");
const legendGroup = svg.append("g").attr("id", "legend-group");

const complaintCategories = [
    "DEPARTMENTAL VIOLATIONS",
    "CRIMINAL ALLEGATION",
    "DOMESTIC",
    "PHYSICAL ABUSE",
    "LACK OF SERVICE",
    "CIVIL RIGHTS COMPLAINT",
    "UNPROFESSIONAL CONDUCT",
    "VERBAL ABUSE",
    "HARASSMENT",
    "FALSIFICATION"
  ];

Promise.all([
  d3.json("Boundaries_District.geojson"),
  d3.csv("ppd_complaints.csv")
]).then(([geojson, complaints]) => {
const complaintCounts = d3.rollup(
    complaints,
    v => v.length,
    d => d.district_occurrence.replace(/00$/, '')
  );

const complaintDetails = d3.rollups(
  complaints,
  v => d3.rollups(
    v,
    vv => vv.length,
    d => d.general_cap_classification
  ),
  d => d.district_occurrence.replace(/00$/, '')
);

const complaintDetailsMap = new Map(
  complaintDetails.map(([district, types]) => [
    district,
    types.map(([type, count]) => ({ type, count }))
  ])
);

  geojson.features.forEach(feature => {
    const district = feature.properties.DIST_NUMC;
    feature.properties.complaints = complaintCounts.get(district) || 0;
    feature.properties.complaintTypes = complaintDetailsMap.get(district) || [];
  });
  
  const maxCount = d3.max(geojson.features, d => d.properties.complaints);
  const color = d3.scaleSequential(d3.interpolateGreens).domain([0, maxCount]);

  const bounds = path.bounds(geojson);
  const scale = 0.95 / Math.max(
    (bounds[1][0] - bounds[0][0]) / width,
    (bounds[1][1] - bounds[0][1]) / height
  );
  const translate = [
    (width - scale * (bounds[1][0] + bounds[0][0])) / 2,
    (height - scale * (bounds[1][1] + bounds[0][1])) / 2
  ];
  projection.scale(scale).translate(translate);

  function drawWordCloud(textArray) {
    const width = 400;
    const height = 300;
  
    wordCloudGroup.selectAll("*").remove();
  
    const stopWords = new Set(["with", "did", "or", "the", "a", "by", "from", "was", "then", "off", "that", "and", "it", "in", "had", "as", "were", "to", "on", "be", "at", "an", "this", "but", "for", "other", "is", "of"]);
  
    const words = textArray
      .join(" ")
      .toLowerCase()
      .match(/\b\w+\b/g)
      .filter(w => !stopWords.has(w) && w.length > 2);
  
    const freqMap = d3.rollup(
      words,
      v => v.length,
      d => d
    );
  
    const wordEntries = Array.from(freqMap, ([text, size]) => ({ text, size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 50);
  
    const layout = d3.layout.cloud()
      .size([width, height])
      .words(wordEntries)
      .padding(3)
      .rotate(() => 0)
      .fontSize(d => 10 + d.size * 2)
      .on("end", draw);
  
    layout.start();
  
    function draw(words) {
      wordCloudGroup
        .attr("transform", `translate(${950}, ${550})`)
        .selectAll("text")
        .data(words)
        .enter().append("text")
        .style("font-size", d => `${d.size}px`)
        .style("fill", "black")
        .attr("text-anchor", "middle")
        .attr("transform", d => `translate(${d.x},${d.y})rotate(${d.rotate})`)
        .text(d => d.text);
    }
  }

  function drawBarChart(data, districtNum) {
    const chartWidth = 400;
    const chartHeight = 300;
    const margin = { top: 30, right: 10, bottom: 40, left: 40 };
    const width = chartWidth - margin.left - margin.right;
    const height = chartHeight - margin.top - margin.bottom;
  
    chartGroup.selectAll("*").remove();
  
    const normalizedData = complaintCategories.map(cat => {
      const match = data.find(d => d.type === cat);
      return { type: cat, count: match ? match.count : 0 };
    });
  
    const x = d3.scaleBand()
      .domain(complaintCategories)
      .range([0, width])
      .padding(0.1);
  
    const y = d3.scaleLinear()
      .domain([0, d3.max(normalizedData, d => d.count)]).nice()
      .range([height, 0]);
  
    const g = chartGroup
      .attr("transform", `translate(${850}, ${50})`)
      .append("g");
  
    //x axis
    g.append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("font-size", "10px")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");
  
    //y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(4));
  
    //bars
    g.selectAll("rect")
      .data(normalizedData)
      .enter().append("rect")
      .attr("x", d => x(d.type))
      .attr("y", d => y(d.count))
      .attr("width", x.bandwidth())
      .attr("height", d => height - y(d.count))
      .attr("fill", "darkgreen");
  
    //labels
    g.selectAll(".bar-label")
      .data(normalizedData)
      .enter().append("text")
      .attr("x", d => x(d.type) + x.bandwidth() / 2)
      .attr("y", d => y(d.count) - 4)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text(d => d.count);
  
    //title
    chartGroup.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", margin.top / 1.5)
        .attr("text-anchor", "middle")
        .attr("font-weight", "bold")
        .attr("font-size", "18px")
        .text(`Complaint Types in District ${districtNum}`);
  }

  function drawLegend(colorScale) {
    const legendWidth = 300;
    const legendHeight = 10;
  
    const legendMargin = { top: 20, right: 20, bottom: 40, left: 20 };
    const x = d3.scaleLinear()
      .domain(colorScale.domain())
      .range([0, legendWidth]);
    const defs = svg.append("defs");
    const linearGradient = defs.append("linearGradient")
      .attr("id", "legend-gradient");
  
    linearGradient.selectAll("stop")
      .data(d3.ticks(0, 1, 10))
      .enter().append("stop")
      .attr("offset", d => `${d * 100}%`)
      .attr("stop-color", d => colorScale(d * colorScale.domain()[1]));
  
    legendGroup.append("rect")
      .attr("x", 250)
      .attr("y", height - legendMargin.bottom + 50)
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .style("fill", "url(#legend-gradient)");
  
    //axis
    const axisBottom = d3.axisBottom(x)
      .ticks(5)
      .tickFormat(d3.format("d"));
  
    legendGroup.append("g")
      .attr("transform", `translate(250, ${height - legendMargin.bottom + legendHeight + 50})`)
      .call(axisBottom);
  
    //label
    legendGroup.append("text")
      .attr("x", 250 + legendWidth / 2)
      .attr("y", height - legendMargin.bottom + 40)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("Number of Complaints");
  }
  
  drawLegend(color);
  //regions
  svg.selectAll("path")
    .data(geojson.features)
    .enter().append("path")
    .attr("d", path)
    .attr("fill", d => color(d.properties.complaints))
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .on("mouseover", function(event, d) {
      tooltip.style("display", "block")
        .html(`District ${d.properties.DIST_NUMC}<br>${d.properties.complaints} complaints`);
      d3.select(this).attr("stroke", "black").attr("stroke-width", 1.5);
    })
    .on("mousemove", function(event) {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      tooltip.style("display", "none");
      d3.select(this).attr("stroke", "#333").attr("stroke-width", 0.5);
    })
    .on("click", function(event, d) {
        drawBarChart(d.properties.complaintTypes, d.properties.DIST_NUMC);
      
        const districtSummaries = complaints
          .filter(c => c.district_occurrence.replace(/00$/, '') === d.properties.DIST_NUMC)
          .map(c => c.summary || "");
      
        drawWordCloud(districtSummaries);
      });
    console.log([...complaintCounts.entries()]);
});
