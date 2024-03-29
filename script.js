// Trip files
let regions = ['derbyshire','scotland','yorkshire'];

// Remove rope input
function removeRope(event) {
  event.target.parentNode.remove();
}

// Add rope input
function addRope(el) {
  let newInput = ropeInput.cloneNode(true);
  newInput.lastChild.disabled = false;
  newInput.firstChild.value = '';
  newInput.firstChild.onkeydown = handleTabs;
  addButton.parentNode.insertBefore(newInput, el.target ?? el);
  for (let el of document.getElementsByClassName('rope')) {
    el.lastChild.onclick = removeRope;
  };
  return newInput;
};
let addButton = document.getElementById('add');
addButton.onclick = addRope;

function handleTabs (event) {
  if (event.code == 'Tab') {
    let newInput = addRope(event.target.parentNode.nextElementSibling);
    event.preventDefault();
    newInput.firstChild.focus();

  }
}
let ropeInput = document.getElementsByClassName('rope')[0];
ropeInput.onkeydown = handleTabs;

// Create graph
let resultsGraph = document.getElementById('results-graph');
let chart = new Chart(resultsGraph, {
  type: 'scatter',
  data: {
    datasets: [{
      label: 'Options',
      labels: [''],
      data: [{}],
    }],
  },
  options: {
    scales: {
      x: {
        title: {
          display: true,
          text: 'Efficiency',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Possible trips',
        },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(ctx) {
            return `Efficiency: ${ctx.parsed.x}, Trips: ${ctx.parsed.y} ${ctx.dataset.labels[ctx.dataIndex]}`;
          }
        }
      }
    },
    animation: false,
  }
});

// Handle reset button
let chart_checkbox = document.getElementById('graph');
let pf_checkbox = document.getElementById('paretofrontier');
let tableData = document.getElementById('results-data');
let resetButton = document.getElementById('reset');
resetButton.onclick = function reset() {
  // remove all rope inputs
  for (let el of document.querySelectorAll('.rope')) {
    if (!el.lastChild.disabled) {
      el.remove();
    } else {
      el.firstChild.value = '';
    };
  };
  Array.from(document.getElementsByClassName('cut')).forEach(el => el.checked = false);
  chart_checkbox.checked = true;
  pf_checkbox.checked = false;
  // Reset outputs
  tableData.innerHTML = '';
  chart.data.datasets[0].data.length = 1;
  chart.data.datasets[0].labels.length = 1;
  chart.update();
};

// Handle go button
let spinner = document.getElementById('spinner');
let results_table = document.getElementById('results-table');
let goButton = document.getElementById('go');
goButton.onclick = function calculate() {

  // Reset output
  spinner.className = 'spinner';
  tableData.innerHTML = '';
  chart.data.datasets[0].data.length = 1;
  chart.data.datasets[0].labels.length = 1;
  chart.update();

  // Get user rope details
  let resn = document.getElementById('resolution').value;
  let set_ropes = [];
  let cuttable_ropes = [];
  for (let el of document.getElementsByClassName('rope')) {
    let rope = parseInt(el.firstChild.value);
    if (rope) {
      if (el.children[1].lastChild.checked) {
        cuttable_ropes.push(rope);
      } else {
        set_ropes.push(rope);
      }
    }
  }
  set_ropes.sort((a,b) => a > b);

  // Get trip lengths
  Promise.all(
    regions.map(region => 
    fetch(`https://raw.githubusercontent.com/aricooperdavis/what-can-I-rig/main/pitchlengths/${region}.txt`)
      .then(response => response.text())
  )).then((result) => {

    // Parse and sort pitch lengths
    trips = result.join('').split('\n').filter(
      line => !(line.startsWith('#') | line.length < 3)
    ).map(
      trip => (
        trip.includes('[') ? trip.split(',').slice(3,) : trip.split(',').slice(1,)
      ).map(
        pitch => parseInt(pitch)
      ).sort((a,b) => a > b)
    ).sort((a,b) => (a.length < b.length));
    let possible_trips_label = document.getElementById('results-table-possible-trips');
    possible_trips_label.textContent = `Possible trips (of ${trips.length})`;
    
    // Determine all cut options
    all_cuts = [];
    cuttable_ropes.forEach(cr => {
      let _cuts = combos(Math.floor(cr/resn)).map(c => c.map(r => r*resn));
      all_cuts.push(_cuts);
    });

    // Calculate possible trips for all combinations
    let results = [];
    if (all_cuts.length == 0) {
      let [_count, _score] = scoreRopes(trips, set_ropes);
      results.push([_count, _score, set_ropes]);
    } else {
      let opts = cartesian(...all_cuts);
      for (let opt of opts) {
        let _opt = [...set_ropes, ...opt].flat().sort((a,b) => (a > b));
        let [_count, _score] = scoreRopes(trips, _opt);
        results.push([_count, _score, opt]);
      }
    }

    // Filter so results are unique
    results = new Set(results.map(JSON.stringify));
    results = Array.from(results).map(JSON.parse);
    // Calculate paretofrontier
    if (pf_checkbox.checked) {
      results = getParetoFrontier(results);
    }
    // Update DOM with results
    for (let r = 0; r < results.length; r++) {
      let result = results[r];
      let row = `<tr><td>${JSON.stringify(result[2])}</td><td>${result[0]}</td><td>${result[1]}</td></tr>`;
      tableData.insertAdjacentHTML('beforeend', row);
      plotOption(result[1], result[0], JSON.stringify(result[2])); 
    }

  }).then(() => {
    spinner.className = 'spinner--hidden';
    if (chart_checkbox.checked) chart.update();
  });
};

