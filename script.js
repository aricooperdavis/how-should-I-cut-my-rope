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
          text: 'Cuts',
        },
        beginAtZero: true,
      },
      y: {
        title: {
          display: true,
          text: 'Possible trips',
        },
        beginAtZero: true,
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(ctx) {
            return `Cuts: ${ctx.parsed.x}, Trips: ${ctx.parsed.y} ${ctx.dataset.labels[ctx.dataIndex]}`;
          }
        }
      }
    },
  }
});

// Handle reset button
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
  // remove results data
  tableData.innerHTML = '';
  // Uncheck cut
  Array.from(document.getElementsByClassName('cut')).forEach(el => el.checked = false);
};

// Handle go button
let results_table = document.getElementById('results-table');
let goButton = document.getElementById('go');
goButton.onclick = function calculate() {

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
  set_ropes.sort((a,b) => a < b);

  // Reset output
  tableData.innerHTML = '';

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
      ).sort((a,b) => a < b)
    ).sort((a,b) => (a.length > b.length));
    
    // Determine all cut options
    all_cuts = [];
    cuttable_ropes.forEach(cr => {
      let _cuts = combos(Math.floor(cr/resn)).map(c => c.map(r => r*resn));
      all_cuts.push(_cuts);
    });

    // Calculate possible trips for all combinations
    if (all_cuts.length == 0) {
      let _count = possibleTripsCount(trips, set_ropes);
      let row = `<tr><td>${0}</td><td>${JSON.stringify(set_ropes)}</td><td>${_count}</td></tr>`;
      tableData.insertAdjacentHTML('beforeend', row);
      plotOption(0, _count, JSON.stringify(set_ropes));
    } else {
      let opts = cartesian(...all_cuts);
      for (let opt of opts) {
        let _opt = [...set_ropes, ...opt].flat().sort().reverse();
        let _cuts = opt.map(x=>x.length).reduce((a,b)=>a+b,0)-1;
        let _count = possibleTripsCount(trips, _opt);
        let row = `<tr><td>${_cuts}</td><td>${JSON.stringify(opt)}</td><td>${_count}</td></tr>`;
        tableData.insertAdjacentHTML('beforeend', row);
        plotOption(_cuts, _count, JSON.stringify(opt));
      }
    }
  });
};

// Plot option on chart
function plotOption(cutsCount, possibleTripsCount, label) {
  chart.data.datasets[0].labels.push(label);
  chart.data.datasets[0].data.push({
    x: cutsCount,
    y: possibleTripsCount,
  });
  chart.update();
}

// N.b. trips is array (sorted by increasing rope-count) of arrays (sorted by decreasing rope-length)
// ropes is sorted by decreasing rope-length
function possibleTripsCount(trips, ropes) {
  let count = 0;
  for (let t = 0; t < trips.length; t++) {
    let trip = trips[t];
    // Short circuit where possible
    if (trip.length > ropes.length) break;
    if (trip[0] > ropes[0]) continue;
    // Count possible trips
    if (trip.every((pitch, i) => pitch <= ropes[i])) count++;
  }
  return count;
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