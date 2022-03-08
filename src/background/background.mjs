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

globalThis.openAreas = async () => {
  //
  let tabObj = browser.tabs.create({
    url: 'https://ekitan.com/timetable/railway',
    active: false,
  });

  tabObj = await new Promise((res) => {
    const loadedListener = (tabId, changeInfo, tabObj) => {
      if (tabObj.status != 'complete') {
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
  let tabObj = browser.tabs.create({
    url: areaUrl,
    active: false,
  });

  tabObj = await new Promise((res) => {
    const loadedListener = (tabId, changeInfo, tabObj) => {
      if (tabObj.status != 'complete') {
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
  let tabObj = browser.tabs.create({
    url: lineUrl + '?dt=' + encodeURIComponent(dt),
    active: false,
  });

  tabObj = await new Promise((res) => {
    const loadedListener = (tabId, changeInfo, tabObj) => {
      if (tabObj.status != 'complete') {
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

  const results = await browser.tabs.executeScript(tabObj.id, {
    code: `
      const stations = document.querySelectorAll('.timetable-area li > a');
      const data = {
        urls: [],
        stations: [],
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
  //
  let tabObj = browser.tabs.create({
    url: lineStationUrl,
    active: false,
  });

  tabObj = await new Promise((res) => {
    const loadedListener = (tabId, changeInfo, tabObj) => {
      if (tabObj.status != 'complete') {
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

  const results = await browser.tabs.executeScript(tabObj.id, {
    code: `
      {
        const tabNames = document.querySelectorAll('.ek-direction_tab');
        const tabs = document.querySelectorAll('.search-result .tab-content-inner');
        const data = {
          trains: []
        };
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
            data.trains.push(trainData);
          }
          i++;
        }
        
        data.date = document.querySelector('.search-result-footer .date').textContent.trim();
        data;
      }
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
    const results = await getTrains(lineStationUrl);
    for (const result of results.trains) {
      const [normalized, url] = normalizeTrainUrl(result.url);
      const urlObj = new URL(url);
      const tx = urlObj.searchParams.get('tx');
      data.set(normalized, {
        url,
        trainId: tx.split('-')[2],
        dest: result.dest,
        type: result.type,
        direction: result.direction,
      });
      date = results.date;
    }
  }
  const lineId = lineUrl.split('/').filter(a => a).slice(-1)[0];
  return {
    lineId,
    stations: lineStationUrls.stations,
    trainUrls: [... data.values()],
    date,
    railwayData: {
      "改正日": date,
      "データ取得元": "駅探",
      "注意事項": "このデータを私的利用の範囲を超えて公開すると、著作権法に触れる可能性があります。",
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
  let tabObj = browser.tabs.create({
    url: trainUrl,
    active: false,
  });

  tabObj = await new Promise((res) => {
    const loadedListener = (tabId, changeInfo, tabObj) => {
      if (tabObj.status != 'complete') {
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
  return data;
};