// Score a given set of ropes using a given set of trips. This score is the
// efficiency, that is on average how much of the carried rope is used to rig
// the trips.
// Parameters: list of trips sorted by ascending pitch lengths, list of ropes
// sorted by ascending rope length
// Returns: a trip count and a score
function scoreRopes(trips, ropes) {
  let count = 0;
  let score = 0;
  for (let t = 0; t < trips.length; t++) {
    let trip = trips[t];
    // Shortcut obviously impossible trips
    if (trip.length > ropes.length || Math.max(...trip) > Math.max(...ropes)) continue;
    let trip_score = 0;
    let p = 0;
    let r = 0;
    while (p < trip.length && r < ropes.length) {
      // Rope is too small for pitch
      if (trip[p] > ropes[r]) {
        r++;
      // Rope is used for pitch
      } else {
        let pitch_score = (trip[p]/ropes[r]);
        p++;
        trip_score += (pitch_score-trip_score)/p; // https://math.stackexchange.com/questions/106700/incremental-averaging
        r++;
      }
    }
    // Run out of ropes
    if (p < trip.length) {
      continue;
    // Successfully allocated ropes
    } else {
      count++;
      score += (trip_score-score)/count;
    }
  }
  return [count, score.toFixed(3)];
}

// Plot option on chart
function plotOption(score, trips, label) {
  chart.data.datasets[0].labels.push(label);
  chart.data.datasets[0].data.push({
    x: score,
    y: trips,
  });
}

// Get cartesian product of multiple arrays (select 1 element from each array)
function* cartesian(head, ...tail) {
  const remainder = tail.length > 0 ? cartesian(...tail) : [[]];
  for (let r of remainder) for (let h of head) yield [h, ...r];
}

// Get all possible combinations of positive integers that sum to `n`
function combos(n) {
  const cache = [[], [[1]], [[2], [1, 1]]];
  return [...(new Set([...combo(n).map(v => v.join(','))]))].map(v=>v.split(',').map(w=>parseInt(w)));

  function combo(n) {
      var a = n - 1, b, insert;
      if (cache[n]) { return cache[n] }

      const res = n % 2 ? [[n]] : [[n], [n >> 1, n >> 1]];
      while (a > n - a) {
          b = n - a;
          for (const sub of combo(a--)) {
              const subRes = [];
              insert = true;
              for (const v of sub) {
                  v > b || !insert ? subRes.push(v) : (insert = false, subRes.push(b, v)); 
              }
              insert && subRes.push(b);
              res.push(subRes);
          }
      }
      return cache[n] = res;
  }
}