// vim: ts=2 sw=2 et ai
/*
  Eki Navigator
  Copyright (C) 2022 真空 et al.

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

globalThis.loadPage = async (url) => {
  let tabObj = await browser.tabs.create({
    url,
    active: false,
  });

  const targetTabId = tabObj.id;
  tabObj = await new Promise((res) => {
    const loadedListener = (tabId, changeInfo, tabObj) => {
      if (tabObj.status != 'complete') {
        return;
      }
      if (tabId != targetTabId) {
        return;
      }
      browser.tabs.onUpdated.removeListener(loadedListener);
      console.log('Loaded: %s', tabObj.url);
      res(tabObj);
    };
    browser.tabs.onUpdated.addListener(loadedListener, {
      tabId: tabObj.id,
    });
  });

  return tabObj;
};

globalThis.openAreas = async () => {
  let tabObj = await loadPage('https://ekitan.com/timetable/railway');

  const results = await browser.tabs.executeScript(tabObj.id, {
    code: `
      const areas = document.querySelectorAll('.mt30 li > a');
      const data = {};
      for (const area of areas) {
        const key = area.textContent.trim();
        data[key] = area.href;
      }
      data;
    `
  });
  await browser.tabs.remove(tabObj.id);
  return results[0];
};

globalThis.getAreaLines = async (areaUrl) => {
  let tabObj = await loadPage(areaUrl);

  const results = await browser.tabs.executeScript(tabObj.id, {
    code: `
      const lines = document.querySelectorAll('.tab2-content ul li > a');
      const data = {};
      for (const line of lines) {
        const key = line.textContent.trim();
        data[key] = line.href;
      }
      data;
    `
  });
  await browser.tabs.remove(tabObj.id);
  return results[0];
};

globalThis.getStations = async (lineUrl, dt) => {
  let tabObj = await loadPage(lineUrl + '?dt=' + encodeURIComponent(dt));

  const results = await browser.tabs.executeScript(tabObj.id, {
    code: `
      const line = document.querySelector('h1[data-event_rep="ぱんくず-駅探"]').textContent.trim();
      const stations = document.querySelectorAll('.timetable-area li > a');
      const data = {
        urls: [],
        stations: [],
        line,
      };
      for (const station of stations) {
        data.urls.push(station.href);
      }
      const stations2 = document.querySelectorAll('.timetable-area dt > a');
      for (const station of stations2) {
        data.stations.push({
          url: station.href,
          name: station.textContent.trim(),
        })
      }
      data.urls = [... new Set(data.urls)];
      data;
    `
  });
  await browser.tabs.remove(tabObj.id);
  return results[0];
};

globalThis.getTrains = async (lineStationUrl, date) => {
  let tabObj = await loadPage(lineStationUrl + '?dt=' + encodeURIComponent(date));

  const results = await browser.tabs.executeScript(tabObj.id, {
    code: `
      const data = {
        trains: []
      };
      try {
        const tabNames = document.querySelectorAll('.ek-direction_tab');
        const tabs = document.querySelectorAll('.search-result .tab-content-inner');
        let i = 0;
        for (const tab of tabs) {
          const direction = tabNames[i].textContent.trim();
          const stations = tab.querySelectorAll('.ek-train-tooltip');
          for (const station of stations) {
            const trainData = {};
            const link = station.querySelector('a.ek-train-link');
            trainData.url = link.href;
            trainData.dest = station.dataset.dest;
            trainData.type = station.dataset.trType;
            trainData.direction = direction;
            trainData.directionId = tabNames[i].dataset.ekDirection_code - 1;
            data.trains.push(trainData);
          }
          i++;
        }
         
        data.date = document.querySelector('.search-result-footer .date').textContent.trim();
      } catch (e) {
        console.error(e);
      }
      data;
    `
  });
  await browser.tabs.remove(tabObj.id);
  return results[0];
};

globalThis.getLineTrains = async (lineUrl, dt) => {
  const lineStationUrls = await getStations(lineUrl, dt);
  const data = new Map;
  let date;
  for (const lineStationUrl of lineStationUrls.urls) {
    const results = await getTrains(lineStationUrl, dt);
    if (!results || !results.trains) {
      console.log('Skipping data:', results);
      continue;
    }
    for (const result of results.trains) {
      const [normalized, url] = normalizeTrainUrl(result.url);
      const urlObj = new URL(url);
      const tx = urlObj.searchParams.get('tx');
      data.set(normalized, {
        url,
        trainId: tx.split('-')[2],
        trainId2: tx.split('-').slice(-2).join('-'),
        dest: result.dest,
        type: result.type,
        direction: result.direction,
        directionId: result.directionId,
      });
      if (results.date) {
        date = results.date;
      }
    }
  }
  const lineId = lineUrl.split('/').filter(a => a).slice(-1)[0];
  return {
    stations: lineStationUrls.stations,
    line: lineStationUrls.line,
    trainUrls: [... data.values()],
    date,
    railwayData: {
      "改正日": date,
      created: date,
      "データ取得元": "駅探",
      "注意事項": "このデータを私的利用の範囲を超えて公開すると、著作権法に触れる可能性があります。",
      lineId,
    }
  };
};

globalThis.normalizeTrainUrl = (trainUrl) => {
  const url = new URL(trainUrl);
  const sf = url.searchParams.get('sf');
  const tx = url.searchParams.get('tx');
  const dt = url.searchParams.get('dt');
  const normalized = new URLSearchParams;
  normalized.set('tx', tx);
  normalized.set('dt', dt);
  url.searchParams.delete('dw');
  url.searchParams.delete('departure');
  url.searchParams.delete('SFF');
  url.searchParams.delete('d');
  url.searchParams.set('departure', '');
  return [normalized + '', url + ''];
};

globalThis.getTrainDetails = async (trainUrl) => {
  let tabObj = await loadPage(trainUrl);

  const results = await browser.tabs.executeScript(tabObj.id, {
    code: `
      {
        const stations = document.querySelectorAll('.result-route-transfer');
        const data = [];
        for (const station of stations) {
          const stationData = {};
          stationData.station = station.querySelector('.td-station-name').textContent.trim();
          const times = station.querySelector('.td-dep-and-arr-time').innerHTML.split('<br>').map(a => a.trim()).filter(a => a);
          stationData.times = times;
          data.push(stationData);
        }
        data;
      }
    `
  });
  await browser.tabs.remove(tabObj.id);
  return results[0];
};

globalThis.getLineTrainsAll = async (lineUrl, dt) => {
  const data = await getLineTrains(lineUrl, dt);
  for (const train of data.trainUrls) {
    const trainData = await getTrainDetails(train.url);
    train.data = trainData;
  }
  const result = {};
  result.railwayData = data.railwayData;
  result.railwayData.name = data.line || '';
  result.stations = data.stations.map((station) => {
    return {
      name: station.name.replace(/駅($|\(.*)/gu, '$1'),
      url: station.url,
    };
  });
  result.trainURLList = {};
  result.stationTimeList = {};
  result.types = {};
  result.trains = {};
  const timetableId = data.railwayData.created;
  result.trains[timetableId] = {};
  for (const train of data.trainUrls) {
    if (!result.trainURLList[train.trainId]) {
      result.trainURLList[train.trainId] = {};
    }
    result.trainURLList[train.trainId][train.trainId2] = {
      url: train.url,
    };
    let firstStation = '';
    const timetable = [];
    for (const station of train.data) {
      if (!firstStation) {
        firstStation = station.station;
      }
      const oldTimes = station.times;
      const times = station.times.map(time => time.replace(/[^0-9:]/gu, ''));
      const time = times.slice(-1)[0].replace(/:/gu, '');
      const key = `${time}-${station.station}-${train.trainId}`;
      result.stationTimeList[key] = {
        type: train.type,
        destination: train.dest,
        direction: train.directionId,
      };
      const timetableData = {};
      timetableData.name = station.station;
      timetableData.direction = train.directionId ? 'DN' : 'UP';
      if (times[1]) {
        timetableData.arr = times[0];
        timetableData.dep = times[1];
      } else {
        const time = times[0];
        const oldTime = oldTimes[0];
        if (oldTime.match(/着/u)) {
          timetableData.arr = time;
          timetableData.dep = null;
        } else {
          timetableData.arr = null;
          timetableData.dep = time;
        }
      }
      timetableData.platform = '';
      timetableData.number = train.trainId;
      timetableData.type = train.type;
      timetableData.destination = train.dest;
      timetableData.note = [];
      timetable.push(timetableData);
    }
    if (!result.types[train.type]) {
      result.types[train.type] = {
        short: train.type,
        class: [],
        colorCode: '#000000',
      };
    }
    const key = `${train.trainId}:${firstStation}-${train.dest}:0:`;
    result.trains[timetableId][key] = {
      url: train.url,
      number: train.trainId,
      origin: firstStation,
      destination: train.dest,
      via: null,
      type: train.type,
      name: [''],
      distance: 0,
      direction: null,
      fareType: null,
      note: [],
      timetable,
    }
  }
  return result;
};

globalThis.downloadResult = async (data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type : 'application/json'});
  const url = URL.createObjectURL(blob);
  const date = (new Date).toLocaleDateString('ja',{year: 'numeric', month: '2-digit', day: '2-digit'}).replaceAll('/', '');
  try {
    await browser.downloads.download({
      url,
      filename: `eki-navigator_${data.railwayData.name}_${date}_${+new Date}.json`,
      saveAs: false,
      conflictAction: 'uniquify',
    });
  } finally {
    console.log('Download queued');
  }
};

const queue = [];
let running = false;
globalThis.runQueue = async () => {
  if (running) {
    return;
  }
  running = true;
  while (queue.length) {
    const message = queue.shift();
    try {
      const data = await getLineTrainsAll(message.lineUrl, message.dt);
      await downloadResult(data);
    } catch (e) {
      console.error(e);
    }
  }
  running = false;
};

globalThis.queueTask = (message) => {
  queue.push(message);
  runQueue().catch((e) => {
    console.error(e);
  });
};

browser.runtime.onMessage.addListener((message) => {
  if (message.type == 'get_areas') {
    return openAreas();
  } else if (message.type == 'get_area_lines') {
    return getAreaLines(message.areaUrl);
  } else if (message.type == 'queue_fetch_line') {
   queueTask(message);
   return Promise.resolve();
  }
  return false;
});
