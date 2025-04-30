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
  // Count complaints by district (strip trailing "00" from CSV)
const complaintCounts = d3.rollup(
    complaints,
    v => v.length,
    d => d.district_occurrence.replace(/00$/, '')
  );

  // Group complaints by district and then by general classification
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


  
  // Attach complaint count to GeoJSON features
  geojson.features.forEach(feature => {
    const district = feature.properties.DIST_NUMC;
    feature.properties.complaints = complaintCounts.get(district) || 0;
    feature.properties.complaintTypes = complaintDetailsMap.get(district) || [];
  });
  

  // Set color scale (red = more complaints)
  const maxCount = d3.max(geojson.features, d => d.properties.complaints);
  const color = d3.scaleSequential(d3.interpolateReds).domain([0, maxCount]);

  // Fit projection
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
  
    const stopWords = new Set(["the", "and", "to", "of", "in", "a", "on", "for", "with", "at", "by", "an", "as", "was", "is", "from", "it", "that", "were", "be", "this", "or", "but", "off", "had"]);
  
    // Flatten all text, split into words
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
        .attr("transform", `translate(${950}, ${550})`) // adjust position
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
  
    // Clear old chart
    chartGroup.selectAll("*").remove();
  
    // Fill in missing categories with 0
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
  
    // X axis
    g.append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("font-size", "10px")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");
  
    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(4));
  
    // Bars
    g.selectAll("rect")
      .data(normalizedData)
      .enter().append("rect")
      .attr("x", d => x(d.type))
      .attr("y", d => y(d.count))
      .attr("width", x.bandwidth())
      .attr("height", d => height - y(d.count))
      .attr("fill", "darkred");
  
    // Bar labels
    g.selectAll(".bar-label")
      .data(normalizedData)
      .enter().append("text")
      .attr("x", d => x(d.type) + x.bandwidth() / 2)
      .attr("y", d => y(d.count) - 4)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text(d => d.count);
  
    // Chart title
    chartGroup.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", margin.top / 1.5)
        .attr("text-anchor", "middle")
        .attr("font-weight", "bold")
        .attr("font-size", "18px")
        .text(`Complaint Types in District ${districtNum}`);
  }
  

  // Draw regions
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
/*

//grab our canvas 
let svg = d3.select("#canvas");

//set the width and height
svg.attr('width',500)
    .attr('height',500)

//set up grid spacing
let spacing = 40;
let rows = 3;
let column = 10;

let data = d3.range(30).map(i => 5);
let rects = svg.selectAll("rect")
    .data(data)
    .join('rect')
    .attr("x", (d, i) => (i % column) * spacing)
    .attr("y", (d, i) => Math.floor(i / column) % rows * spacing)
    .attr("width", 30)
    .attr("height", 30)
    .attr("fill", "black");


// === Scrollytelling boilerplate === //
function scroll(n, offset, func1, func2){
    const el = document.getElementById(n)
    return new Waypoint({
        element: document.getElementById(n),
        handler: function(direction) {
            direction == 'down' ? func1() : func2();
        },
        //start 75% from the top of the div
        offset: offset
    });
    };

    function grid() {
        rects.transition()
            .delay((d, i) => 10 * i)
            .duration(400)
            .attr("fill", "black");
    }

    function grid2() {
        rects.transition()
            .delay((d, i) => 10 * i)
            .duration(400)
            .attr("fill", (d, i) => i >= 13 ? "#946234" : "gray");
    }

    function grid3() {
        rects.transition()
            .delay((d, i) => 10 * i)
            .duration(400)
            .attr("fill", (d, i) => (i >= 1 && i <= 12) ? "blue" : "gray");
    }

    function grid4() {
        rects.transition()
            .delay((d, i) => 10 * i)
            .duration(400)
            .attr("fill", (d, i) => i === 0 ? "green" : "gray");
    }

//trigger these functions on page scroll
new scroll('div2', '75%', grid2, grid);
new scroll('div3', '75%', grid3, grid2);
new scroll('div4', '75%', grid4, grid3);
new scroll('div5', '75%', grid, grid4);
*/

 
